mod cache;
use crate::{
    error::{AppResult, Result},
    inference::{cosine, Engine},
    model::*,
    vaults::{self, parse},
};
pub use cache::release_if_idle;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{LazyLock, Mutex},
};
static SEARCH_TERMS: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"[\p{L}\p{N}]{3,}").unwrap());
static WIKI_LINKS: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\[\[([^\]|#]+)").unwrap());
pub(crate) fn available_source_ids(root: &Path, index: &Path) -> Result<HashSet<String>> {
    let available: HashSet<_> = vaults::list(root, index)?.into_iter()
        .filter(|vault| vault.available).map(|vault| vault.id).collect();
    Ok(cache::snapshot(root, index, false)?.sources.all.iter()
        .filter(|source| available.contains(&source.vault_id)).map(|source| source.id.clone()).collect())
}
pub fn search(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    query: &str,
    semantic: bool,
) -> Result<Vec<Source>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let snapshot = cache::snapshot(root, index, semantic)?;
    let data = &snapshot.sources;
    let c = vaults::index_db(index)?;
    let terms = SEARCH_TERMS
        .find_iter(query)
        .take(24)
        .map(|x| format!("\"{}\"", x.as_str()))
        .collect::<Vec<_>>()
        .join(" OR ");
    let mut hits: HashMap<String, Source> = HashMap::new();
    if !terms.is_empty() {
        let mut q=c.prepare("SELECT source,page,snippet(search,0,'','',' … ',40),bm25(search) FROM search WHERE search MATCH ? ORDER BY bm25(search)").app()?;
        let rows = q
            .query_map([terms], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, f64>(3)?,
                ))
            })
            .app()?;
        for row in rows {
            let (id, page, text, rank) = row.app()?;
            if let Some(&i) = data.by_id.get(&id) {
                let mut s = data.all[i].clone();
                s.text = text;
                s.page = page;
                s.score = 1. + (-rank).min(10.);
                hits.entry(id).or_insert(s);
                if hits.len() >= 150 {
                    break;
                }
            }
        }
    }
    let normalized = parse::normalize(query.trim());
    for (i, title) in data.titles.iter().enumerate() {
        if title.contains(&normalized) {
            let mut s = data.all[i].clone();
            s.score = 8.;
            hits.entry(s.id.clone()).or_insert(s);
        }
    }
    if semantic {
        let vector = engine.try_lock().ok().and_then(|mut engine| {
            engine
                .embed(
                    resources,
                    &query.chars().take(1800).collect::<String>(),
                    true,
                )
                .ok()
        });
        if let (Some(vector), Some(chunks)) = (vector, snapshot.chunks) {
            for chunk in chunks.iter() {
                let source = &data.all[chunk.source];
                let score = cosine(&vector, &chunk.vector);
                if score < 0.48 {
                    continue;
                }
                let combined = score * 4. + hits.get(&source.id).map_or(0., |s| s.score.min(2.));
                if hits.get(&source.id).is_none_or(|s| s.score < combined) {
                    let mut s = source.clone();
                    s.text = chunk.text.clone();
                    s.page = chunk.page;
                    s.score = combined;
                    hits.insert(s.id.clone(), s);
                }
            }
        }
    }
    let mut out: Vec<_> = hits.into_values().collect();
    out.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.title.cmp(&b.title)));
    out.truncate(20);
    Ok(out)
}
pub fn suggest(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    text: &str,
    depth: u8,
    allow_end: bool,
) -> Result<Vec<Source>> {
    if text.trim().is_empty() {
        return Ok(vec![]);
    }
    let snapshot = cache::snapshot(root, index, false)?;
    let data = &snapshot.sources;
    let normalized = parse::normalize(text);
    let mut out = vec![];
    let mut ids = HashSet::new();
    if let Some(matcher) = &data.matcher {
        for found in matcher.find_overlapping_iter(&normalized) {
            let before = normalized[..found.start()].chars().next_back();
            let after = normalized[found.end()..].chars().next();
            if before.is_some_and(char::is_alphanumeric)
                || after.is_some_and(char::is_alphanumeric)
                || (!allow_end && found.end() == normalized.len())
            {
                continue;
            }
            let (name, i) = &data.aliases[found.pattern().as_usize()];
            let source = &data.all[*i];
            if ids.insert(source.id.clone()) {
                let mut s = source.clone();
                s.matched = Some(name.clone());
                s.score = 100.;
                out.push(s);
            }
        }
    }
    let direct = out.clone();
    if depth > 0 {
        for seed in &direct {
            let names = &data.links[data.by_id[&seed.id]];
            for (i, s) in data.all.iter().enumerate() {
                let linked = names.contains(&data.titles[i]);
                let tagged = depth >= 2
                    && s.tags.iter().any(|t| {
                        seed.tags.contains(t)
                            && !["personne", "lieu", "concept"].contains(&t.as_str())
                    });
                if (linked || tagged) && ids.insert(s.id.clone()) {
                    let mut s = s.clone();
                    s.matched = seed.matched.clone();
                    s.score = if linked { 80. } else { 50. };
                    out.push(s);
                }
            }
        }
    }
    if depth >= 4 {
        let seeds = out.clone();
        for seed in seeds.iter().filter(|s| s.score < 90.) {
            for name in &data.links[data.by_id[&seed.id]] {
                let target = name.rsplit('/').next().unwrap_or(name);
                for (i, title) in data.titles.iter().enumerate() {
                    let source = &data.all[i];
                    if title == target && ids.insert(source.id.clone()) {
                        let mut s = source.clone();
                        s.matched = seed.matched.clone();
                        s.score = 40.;
                        out.push(s);
                    }
                }
            }
        }
    }
    if depth >= 3 {
        for mut s in search(root, index, resources, engine, text, true)?
            .into_iter()
            .take(if depth == 5 { 8 } else { 4 })
        {
            if ["Personne", "Lieu"].contains(&s.kind.as_str())
                || s.score < if depth == 5 { 1.9 } else { 2.2 }
            {
                continue;
            }
            if ids.insert(s.id.clone()) {
                s.matched = direct.first().and_then(|s| s.matched.clone());
                out.push(s);
            }
        }
    }
    out.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.title.cmp(&b.title)));
    out.truncate(18);
    Ok(out)
}
