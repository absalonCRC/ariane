use super::{parse, WIKI_LINKS};
use crate::{
    error::{AppResult, Result},
    model::Source,
    vaults,
};
use aho_corasick::AhoCorasick;
use rusqlite::Connection;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};

pub struct Sources {
    pub all: Vec<Source>,
    pub by_id: HashMap<String, usize>,
    pub titles: Vec<String>,
    pub aliases: Vec<(String, usize)>,
    pub matcher: Option<AhoCorasick>,
    pub links: Vec<HashSet<String>>,
}
impl Sources {
    fn new(all: Vec<Source>) -> Result<Self> {
        let titles: Vec<_> = all.iter().map(|s| parse::normalize(&s.title)).collect();
        let by_id = all
            .iter()
            .enumerate()
            .map(|(i, s)| (s.id.clone(), i))
            .collect();
        let mut first_names: HashMap<String, usize> = HashMap::new();
        let mut names: HashMap<String, HashSet<usize>> = HashMap::new();
        for (i, s) in all.iter().enumerate() {
            if s.kind == "Personne" {
                if let Some(first) = titles[i].split_whitespace().next() {
                    *first_names.entry(first.into()).or_default() += 1;
                }
            }
            for name in std::iter::once(&s.title).chain(s.aliases.iter()) {
                let name = parse::normalize(name);
                if !name.trim().is_empty() {
                    names.entry(name).or_default().insert(i);
                }
            }
        }
        let mut aliases: Vec<_> = names
            .into_iter()
            .filter_map(|(name, ids)| {
                if ids.len() != 1 {
                    return None;
                }
                let i = *ids.iter().next().unwrap();
                if all[i].kind == "Personne"
                    && name.split_whitespace().count() == 1
                    && first_names.get(&name).is_some_and(|n| *n > 1)
                {
                    return None;
                }
                Some((name, i))
            })
            .collect();
        aliases.sort_by(|a, b| a.0.cmp(&b.0));
        let matcher = if aliases.is_empty() {
            None
        } else {
            Some(AhoCorasick::new(aliases.iter().map(|(name, _)| name)).app()?)
        };
        let links = all
            .iter()
            .map(|s| {
                WIKI_LINKS
                    .captures_iter(&s.text)
                    .map(|c| parse::normalize(&c[1]))
                    .collect()
            })
            .collect();
        Ok(Self {
            all,
            by_id,
            titles,
            aliases,
            matcher,
            links,
        })
    }
}
pub struct Chunk {
    pub source: usize,
    pub page: Option<i64>,
    pub text: String,
    pub vector: Vec<f32>,
}
struct Cache {
    path: PathBuf,
    connection: Connection,
    scope: String,
    version: i64,
    sources: Arc<Sources>,
    chunks: Option<Arc<Vec<Chunk>>>,
    used: Instant,
}
static CACHE: LazyLock<Mutex<Option<Cache>>> = LazyLock::new(|| Mutex::new(None));
pub struct Snapshot {
    pub sources: Arc<Sources>,
    pub chunks: Option<Arc<Vec<Chunk>>>,
}

