mod entities;
mod inline;
pub use inline::{create_detected_entity, inline_entities};
mod ner;
pub use ner::{apply_entities, pending_entities_at};
mod queue;
pub use queue::{Queue, GEMMA_MODEL};
mod storage;
mod temporal;

use crate::{
    error::{AppResult, Result},
    model::Section,
    project,
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

// SQLite trim() removes only ASCII spaces by default. Mirror Rust's Unicode
// whitespace handling so blank outline nodes never block a model queue.
const WHITESPACE: &str = " \t\n\r\u{b}\u{c}\u{85}\u{a0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Passage {
    pub key: String,
    pub section: String,
    pub node: Option<String>,
    pub title: String,
    pub text: String,
    pub hash: String,
    pub position: usize,
}

fn utf16_byte(text: &str, offset: usize) -> Result<usize> {
    if offset == 0 {
        return Ok(0);
    }
    let mut units = 0;
    for (byte, ch) in text.char_indices() {
        units += ch.len_utf16();
        if units == offset {
            return Ok(byte + ch.len_utf8());
        }
        if units > offset {
            return Err("Position UTF-16 invalide.".into());
        }
    }
    if units == offset {
        Ok(text.len())
    } else {
        Err("Position UTF-16 hors du texte.".into())
    }
}

fn section_passages(s: &Section) -> Result<Vec<Passage>> {
    if s.kind != "scene" {
        return Ok(vec![]);
    }
    let nodes: Vec<(Option<String>, usize, usize)> = if let Some(outline) = &s.outline {
        let mut out = Vec::new();
        for (i, node) in outline.nodes.iter().enumerate() {
            let start = utf16_byte(&s.text, node.start)?;
            let end = if let Some(next) = outline.nodes.get(i + 1) {
                utf16_byte(&s.text, next.start)?
            } else {
                s.text.len()
            };
            if start > end {
                return Err("Plan de scène invalide.".into());
            }
            out.push((Some(node.id.clone()), start, end));
        }
        out
    } else {
        vec![(None, 0, s.text.len())]
    };
    // Fence state spans outline nodes. Exclude intersecting nodes conservatively
    // so names in examples/code never become manuscript facts.
    let mut code = Vec::new();
    let mut fence: Option<(char, usize, usize)> = None;
    let mut offset = 0;
    for line in s.text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let marker = trimmed.chars().next().unwrap_or(' ');
        let count = trimmed.chars().take_while(|c| *c == marker).count();
        if (marker == '`' || marker == '~') && count >= 3 {
            match fence {
                None => fence = Some((marker, count, offset)),
                Some((open, length, start)) if open == marker && count >= length => {
                    code.push((start, offset + line.len()));
                    fence = None;
                }
                _ => {}
            }
        }
        offset += line.len();
    }
    if let Some((_, _, start)) = fence {
        code.push((start, s.text.len()));
    }
    Ok(nodes
        .into_iter()
        .enumerate()
        .filter(|(_, (_, start, end))| !code.iter().any(|(a, b)| start < b && end > a))
        .map(|(position, (node, start, end))| {
            let text = s.text[start..end].to_owned();
            let key = match &node {
                Some(n) => format!("{}\u{1f}{}", s.id, n),
                None => format!("{}\u{1f}", s.id),
            };
            let title = text
                .lines()
                .find(|line| !line.trim().is_empty())
                .map(|line| line.trim().chars().take(80).collect::<String>())
                .unwrap_or_else(|| s.title.clone());
            Passage {
                key,
                section: s.id.clone(),
                node,
                title,
                text: text.clone(),
                hash: storage::fingerprint(&text),
                position,
            }
        })
        .collect())
}

fn row_passage(r: &rusqlite::Row<'_>) -> rusqlite::Result<Passage> {
    Ok(Passage {
        key: r.get(0)?,
        section: r.get(1)?,
        node: r.get(2)?,
        title: r.get(3)?,
        text: r.get(4)?,
        hash: r.get(5)?,
        position: r.get::<_, i64>(6)? as usize,
    })
}

