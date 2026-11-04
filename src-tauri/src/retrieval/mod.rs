mod cache;
mod fusion;
pub(crate) mod ranking;
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
    search_inner(
        root,
        index,
        resources,
        engine,
        query,
        semantic,
        ranking::DEFAULT,
        true,
    )
}
pub(crate) fn search_with_policy(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    query: &str,
    semantic: bool,
    policy: ranking::Policy,
) -> Result<Vec<Source>> {
    search_inner(
        root, index, resources, engine, query, semantic, policy, false,
    )
}
#[allow(clippy::too_many_arguments)]
fn search_inner(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    query: &str,
    semantic: bool,
    policy: ranking::Policy,
    rank_fusion: bool,
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
            hits.entry(s.id.clone()).and_modify(|hit| hit.score = hit.score.max(s.score))
                .or_insert(s);
        }
    }
    for (name, i) in data.aliases.iter().filter(|(name, _)| name == &normalized) {
        let mut source = data.all[*i].clone();
        source.score = 8.;
        source.matched = Some(name.clone());
        hits.entry(source.id.clone())
            .and_modify(|hit| hit.score = hit.score.max(8.))
            .or_insert(source);
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
        if let Some(vector) = vector {
            if rank_fusion {
                return fusion::search(
                    &snapshot,
                    index,
                    &vector,
                    hits,
                    &normalized,
                    policy.semantic_threshold,
                );
            }
            let mut scores = vec![0f64; data.all.len()];
            for (id,hit) in &hits { if let Some(&i)=data.by_id.get(id) { scores[i]=hit.score; } }
            let lexical = scores.clone();
            let mut best: Vec<_> = hits.into_values().collect();
            best.sort_by(|a,b|b.score.total_cmp(&a.score).then(a.title.cmp(&b.title)));
            best.truncate(20);
            cache::visit_chunks(&snapshot,index,|chunk| {
                let source = &data.all[chunk.source];
                let score = cosine(&vector,&chunk.vector);
                if score < policy.semantic_threshold { return; }
                let combined =
                    ranking::hybrid(lexical[chunk.source], score, policy.semantic_threshold);
                if combined <= scores[chunk.source] { return; }
                scores[chunk.source] = combined;
                if let Some(i)=best.iter().position(|s|s.id==source.id) { best.remove(i); }
                if best.len()<20 || best.last().is_some_and(|s| {
                        combined>s.score || (combined==s.score && source.title<s.title)
                    }) {
                    let mut s=source.clone();s.text=chunk.text.clone();s.page=chunk.page;s.score=combined;
                    best.push(s);best.sort_by(|a,b|b.score.total_cmp(&a.score).then(a.title.cmp(&b.title)));best.truncate(20);
                }
            })?;
            return Ok(best);
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
    suggest_with_policy(
        root,
        index,
        resources,
        engine,
        text,
        depth,
        allow_end,
        ranking::DEFAULT,
    )
}
#[allow(clippy::too_many_arguments)]
pub(crate) fn suggest_with_policy(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    text: &str,
    depth: u8,
    allow_end: bool,
    policy: ranking::Policy,
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
        // The new calibration covers depth 3. Keep the previous semantic gate
        // for the separate, more permissive depth-5 policy.
        let policy = if depth == 5 {
            ranking::Policy {
                semantic_threshold: 0.48,
                ..policy
            }
        } else {
            policy
        };
        let candidates = search_with_policy(root, index, resources, engine, text, true, policy)?;
        let separated = candidates
            .get(1)
            .is_none_or(|s| candidates[0].score - s.score >= policy.suggestion_margin);
        for mut s in candidates.into_iter()
            .take(if depth == 5 { 8 } else { 4 })
        {
            if ["Personne", "Lieu"].contains(&s.kind.as_str())
                || s.score < if depth == 5 {
                        policy.deep_suggestion_score
                    } else {
                        policy.suggestion_score
                    }
                || (!separated && policy.suggestion_margin > 0.)
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_titles_keep_their_priority_when_the_body_already_matches() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        let vault = d.path().join("vault");
        std::fs::create_dir(&vault).unwrap();
        crate::project::create(&root, "Recherche").unwrap();
        vaults::connect(&root, &vault).unwrap();
        std::fs::write(
            vault.join("Tour.md"),
            "---\ntitle: Tour\n---\nLa tour domine le quai.",
        )
        .unwrap();
        let index = d.path().join("index");
        let resources = d.path().join("no-model");
        let engine = Mutex::new(Engine::default());
        vaults::index(
            &root,
            &index,
            &resources,
            &engine,
            &std::sync::atomic::AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let hits = search(&root, &index, &resources, &engine, "Tour", false).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].score, 8.);
    }
}