/// A persistent connection's data_version changes for every external commit, including
/// reindexing, deletion and direct SQLite edits. Scope is checked on every request.
pub fn snapshot(root: &Path, index: &Path, vectors: bool) -> Result<Snapshot> {
    let mut slot = CACHE.lock().map_err(|e| e.to_string())?;
    snapshot_in(&mut slot, root, index, vectors)
}
fn snapshot_in(
    slot: &mut Option<Cache>,
    root: &Path,
    index: &Path,
    vectors: bool,
) -> Result<Snapshot> {
    let vaults = vaults::list(root, index)?;
    let scope = serde_json::to_string(&(
        root,
        vaults.iter().map(|v| (&v.id, &v.scope)).collect::<Vec<_>>(),
    ))
    .app()?;
    if slot.as_ref().is_none_or(|cache| cache.path != index) {
        let connection = vaults::index_db(index)?;
        *slot = Some(Cache {
            path: index.into(),
            connection,
            scope: String::new(),
            version: -1,
            sources: Arc::new(Sources::new(vec![])?),
            chunks: None,
            used: Instant::now(),
        });
    }
    let cache = slot.as_mut().unwrap();
    let version = cache
        .connection
        .query_row("PRAGMA data_version", [], |r| r.get::<_, i64>(0))
        .app()?;
    // Read all rows for a rebuild in the same SQLite snapshot.
    let tx = cache.connection.unchecked_transaction().app()?;
    if version != cache.version || scope != cache.scope {
        let mut query = tx.prepare("SELECT payload FROM sources").app()?;
        let rows = query.query_map([], |r| r.get::<_, String>(0)).app()?;
        let mut all = vec![];
        for row in rows {
            let s: Source = serde_json::from_str(&row.app()?).app()?;
            if vaults::allowed(&s, &vaults) {
                all.push(s);
            }
        }
        cache.sources = Arc::new(Sources::new(all)?);
        cache.chunks = None;
        cache.scope = scope;
        cache.version = version;
    }
    let mut chunks = cache.chunks.clone();
    if vectors && chunks.is_none() {
        let mut query=tx.prepare("SELECT source,page,text,vector FROM chunks WHERE vector IS NOT NULL AND model=?").app()?;
        let rows = query
            .query_map([crate::inference::MODEL_ID], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .app()?;
        let mut values = vec![];
        let mut bytes = 0;
        for row in rows {
            let (id, page, text, encoded) = row.app()?;
            if let Some(&source) = cache.sources.by_id.get(&id) {
                let vector: Vec<f32> = serde_json::from_str(&encoded).unwrap_or_default();
                if vector.len() != 768 || vector.iter().any(|v| !v.is_finite()) {
                    continue;
                }
                bytes += vector.len() * std::mem::size_of::<f32>()
                    + text.len()
                    + std::mem::size_of::<Chunk>();
                values.push(Chunk {
                    source,
                    page,
                    text,
                    vector,
                });
            }
        }
        let values = Arc::new(values);
        // Larger indexes still work, but do not remain resident between requests.
        if bytes <= 128 * 1024 * 1024 {
            cache.chunks = Some(values.clone());
        }
        chunks = Some(values);
    }
    tx.commit().app()?;
    cache.used = Instant::now();
    Ok(Snapshot {
        sources: cache.sources.clone(),
        chunks,
    })
}
pub fn release_if_idle() {
    if let Ok(mut slot) = CACHE.try_lock() {
        if slot
            .as_ref()
            .is_some_and(|c| c.used.elapsed() > Duration::from_secs(120))
        {
            *slot = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project;
    use rusqlite::params;
    #[test]
    fn caches_vectors_and_invalidates_external_commits_and_scope_changes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        project::create(&root, "Cache").unwrap();
        let vault = temp.path().join("vault");
        std::fs::create_dir(&vault).unwrap();
        vaults::connect(&root, &vault).unwrap();
        let index = temp.path().join("index.sqlite");
        let connection = vaults::index_db(&index).unwrap();
        let id = project::hash(&vault.canonicalize().unwrap().to_string_lossy());
        let mut source = parse::parse(
            &id,
            "Lieux/Toulouse.md",
            "---\ntitle: Toulouse\n---\nUne ville.",
        );
        connection
            .execute(
                "INSERT INTO sources VALUES(?,?,?,?,?)",
                params![
                    source.id,
                    id,
                    source.path,
                    "a",
                    serde_json::to_string(&source).unwrap()
                ],
            )
            .unwrap();
        connection.execute("INSERT INTO chunks(source,text,vector,model) VALUES(?,? ,?,'embeddinggemma-300M-Q8_0')",params![source.id,source.text,serde_json::to_string(&vec![0.01f32;768]).unwrap()]).unwrap();
        // Old vectors have the same dimensions but belong to a different space.
        connection.execute("INSERT INTO chunks(source,text,vector,model) VALUES(?,? ,?,'embeddinggemma-2-Q8_0')",params![source.id,source.text,serde_json::to_string(&vec![0.02f32;768]).unwrap()]).unwrap();
        let mut slot = None;
        let first = snapshot_in(&mut slot, &root, &index, false).unwrap();
        assert_eq!(first.sources.all.len(), 1);
        assert!(first.chunks.is_none());
        let warm = snapshot_in(&mut slot, &root, &index, true).unwrap();
        assert!(Arc::ptr_eq(&first.sources, &warm.sources));
        assert_eq!(warm.chunks.as_ref().unwrap().len(), 1);
        let second = snapshot_in(&mut slot, &root, &index, true).unwrap();
        assert!(Arc::ptr_eq(
            warm.chunks.as_ref().unwrap(),
            second.chunks.as_ref().unwrap()
        ));
        source.title = "Lyon".into();
        connection
            .execute(
                "UPDATE sources SET payload=? WHERE id=?",
                params![serde_json::to_string(&source).unwrap(), source.id],
            )
            .unwrap();
        let updated = snapshot_in(&mut slot, &root, &index, true).unwrap();
        assert_eq!(updated.sources.all[0].title, "Lyon");
        assert!(!Arc::ptr_eq(&first.sources, &updated.sources));
        vaults::set_scope(&root, &id, vec!["Autres".into()]).unwrap();
        let restricted = snapshot_in(&mut slot, &root, &index, true).unwrap();
        assert!(restricted.sources.all.is_empty());
        assert!(restricted.chunks.unwrap().is_empty());
        vaults::set_scope(&root, &id, vec![]).unwrap();
        assert_eq!(
            snapshot_in(&mut slot, &root, &index, false)
                .unwrap()
                .sources
                .all
                .len(),
            1
        );
        connection.execute("DELETE FROM sources", []).unwrap();
        assert!(snapshot_in(&mut slot, &root, &index, true)
            .unwrap()
            .sources
            .all
            .is_empty());
    }
    #[test]
    fn matcher_preserves_unicode_boundaries_ambiguity_and_end_policy() {
        let mut a = parse::parse(
            "v",
            "a.md",
            "---\ntitle: Pierre Plantard\ntype: Personne\naliases: [Pierre, Évry]\n---\n",
        );
        let b = parse::parse(
            "v",
            "b.md",
            "---\ntitle: Pierre Perret\ntype: Personne\naliases: [Pierre]\n---\n",
        );
        a.aliases.push("Pierre Plantard".into());
        let data = Sources::new(vec![a, b]).unwrap();
        assert!(!data.aliases.iter().any(|(n, _)| n == "pierre"));
        for text in [
            "Évry",
            "à ÉVRY.",
            "préÉvry",
            "Évryenne",
            "l’Évry",
            "Pierre Plantard est né.",
        ] {
            let text = parse::normalize(text);
            for allow_end in [false, true] {
                let mut found = HashSet::new();
                for m in data.matcher.as_ref().unwrap().find_overlapping_iter(&text) {
                    if text[..m.start()]
                        .chars()
                        .next_back()
                        .is_none_or(|c| !c.is_alphanumeric())
                        && text[m.end()..]
                            .chars()
                            .next()
                            .is_none_or(|c| !c.is_alphanumeric())
                        && (allow_end || m.end() < text.len())
                    {
                        found.insert(m.pattern().as_usize());
                    }
                }
                for (i, (alias, _)) in data.aliases.iter().enumerate() {
                    assert_eq!(
                        found.contains(&i),
                        parse::exact_mention_normalized(&text, alias, allow_end)
                    );
                }
            }
        }
    }
}
