mod extract;
#[cfg(test)]
mod tests;

use crate::{
    error::{AppResult, Result},
    model::{Section, Source},
    project, vaults,
};
use extract::{Catalog, Evidence};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::Path,
};

const VERSION: &str = "node-instances-fr-1";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedField {
    pub field: String,
    pub value: String,
    pub target: Option<String>,
    pub evidence: Vec<String>,
    pub status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Passage {
    #[serde(flatten)]
    pub evidence: Evidence,
    pub section_title: String,
    pub quote: String,
    pub line: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Enrichment {
    pub fields: Vec<DerivedField>,
    pub passages: Vec<Passage>,
    pub ignored: usize,
}
fn schema(c: &Connection) -> Result<()> {
    c.execute_batch("CREATE TABLE IF NOT EXISTS enrichment_batches(section TEXT PRIMARY KEY,hash TEXT NOT NULL,catalog TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS enrichment_evidence(id TEXT PRIMARY KEY,section TEXT NOT NULL,hash TEXT NOT NULL,source TEXT NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS enrichment_source ON enrichment_evidence(source);
        CREATE TABLE IF NOT EXISTS enrichment_ignored(id TEXT PRIMARY KEY);").app()
}
fn enabled(c: &Connection) -> Result<bool> {
    let raw: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .app()?;
    let value: Value = serde_json::from_str(&raw).app()?;
    Ok(value["enrichment"].as_bool().unwrap_or(true))
}
fn section_hash(section: &Section) -> Result<String> {
    Ok(project::hash(&format!(
        "{}\0{}",
        section.text,
        serde_json::to_string(&section.outline).app()?
    )))
}
struct NodeView<'a> {
    id: Option<&'a str>,
    text: &'a str,
    line: usize,
}
fn node_views(section: &Section) -> Result<Vec<NodeView<'_>>> {
    let Some(outline) = &section.outline else {
        // Legacy sections have no durable block IDs until the editor saves their outline.
        // Reference the original section itself; never invent a second content node.
        return Ok(vec![NodeView {
            id: None,
            text: &section.text,
            line: 1,
        }]);
    };
    project::validate_outline(outline, &section.text)?;
    let mut starts = Vec::with_capacity(outline.nodes.len());
    let mut utf16 = 0;
    let mut line = 1;
    for (byte, ch) in section.text.char_indices() {
        if outline
            .nodes
            .get(starts.len())
            .is_some_and(|n| n.start == utf16)
        {
            starts.push((byte, line));
        }
        utf16 += ch.len_utf16();
        if ch == '\n' {
            line += 1;
        }
    }
    if outline
        .nodes
        .get(starts.len())
        .is_some_and(|n| n.start == utf16)
    {
        starts.push((section.text.len(), line));
    }
    Ok(outline
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| {
            let (start, line) = starts[i];
            let end = starts
                .get(i + 1)
                .map_or(section.text.len(), |(byte, _)| *byte);
            NodeView {
                id: Some(&n.id),
                text: section.text[start..end].trim_end_matches('\n'),
                line,
            }
        })
        .collect())
}
fn instances(catalog: &Catalog<'_>, section: &Section) -> Result<Vec<Evidence>> {
    let mut out = vec![];
    let mut fence = None;
    for node in node_views(section)? {
        let mut by_source: BTreeMap<String, Evidence> = BTreeMap::new();
        for mut e in catalog.extract(&section.id, node.text, &mut fence) {
            if let Some(existing) = by_source.get_mut(&e.source) {
                for fact in e.facts {
                    if !existing.facts.contains(&fact) {
                        existing.facts.push(fact);
                    }
                }
                for related in e.related {
                    if !existing.related.iter().any(|r| r.id == related.id) {
                        existing.related.push(related);
                    }
                }
                existing.uncertain |= e.uncertain;
            } else {
                e.node = node.id.map(str::to_owned);
                e.id = project::hash(&format!(
                    "{}\0{}\0{}",
                    section.id,
                    node.id.unwrap_or(""),
                    e.source
                ));
                e.quote = node.text.into();
                e.line = node.line;
                by_source.insert(e.source.clone(), e);
            }
        }
        out.extend(by_source.into_values());
    }
    Ok(out)
}
/// Called after an idle, saved editor state. No model process or vault write is involved.
pub fn run(root: &Path, index: &Path) -> Result<Value> {
    let mut c = project::database(root)?;
    schema(&c)?;
    if !enabled(&c)? {
        return Ok(json!({"changed":false,"analyzed":0}));
    }
    let available: Vec<_> = vaults::list(root, index)?
        .into_iter()
        .filter(|v| v.available)
        .collect();
    let mut sources: Vec<_> = vaults::all(index, &available)?
        .into_iter()
        .filter(|s| s.path.to_lowercase().ends_with(".md"))
        .collect();
    sources.sort_by(|a, b| a.id.cmp(&b.id));
    let catalog_hash = project::hash(&format!(
        "{VERSION}:{}",
        sources
            .iter()
            .map(|s| format!("{}:{}", s.id, s.fingerprint))
            .collect::<Vec<_>>()
            .join("|")
    ));
    let sections = project::sections(&c)?;
    let mut pending = vec![];
    for section in sections.iter().filter(|s| s.kind == "scene") {
        let hash = section_hash(section)?;
        let unchanged: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM enrichment_batches WHERE section=? AND hash=? AND catalog=?)", params![section.id,hash,catalog_hash], |r| r.get(0)).app()?;
        if !unchanged {
            pending.push((section, hash));
        }
    }
    if pending.is_empty() {
        return Ok(json!({"changed":false,"analyzed":0}));
    }
    let catalog = Catalog::new(&sources)?;
    let mut analyzed = 0;
    for (section, hash) in pending {
        let evidence = instances(&catalog, section)?;
        let tx = c
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .app()?;
        if !enabled(&tx)? {
            break;
        }
        // A save, restore or external-conflict resolution during analysis invalidates this batch.
        let current = project::section(&tx, &section.id)?;
        if current.as_ref().map(section_hash).transpose()?.as_deref() != Some(&hash) {
            continue;
        }
        tx.execute(
            "DELETE FROM enrichment_evidence WHERE section=?",
            [&section.id],
        )
        .app()?;
        for e in evidence {
            tx.execute(
                "INSERT OR REPLACE INTO enrichment_evidence VALUES(?,?,?,?,?,?)",
                params![
                    e.id,
                    section.id,
                    project::hash(&e.quote),
                    e.source,
                    e.fingerprint,
                    serde_json::to_string(&e).app()?
                ],
            )
            .app()?;
        }
        tx.execute(
            "INSERT OR REPLACE INTO enrichment_batches VALUES(?,?,?)",
            params![section.id, hash, catalog_hash],
        )
        .app()?;
        tx.commit().app()?;
        analyzed += 1;
    }
    Ok(json!({"changed":analyzed > 0,"analyzed":analyzed}))
}
fn empty(value: &Value) -> bool {
    value.is_null()
        || value.as_str().is_some_and(|s| s.trim().is_empty())
        || value.as_array().is_some_and(Vec::is_empty)
}
fn normalized_value(value: &str) -> String {
    vaults::parse::normalize(value.trim().trim_start_matches("[[").trim_end_matches("]]"))
}
pub fn decorate(root: &Path, index: &Path, sources: &mut [Source]) -> Result<()> {
    if sources.is_empty() { return Ok(()); }
    let c = project::database(root)?;
    schema(&c)?;
    if !enabled(&c)? {
        return Ok(());
    }
    let mut needed = HashSet::new();
    let mut query = c.prepare("SELECT DISTINCT section FROM enrichment_evidence WHERE source=? AND fingerprint=?").app()?;
    for source in sources.iter() {
        let ids = query.query_map(params![source.id, source.fingerprint], |r| r.get::<_,String>(0)).app()?;
        for id in ids { needed.insert(id.app()?); }
    }
    if needed.is_empty() { return Ok(()); }
    let allowed = crate::retrieval::available_source_ids(root, index)?;
    let mut sections = HashMap::new();
    for id in needed {
        if let Some(section) = project::section(&c, &id)? { sections.insert(id, section); }
    }
    let nodes: HashMap<_, _> = sections
        .iter()
        .map(|(id, s)| Ok((id.clone(), node_views(s)?)))
        .collect::<Result<_>>()?;
    let mut q = c.prepare("SELECT e.payload,s.title,e.hash,i.id IS NOT NULL FROM enrichment_evidence e JOIN sections s ON s.id=e.section LEFT JOIN enrichment_ignored i ON i.id=e.id WHERE e.source=? AND e.fingerprint=? ORDER BY s.position,e.id").app()?;
    for source in sources {
        if !allowed.contains(&source.id) {
            continue;
        }
        let rows = q
            .query_map(params![source.id, source.fingerprint], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, bool>(3)?,
                ))
            })
            .app()?;
        let mut passages = vec![];
        let mut ignored = 0;
        for row in rows {
            let (payload, section_title, hash, rejected) = row.app()?;
            let mut evidence: Evidence = serde_json::from_str(&payload).app()?;
            let Some(node) = nodes
                .get(&evidence.section)
                .and_then(|views| views.iter().find(|n| n.id == evidence.node.as_deref()))
            else {
                continue;
            };
            if project::hash(node.text) != hash {
                continue;
            }
            if rejected {
                ignored += 1;
                continue;
            }
            evidence.related.retain(|r| allowed.contains(&r.id));
            evidence
                .facts
                .retain(|f| f.target.as_ref().is_none_or(|id| allowed.contains(id)));
            passages.push(Passage {
                evidence,
                section_title,
                quote: node.text.into(),
                line: node.line,
            });
        }
        passages.sort_by_key(|p| (sections[&p.evidence.section].position, p.line));
        let mut groups: BTreeMap<String, Vec<DerivedField>> = BTreeMap::new();
        for p in &passages {
            for fact in &p.evidence.facts {
                let values = groups.entry(fact.field.clone()).or_default();
                if let Some(v) = values
                    .iter_mut()
                    .find(|f| normalized_value(&f.value) == normalized_value(&fact.value))
                {
                    v.evidence.push(p.evidence.id.clone());
                } else {
                    values.push(DerivedField {
                        field: fact.field.clone(),
                        value: fact.value.clone(),
                        target: fact.target.clone(),
                        evidence: vec![p.evidence.id.clone()],
                        status: "derived".into(),
                    });
                }
            }
        }
        let mut fields = vec![];
        for (key, mut values) in groups {
            let existing = &source.fields[&key];
            let occupied = !empty(existing);
            let conflict = values.len() > 1;
            for value in &mut values {
                value.status = if occupied {
                    if existing
                        .as_str()
                        .is_some_and(|s| normalized_value(s) == normalized_value(&value.value))
                    {
                        "confirmed"
                    } else {
                        "conflict"
                    }
                } else if conflict {
                    "conflict"
                } else {
                    "derived"
                }
                .into();
            }
            // The original index and Markdown stay untouched. Only this project view is enriched.
            if !occupied && !conflict {
                if let Some(map) = source.fields.as_object_mut() {
                    map.insert(key, Value::String(values[0].value.clone()));
                }
            }
            fields.extend(values);
        }
        if !passages.is_empty() || ignored > 0 {
            source.enrichment = Some(Enrichment {
                fields,
                passages,
                ignored,
            });
        }
    }
    Ok(())
}
pub fn ignore(root: &Path, index: &Path, source: &str, evidence: Option<&str>) -> Result<()> {
    vaults::source(index, source, &vaults::list(root, index)?)?;
    let c = project::database(root)?;
    schema(&c)?;
    if let Some(evidence) = evidence {
        c.execute("INSERT OR IGNORE INTO enrichment_ignored SELECT id FROM enrichment_evidence WHERE id=? AND source=?", params![evidence,source]).app()?;
    } else {
        c.execute("DELETE FROM enrichment_ignored WHERE id IN (SELECT id FROM enrichment_evidence WHERE source=?)", [source]).app()?;
    }
    Ok(())
}
