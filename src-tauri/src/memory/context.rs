use super::GEMMA_MODEL;
use super::{entities, row_passage, section_passages, storage, terms, Passage, Vectors};
use crate::{
    error::{AppResult, Result},
    project,
};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::path::Path;
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
        let lexical_query = if anchor_terms.is_empty() {
            "\"___no_terms___\"".to_owned()
        } else {
            anchor_terms
                .iter()
                .map(|t| format!("\"{t}\""))
                .collect::<Vec<_>>()
                .join(" OR ")
        };
        let model = anchor_vector
            .as_ref()
            .map(|(m, _)| m.as_str())
            .unwrap_or("");
        let mut q = c
            .prepare(
                "SELECT key,section,node,title,text,hash,position,vector,model FROM memory_passages
            WHERE key<>? AND hash<>? AND ((vector IS NOT NULL AND model=?)
            OR key IN (SELECT key FROM memory_fts WHERE memory_fts MATCH ?))",
            )
            .app()?;
        let rows = q
            .query_map(
                params![anchor.key, anchor.hash, model, lexical_query],
                |r| {
                    Ok((
                        row_passage(r)?,
                        crate::vectors::decode_group(r.get_ref(7)?),
                        r.get::<_, Option<String>>(8)?,
                    ))
                },
            )
            .app()?;
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
                (Some((a_model, a)), Some(raw), Some(model)) if a_model == &model => Some(raw)
                    .and_then(|b| {
                        a.iter()
                            .flat_map(|q| b.iter().map(move |v| crate::inference::cosine(q, v)))
                            .max_by(f64::total_cmp)
                    }),
                _ => None,
            };
            // 300M scores are lower than Gemma 2: exploratory French corpus calibration.
            let score = if let Some(score) = semantic.filter(|s| {
                *s >= if anchor_vector
                    .as_ref()
                    .is_some_and(|(m, _)| m == GEMMA_MODEL)
                {
                    crate::retrieval::ranking::RECALL_THRESHOLD
                } else {
                    0.85
                }
            }) {
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
    c.query_row(
        "SELECT model,query_vector FROM memory_passages WHERE section=? AND node IS ? AND model=?",
        params![section, node, GEMMA_MODEL],
        |r| {
            Ok(r.get::<_, String>(0)
                .ok()
                .zip(crate::vectors::decode_group(r.get_ref(1)?)))
        },
    )
    .optional()
    .app()
    .map(Option::flatten)
}

pub fn dismiss(root: &Path, id: &str, hash: &str) -> Result<()> {
    let c = storage::database(root)?;
    c.execute(
        "INSERT OR IGNORE INTO memory_dismissals(id,hash) VALUES(?,?)",
        params![id, hash],
    )
    .app()?;
    c.execute("DELETE FROM memory_results WHERE json_extract(payload,'$.recall.id')=?1 OR json_extract(payload,'$.evidence.id')=?1",[id]).app()?;
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
