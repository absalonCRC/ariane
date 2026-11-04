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
    catalog_version: i64,
    vector_version: i64,
    streaming: bool,
    sources: Arc<Sources>,
    chunks: Option<Arc<Vec<Chunk>>>,
    used: Instant,
}
static CACHE: LazyLock<Mutex<Option<Cache>>> = LazyLock::new(|| Mutex::new(None));
pub struct Snapshot {
    pub sources: Arc<Sources>,
    pub chunks: Option<Arc<Vec<Chunk>>>,
}

/// Catalog and vector generations are maintained by SQLite triggers, including
/// external edits. Scope is checked on every request.
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
            catalog_version: -1,
            vector_version: -1,
            streaming: false,
            sources: Arc::new(Sources::new(vec![])?),
            chunks: None,
            used: Instant::now(),
        });
    }
    let cache = slot.as_mut().unwrap();
    let tx = cache.connection.unchecked_transaction().app()?;
    let (catalog_version, vector_version): (i64,i64) = tx.query_row("SELECT catalog,vectors FROM index_generations WHERE singleton=1",[],|r|Ok((r.get(0)?,r.get(1)?)),
        ).app()?;
    if catalog_version != cache.catalog_version || scope != cache.scope {
        let mut query = tx.prepare(&format!("SELECT payload FROM sources s WHERE {} ORDER BY s.id", vaults::SCOPE_SQL)).app()?;
        let rows = query.query_map([vaults::scope_json(&vaults)?], |r| r.get::<_, String>(0)).app()?;
        let all = rows.map(|row|serde_json::from_str(&row.app()?).app()).collect::<Result<Vec<_>>>()?;
        cache.sources = Arc::new(Sources::new(all)?);
        cache.chunks = None; cache.streaming = false;
        cache.scope = scope; cache.catalog_version = catalog_version;
    }
    if vector_version != cache.vector_version { cache.chunks = None; cache.streaming = false; cache.vector_version = vector_version; }
    let mut chunks = cache.chunks.clone();
    if vectors && chunks.is_none() && !cache.streaming {
        chunks = resident_chunks(&tx, &cache.sources, 128 * 1024 * 1024)?;
        cache.streaming = chunks.is_none();
        cache.chunks = chunks.clone();
    }
    tx.commit().app()?;
    cache.used = Instant::now();
    Ok(Snapshot {
        sources: cache.sources.clone(),
        chunks,
    })
}
fn resident_chunks(c: &Connection, sources: &Sources, budget: usize,
) -> Result<Option<Arc<Vec<Chunk>>>> {
    let mut values = Vec::new();
    let mut bytes = 0;
    visit_rows(c, sources, |chunk| {
        bytes += chunk.vector.len() * 4 + chunk.text.len() + std::mem::size_of::<Chunk>();
        if bytes > budget { return false; }
        values.push(chunk);
        true
    })?;
    Ok((bytes <= budget).then(|| Arc::new(values)))
}
fn visit_rows(c: &Connection, sources: &Sources, mut visit: impl FnMut(Chunk) -> bool,
) -> Result<()> {
    // ids are transported as JSON rather than an unbounded number of SQL parameters.
    let ids = serde_json::to_string(&sources.all.iter().map(|s|&s.id).collect::<Vec<_>>()).app()?;
    let mut q=c.prepare("SELECT source,page,text,vector FROM chunks WHERE source IN (SELECT value FROM json_each(?1)) AND vector IS NOT NULL AND model=?2 AND length(vector)<=65536 ORDER BY id").app()?;
    let mut rows=q.query(rusqlite::params![ids,crate::inference::MODEL_ID]).app()?;
    while let Some(row) = rows.next().app()? {
        let id: String=row.get(0).app()?;
        if let (Some(&source),Some(vector)) = (sources.by_id.get(&id),crate::vectors::decode(row.get_ref(3).app()?),
        ) {
            if !visit(Chunk { source, page:row.get(1).app()?, text:row.get(2).app()?, vector,
            }) { break; }
        }
    }
    Ok(())
}
/// For indexes above the resident budget, only one row/vector is decoded at a time.
pub fn visit_chunks(snapshot: &Snapshot, index: &Path, mut visit: impl FnMut(&Chunk),
) -> Result<()> {
    if let Some(chunks) = &snapshot.chunks { for chunk in chunks.iter() { visit(chunk); } }
    else { let c=vaults::index_db(index)?; visit_rows(&c,&snapshot.sources,|chunk| {visit(&chunk);true})?; }
    Ok(())
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
    fn streaming_over_budget_preserves_all_chunks_and_scores_without_a_partial_cache() {
        let temp = tempfile::tempdir().unwrap();
        let index = temp.path().join("index.sqlite");
        let c = vaults::index_db(&index).unwrap();
        let sources = Arc::new(Sources::new((0..5).map(|i|
            parse::parse("vault", &format!("{i}.md"), &format!("Source {i}"))
        ).collect(),
            ).unwrap(),
        );
        for i in 0..80 {
            let mut vector = vec![0.01f32; 768];
            vector[i] = 0.8;
            let norm = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
            for v in &mut vector {
                *v /= norm;
            }
            c.execute("INSERT INTO chunks(source,page,text,vector,model) VALUES(?,?,?,?,?)",
                params![sources.all[i % 5].id, i as i64, format!("Passage {i}"), crate::vectors::encode(&vector), crate::inference::MODEL_ID],
            ).unwrap();
        }
        let resident = Snapshot { sources: sources.clone(), chunks: resident_chunks(&c, &sources, 1024 * 1024).unwrap(),
        };
        assert_eq!(resident.chunks.as_ref().unwrap().len(), 80);
        let streamed = Snapshot { sources: sources.clone(), chunks: resident_chunks(&c, &sources, 4096).unwrap(),
        };
        assert!(streamed.chunks.is_none(), "An incomplete resident cache must never stand in for the full index");
        let query = vec![0.02; 768];
        let scores = |snapshot: &Snapshot| {
            let mut scores = vec![];
            visit_chunks(snapshot, &index, |chunk| {
                scores.push((chunk.source, chunk.page, chunk.text.clone(), crate::inference::cosine(&query, &chunk.vector),
                ))
            }).unwrap();
            scores
        };
        assert_eq!(scores(&resident), scores(&streamed));
        assert_eq!(scores(&streamed).len(), 80);
    }
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
        let mut vector = vec![0.; 768];
        vector[0] = 1.;
        let mut alternate = vec![0.; 768];
        alternate[1] = 1.;
        connection.execute("INSERT INTO chunks(source,text,vector,model) VALUES(?,? ,?,'embeddinggemma-300M-Q8_0:sentence-tokens-v2')",params![source.id,source.text,serde_json::to_string(&vector).unwrap()]).unwrap();
        // Old vectors have the same dimensions but belong to a different space.
        connection.execute("INSERT INTO chunks(source,text,vector,model) VALUES(?,? ,?,'embeddinggemma-2-Q8_0')",params![source.id,source.text,serde_json::to_string(&alternate).unwrap()]).unwrap();
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
        connection.execute("UPDATE chunks SET vector=? WHERE model=?",params![crate::vectors::encode(&alternate),crate::inference::MODEL_ID],
            ).unwrap();
        let backfill=snapshot_in(&mut slot,&root,&index,true).unwrap();
        assert!(Arc::ptr_eq(&first.sources,&backfill.sources));
        assert!(!Arc::ptr_eq(warm.chunks.as_ref().unwrap(),backfill.chunks.as_ref().unwrap()));
        connection.execute("INSERT INTO sources VALUES('foreign','another-project','bad.md','x','invalid JSON')",[]).unwrap();
        assert_eq!(snapshot_in(&mut slot,&root,&index,false).unwrap().sources.all.len(),1);
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