pub fn sync(root: &Path) -> Result<()> {
    sync_preferred(root, None)
}
pub fn sync_preferred(root: &Path, preferred: Option<&str>) -> Result<()> {
    sync_idle(root, preferred, || false)
}
pub fn sync_idle(
    root: &Path,
    preferred: Option<&str>,
    interrupted: impl Fn() -> bool,
) -> Result<()> {
    let mut c = storage::database(root)?;
    let metadata: Vec<(String, i64, String, String, String)> = {
        let mut q=c.prepare("SELECT id,revision,mirror,COALESCE(outline,''),title FROM sections WHERE kind='scene' AND trashed=0").app()?;
        let rows = q
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .app()?;
        rows.collect::<std::result::Result<_, _>>().app()?
    };
    let seen: HashSet<&str> = metadata
        .iter()
        .map(|(id, _, _, _, _)| id.as_str())
        .collect();
    let old_sections: Vec<String> = {
        let mut q = c.prepare("SELECT id FROM memory_sections").app()?;
        let rows = q.query_map([], |r| r.get(0)).app()?;
        rows.collect::<std::result::Result<_, _>>().app()?
    };
    for id in old_sections
        .into_iter()
        .filter(|id| !seen.contains(id.as_str()))
    {
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        let keys: Vec<String> = {
            let mut q = tx
                .prepare("SELECT key FROM memory_passages WHERE section=?")
                .app()?;
            let rows = q.query_map([&id], |r| r.get(0)).app()?;
            rows.collect::<std::result::Result<_, _>>().app()?
        };
        for key in keys {
            storage::delete_passage(&tx, &key)?;
        }
        tx.execute("DELETE FROM memory_sections WHERE id=?", [id])
            .app()?;
        tx.commit().app()?;
    }
    let mut processed = 0;
    let mut metadata = metadata;
    metadata.sort_by_key(|(id, _, _, _, _)| if Some(id.as_str()) == preferred { 0 } else { 1 });
    for (id, revision, mirror, outline, title) in metadata {
        if interrupted() {
            break;
        }
        let outline_hash = storage::fingerprint(&outline);
        let old: Option<(i64, String, String, String)> = c
            .query_row(
                "SELECT revision,mirror,outline_hash,title FROM memory_sections WHERE id=?",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .app()?;
        if old
            == Some((
                revision,
                mirror.clone(),
                outline_hash.clone(),
                title.clone(),
            ))
        {
            continue;
        }
        // Bounded transactions yield to saves between scenes, including initial indexing.
        if processed >= 16 {
            break;
        }
        processed += 1;
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        let Some(s) = project::section(&tx, &id)? else {
            continue;
        };
        if s.revision != revision {
            continue;
        }
        let desired = section_passages(&s)?;
        let existing: HashMap<String, (String, String, usize, i64)> = {
            let mut q = tx
                .prepare(
                    "SELECT key,hash,title,position,revision FROM memory_passages WHERE section=?",
                )
                .app()?;
            let rows = q
                .query_map([&id], |r| {
                    Ok((
                        r.get(0)?,
                        (
                            r.get(1)?,
                            r.get(2)?,
                            r.get::<_, i64>(3)? as usize,
                            r.get(4)?,
                        ),
                    ))
                })
                .app()?;
            rows.collect::<std::result::Result<_, _>>().app()?
        };
        let wanted: HashSet<&str> = desired.iter().map(|p| p.key.as_str()).collect();
        for key in existing.keys().filter(|key| !wanted.contains(key.as_str())) {
            storage::delete_passage(&tx, key)?;
        }
        for p in desired {
            match existing.get(&p.key) {
                Some((hash, old_title, position, old_revision)) if hash == &p.hash => {
                    if old_title != &p.title || *position != p.position || *old_revision != revision
                    {
                        tx.execute(
                            "UPDATE memory_passages SET title=?,position=?,revision=? WHERE key=?",
                            params![p.title, p.position as i64, revision, p.key],
                        )
                        .app()?;
                    }
                }
                _ => {
                    storage::upsert_passage(&tx, &p, revision)?;
                    entities::rules(&tx, &p)?;
                }
            }
        }
        tx.execute("INSERT INTO memory_sections(id,revision,mirror,outline_hash,title) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,mirror=excluded.mirror,outline_hash=excluded.outline_hash,title=excluded.title",params![id,revision,mirror,outline_hash,title]).app()?;
        tx.commit().app()?;
    }
    Ok(())
}

pub fn pending(root: &Path, preferred: Option<&str>, limit: usize) -> Result<Vec<Passage>> {
    pending_at(root, preferred, None, limit)
}
pub fn pending_at(
    root: &Path,
    preferred: Option<&str>,
    node: Option<&str>,
    limit: usize,
) -> Result<Vec<Passage>> {
    let c = storage::database(root)?;
    let model = GEMMA_MODEL;
    let mut q=c.prepare("SELECT key,section,node,title,text,hash,position FROM memory_passages WHERE (analyzed=0 OR model IS NULL OR model<>?) AND length(trim(text,?))>0 AND length(text)<=65536 ORDER BY CASE WHEN section=? AND node IS ? THEN 0 WHEN section=? THEN 1 ELSE 2 END,section,position LIMIT ?").app()?;
    let rows = q
        .query_map(
            params![
                model,
                WHITESPACE,
                preferred.unwrap_or(""),
                node,
                preferred.unwrap_or(""),
                limit.min(64) as i64
            ],
            row_passage,
        )
        .app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}

fn codepoint_range(text: &str, start: usize, end: usize) -> Result<(usize, usize)> {
    if start >= end {
        return Err("Plage de mention invalide.".into());
    }
    let starts: Vec<usize> = text
        .char_indices()
        .map(|(i, _)| i)
        .chain(std::iter::once(text.len()))
        .collect();
    if end >= starts.len() {
        return Err("Plage de mention hors du passage.".into());
    }
    Ok((starts[start], starts[end]))
}

pub fn apply(root: &Path, passage: &Passage, output: &Value) -> Result<bool> {
    let mut c = storage::database(root)?;
    let vector = output
        .get("vector")
        .and_then(Value::as_array)
        .ok_or("Vecteur manquant.")?;
    let model = output.get("model").and_then(Value::as_str).ok_or("Modèle manquant.")?;
    let dimension = if model == GEMMA_MODEL { 768 } else if model.starts_with("intfloat/multilingual-e5-small") { 384 } else {
        return Err("Modèle vectoriel incompatible.".into());
    };
    if vector.len() != dimension { return Err("Dimension vectorielle invalide.".into()); }
    let mut parsed = Vec::new();
    for value in vector {
        let n = value
            .as_f64()
            .filter(|x| x.is_finite())
            .ok_or("Vecteur invalide.")?;
        parsed.push(n as f32);
    }
    if !parsed.is_empty()
        && (parsed.iter().any(|x| !x.is_finite())
            || parsed.iter().map(|x| x * x).sum::<f32>() < 0.5)
    {
        return Err("Vecteur non normalisé.".into());
    }
    let query: Vec<f32> = serde_json::from_value(output["queryVector"].clone()).app()?;
    let norm = query.iter().map(|v| v * v).sum::<f32>();
    if query.len() != dimension || query.iter().any(|v| !v.is_finite()) || !(0.9..=1.1).contains(&norm) {
        return Err("Vecteur de requête invalide.".into());
    }
    let passage_vectors = parse_vectors(output.get("passageVectors"), &parsed)?;
    let query_vectors = parse_vectors(output.get("queryVectors"), &query)?;
    let mentions = parse_mentions(passage, output)?;
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .app()?;
    let Some(s) = project::section(&tx, &passage.section)? else {
        return Ok(false);
    };
    let live = section_passages(&s)?
        .into_iter()
        .find(|p| p.key == passage.key);
    if live.as_ref() != Some(passage) || storage::fingerprint(&passage.text) != passage.hash {
        return Ok(false);
    }
    let current: Option<(String, i64)> = tx
        .query_row(
            "SELECT hash,revision FROM memory_passages WHERE key=?",
            [&passage.key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .app()?;
    if current != Some((passage.hash.clone(), s.revision)) {
        return Ok(false);
    }
    if output.get("entities").is_some() {
    tx.execute(
        "DELETE FROM memory_mentions WHERE passage_key=? AND origin LIKE 'model:%'",
        [&passage.key],
    )
    .app()?;
    }
    for (text, label, a, b) in mentions {
        entities::mention(
            &tx,
            &passage.key,
            &passage.text,
            &text,
            a,
            b,
            &format!("model:{label}"),
        )?;
    }
    tx.execute(
        "UPDATE memory_passages SET analyzed=1,vector=?,query_vector=?,model=? WHERE key=?",
        params![
            serde_json::to_string(&passage_vectors).app()?,
            serde_json::to_string(&query_vectors).app()?,
            model,
            passage.key
        ],
    )
    .app()?;
    tx.commit().app()?;
    Ok(true)
}

fn terms(text: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    text.split(|c: char| !c.is_alphanumeric())
        .filter_map(|word| {
            let lower = word.to_lowercase();
            if lower.chars().count() < 4
                || [
                    "dans", "avec", "pour", "cette", "comme", "était", "avait", "leur", "elle",
                    "mais", "alors", "plus", "sans", "tout", "toute", "depuis",
                ]
                .contains(&lower.as_str())
                || !seen.insert(lower.clone())
            {
                None
            } else {
                Some(lower)
            }
        })
        .take(12)
        .collect()
}

fn parse_vectors(value: Option<&Value>, fallback: &[f32]) -> Result<Vec<Vec<f32>>> {
    let vectors: Vec<Vec<f32>> = match value {
        Some(value) => serde_json::from_value(value.clone()).app()?,
        None => vec![fallback.to_vec()],
    };
    if vectors.is_empty()
        || vectors.len() > 9
        || vectors.iter().any(|v| {
            v.len() != fallback.len()
                || v.iter().any(|x| !x.is_finite())
                || !(0.9..=1.1).contains(&v.iter().map(|x| x * x).sum::<f32>())
        })
    {
        return Err("Segments vectoriels invalides.".into());
    }
    Ok(vectors)
}
type Vectors = (String, Vec<Vec<f32>>);

pub fn context(root: &Path, section: &str, node: Option<&str>, depth: u8) -> Result<Value> {
    context_idle(root, section, node, depth, || false)
}
pub fn context_idle(
    root: &Path,
    section: &str,
    node: Option<&str>,
    depth: u8,
    interrupted: impl Fn() -> bool,
) -> Result<Value> {
    let c = storage::database(root)?;
    let anchor:Option<Passage>=c.query_row("SELECT key,section,node,title,text,hash,position FROM memory_passages WHERE section=? AND node IS ?",params![section,node],row_passage).optional().app()?;
    let Some(anchor) = anchor else {
        return Ok(json!({"entities":[],"recall":null,"anchorHash":""}));
    };
    let current = project::section(&c, section)?;
    if current.as_ref().is_none_or(|s| {
        section_passages(s)
            .ok()
            .is_none_or(|ps| !ps.contains(&anchor))
    }) {
        return Ok(json!({"entities":[],"recall":null,"anchorHash":""}));
    }
    let mut q=c.prepare("SELECT DISTINCT e.id,e.title,e.kind FROM memory_mentions m JOIN memory_entities e ON e.id=m.entity_id WHERE m.passage_key=? ORDER BY e.title").app()?;
    let entities=q.query_map([&anchor.key],|r|Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"kind":r.get::<_,String>(2)?}))).app()?.collect::<std::result::Result<Vec<_>,_>>().app()?;
    let mut recall: Option<Value> = None;
    if depth > 0 {
        let anchor_vector = vector(root, section, node)?;
        let anchor_terms = terms(&anchor.text);
        // FTS selects a superset of every possible lexical match. Keep all
        // compatible vectors too, including semantic matches with no shared
        // words. Unencoded, unrelated prose does not need to be read or split.
        let lexical_query = if anchor_terms.is_empty() { "\"___no_terms___\"".to_owned() }
            else { anchor_terms.iter().map(|t|format!("\"{t}\"")).collect::<Vec<_>>().join(" OR ") };
        let model = anchor_vector.as_ref().map(|(m,_)|m.as_str()).unwrap_or("");
        let mut q=c.prepare("SELECT key,section,node,title,text,hash,position,vector,model FROM memory_passages
            WHERE key<>? AND hash<>? AND ((vector IS NOT NULL AND model=?)
            OR key IN (SELECT key FROM memory_fts WHERE memory_fts MATCH ?))").app()?;
        let rows = q.query_map(params![anchor.key,anchor.hash,model,lexical_query], |r| {
            Ok((row_passage(r)?, r.get::<_,Option<String>>(7)?, r.get::<_,Option<String>>(8)?))
        }).app()?;
        let mut best: Option<(Passage, f64)> = None;
        for row in rows {
            if interrupted() {
                return Ok(json!({"busy":true}));
            }
            let (p, raw, model) = row.app()?;
            if p.section == anchor.section && p.position.abs_diff(anchor.position) <= 1 {
                continue;
            }
            let passage_terms = terms(&p.text);
            let shared = anchor_terms
                .iter()
                .filter(|t| passage_terms.contains(t))
                .count();
            let lexical = shared as f64 / anchor_terms.len().max(1) as f64;
            let semantic = match (&anchor_vector, raw, model) {
                (Some((a_model, a)), Some(raw), Some(model)) if a_model == &model => {
                    serde_json::from_str::<Vec<Vec<f32>>>(&raw)
                        .ok()
                        .and_then(|b| {
                            a.iter()
                                .flat_map(|q| b.iter().map(move |v| crate::inference::cosine(q, v)))
                                .max_by(f64::total_cmp)
                        })
                }
                _ => None,
            };
            // 300M scores are lower than Gemma 2: exploratory French corpus calibration.
            let score = if let Some(score) = semantic.filter(|s| *s >= if anchor_vector.as_ref().is_some_and(|(m,_)|m == GEMMA_MODEL) { 0.45 } else { 0.85 }) {
                score + lexical * 0.05
            } else if shared >= 2 && lexical >= 0.3 {
                lexical * 0.8
            } else {
                continue;
            };
            if best.as_ref().is_some_and(|(_, s)| score <= *s) {
                continue;
            }
            let dismissed: bool = c
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM memory_dismissals WHERE id=? AND hash=?)",
                    params![p.key, p.hash],
                    |r| r.get(0),
                )
                .app()?;
            if dismissed {
                continue;
            }
            let live = project::section(&c, &p.section)?;
            if live
                .as_ref()
                .is_none_or(|s| section_passages(s).ok().is_none_or(|ps| !ps.contains(&p)))
            {
                continue;
            }
            best = Some((p, score));
        }
        if let Some((p, score)) = best {
            recall = Some(
                json!({"id":p.key,"section":p.section,"node":p.node,"title":p.title,"quote":p.text.trim(),"hash":p.hash,"score":score}),
            );
        }
    }
    Ok(json!({"entities":entities,"recall":recall,"anchorHash":anchor.hash}))
}

pub fn entity(root: &Path, id: &str) -> Result<Value> {
    entities::read(&storage::database(root)?, id)
}
pub fn list(root: &Path) -> Result<Value> {
    entities::list(&storage::database(root)?)
}
pub fn passage(root: &Path, section: &str, node: Option<&str>) -> Result<Option<Passage>> {
    let c = storage::database(root)?;
    c.query_row("SELECT key,section,node,title,text,hash,position FROM memory_passages WHERE section=? AND node IS ?",params![section,node],row_passage).optional().app()
}
pub fn vector(root: &Path, section: &str, node: Option<&str>) -> Result<Option<Vectors>> {
    let c = storage::database(root)?;
    let row: Option<(Option<String>, Option<String>)> = c
        .query_row(
            "SELECT model,query_vector FROM memory_passages WHERE section=? AND node IS ? AND model=?",
            params![section, node, GEMMA_MODEL],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .app()?;
    row.and_then(|(model, vector)| Some((model?, serde_json::from_str(&vector?).ok()?)))
        .map_or(Ok(None), |value| Ok(Some(value)))
}
pub fn dismiss(root: &Path, id: &str, hash: &str) -> Result<()> {
    let c = storage::database(root)?;
    c.execute(
        "INSERT OR IGNORE INTO memory_dismissals(id,hash) VALUES(?,?)",
        params![id, hash],
    )
    .app()?;
    Ok(())
}

pub fn session(root: &Path, value: Option<Value>) -> Result<Value> {
    let c = storage::database(root)?;
    if let Some(mut value) = value {
        let section = value
            .get("section")
            .and_then(Value::as_str)
            .ok_or("Section de session manquante.")?;
        let s = project::section(&c, section)?.ok_or("Section de session introuvable.")?;
        if s.kind != "scene" {
            return Err("La session doit viser une scène.".into());
        }
        let node = value.get("node").and_then(Value::as_str);
        if let Some(id) = node {
            if !section_passages(&s)?
                .iter()
                .any(|p| p.node.as_deref() == Some(id))
            {
                return Err("Nœud de session introuvable.".into());
            }
        }
        let length = section_passages(&s)?
            .into_iter()
            .find(|p| p.node.as_deref() == node)
            .map(|p| p.text.encode_utf16().count())
            .unwrap_or_else(|| s.text.encode_utf16().count());
        let offset = value
            .get("offset")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .min(length as u64);
        let cursor = value.get("cursor").and_then(Value::as_u64).unwrap_or(0);
        if offset > 1_000_000_000 || cursor > 1_000_000_000 {
            return Err("Position de session invalide.".into());
        }
        let recent = value
            .get("recent")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut checked = Vec::new();
        for item in recent.into_iter().take(3) {
            let Some(section) = item.get("section").and_then(Value::as_str) else {
                continue;
            };
            let Some(s) = project::section(&c, section)? else {
                continue;
            };
            let node = item.get("node").and_then(Value::as_str);
            if s.kind == "scene"
                && (node.is_none()
                    || section_passages(&s)?
                        .iter()
                        .any(|p| p.node.as_deref() == node))
            {
                checked.push(json!({"section":section,"node":node}));
            }
        }
        let source_id = value
            .get("sourceId")
            .and_then(Value::as_str)
            .filter(|s| s.len() <= 200)
            .map(str::to_owned);
        let source_page = value
            .get("sourcePage")
            .and_then(Value::as_u64)
            .filter(|n| *n <= 100_000);
        value = json!({"section":s.id,"node":node,"offset":offset,"cursor":cursor,"sourceId":source_id,"sourcePage":source_page,"recent":checked,"updatedAt":chrono::Utc::now().to_rfc3339()});
        c.execute("INSERT INTO memory_session(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",[value.to_string()]).app()?;
        return Ok(value);
    }
    let raw: Option<String> = c
        .query_row("SELECT payload FROM memory_session WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()
        .app()?;
    let mut value:Value=raw.and_then(|s|serde_json::from_str(&s).ok()).unwrap_or_else(||json!({"section":null,"node":null,"offset":0,"cursor":0,"sourceId":null,"sourcePage":null,"recent":[],"updatedAt":null}));
    if let Some(section) = value.get("section").and_then(Value::as_str) {
        if let Some(s) = project::section(&c, section)? {
            if value.get("node").and_then(Value::as_str).is_some_and(|id| {
                !section_passages(&s)
                    .unwrap_or_default()
                    .iter()
                    .any(|p| p.node.as_deref() == Some(id))
            }) {
                value["node"] = Value::Null;
                value["offset"] = json!(0);
            }
        } else {
            value["section"] = Value::Null;
            value["node"] = Value::Null;
            value["offset"] = json!(0);
        }
    }
    let mut recent = Vec::new();
    for item in value["recent"].as_array().into_iter().flatten().take(3) {
        let Some(section) = item["section"].as_str() else {
            continue;
        };
        if let Some(s) = project::section(&c, section)? {
            if s.kind == "scene"
                && (item["node"].is_null()
                    || section_passages(&s)?
                        .iter()
                        .any(|p| p.node.as_deref() == item["node"].as_str()))
            {
                recent.push(item.clone());
            }
        }
    }
    value["recent"] = json!(recent);
    Ok(value)
}

#[cfg(test)]
mod tests;

fn parse_mentions(passage: &Passage, output: &Value) -> Result<Vec<(String, String, usize, usize)>> {
    let mut mentions = Vec::new();
    for item in output
        .get("entities")
        .and_then(Value::as_array)
        .into_iter().flatten()
    {
        if item
            .get("score")
            .and_then(Value::as_f64)
            .is_none_or(|score| !score.is_finite() || score < 0.8)
        {
            continue;
        }
        let label = item
            .get("label")
            .and_then(Value::as_str)
            .ok_or("Type de mention manquant.")?;
        let text = item
            .get("text")
            .and_then(Value::as_str)
            .ok_or("Texte de mention manquant.")?;
        if !text.chars().any(char::is_uppercase) {
            continue;
        }
        let start = item
            .get("start")
            .and_then(Value::as_u64)
            .ok_or("Début de mention manquant.")? as usize;
        let end = item
            .get("end")
            .and_then(Value::as_u64)
            .ok_or("Fin de mention manquante.")? as usize;
        let (a, b) = codepoint_range(&passage.text, start, end)?;
        if passage.text.get(a..b) != Some(text) {
            return Err("Texte de mention non aligné.".into());
        }
        mentions.push((text.to_owned(), label.to_owned(), a, b));
    }
    Ok(mentions)
}
