//! Append-only, project-local note activity. No manuscript bodies are stored here.
use crate::error::{AppResult, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub kind: String,
    pub title: String,
    pub source_id: Option<String>,
    pub entity_id: Option<String>,
    pub section: Option<String>,
    pub dedup_key: Option<String>,
}
fn database(root: &Path) -> Result<rusqlite::Connection> {
    let c = super::database(root)?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS note_activity(id INTEGER PRIMARY KEY AUTOINCREMENT,created TEXT NOT NULL,dedup TEXT UNIQUE,payload TEXT NOT NULL);").app()?;
    Ok(c)
}
pub fn record(root: &Path, value: EventInput) -> Result<serde_json::Value> {
    if ![
        "detected",
        "suggested",
        "opened",
        "consulted",
        "created",
        "classified",
        "associated",
        "cited",
        "pinned",
        "unpinned",
        "updated",
        "resolved",
        "dismissed",
    ]
    .contains(&value.kind.as_str())
        || value.title.len() > 16384
        || value.source_id.as_ref().is_some_and(|s| s.len() > 8192)
        || value.entity_id.as_ref().is_some_and(|s| s.len() > 8192)
        || value.section.as_ref().is_some_and(|s| s.len() > 8192)
        || value.dedup_key.as_ref().is_some_and(|s| s.len() > 32768)
    {
        return Err("Événement de note invalide.".into());
    }
    let c = database(root)?;
    let created = chrono::Utc::now().to_rfc3339();
    let payload = serde_json::to_string(&value).app()?;
    let inserted = c.execute("INSERT INTO note_activity(created,dedup,payload) VALUES(?,?,?) ON CONFLICT(dedup) DO NOTHING",params![created,value.dedup_key,payload]).app()? > 0;
    let (id, date, raw): (i64, String, String) = if inserted {
        (c.last_insert_rowid(), created, payload)
    } else {
        c.query_row(
            "SELECT id,created,payload FROM note_activity WHERE dedup=?",
            [&value.dedup_key],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .app()?
    };
    Ok(serde_json::json!({"inserted":inserted,"event":event(id,date,raw)?}))
}
fn event(id: i64, created: String, raw: String) -> Result<serde_json::Value> {
    let mut value: serde_json::Value = serde_json::from_str(&raw).app()?;
    value["id"] = id.into();
    value["created"] = created.into();
    Ok(value)
}
pub fn list(root: &Path, before: Option<i64>) -> Result<serde_json::Value> {
    let c = database(root)?;
    let mut q=c.prepare("SELECT id,created,payload FROM note_activity WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT 51").app()?;
    let rows = q
        .query_map(params![before, before], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .app()?;
    let mut items = rows
        .map(|row| {
            let (id, date, raw) = row.app()?;
            event(id, date, raw)
        })
        .collect::<Result<Vec<_>>>()?;
    let has_more = items.len() > 50;
    items.truncate(50);
    Ok(serde_json::json!({"items":items,"hasMore":has_more}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(key: Option<&str>) -> EventInput {
        EventInput {
            kind: "detected".into(),
            title: "Élise 🌿".into(),
            source_id: Some("note".into()),
            entity_id: None,
            section: None,
            dedup_key: key.map(str::to_owned),
        }
    }
    #[test]
    fn persists_and_deduplicates_automatic_events_but_retains_new_actions() {
        let dir = tempfile::tempdir().unwrap();
        super::super::create(dir.path(), "Témoin").unwrap();
        let first = record(dir.path(), input(Some("detection:one"))).unwrap();
        assert_eq!(first["inserted"], true);
        assert_eq!(
            record(dir.path(), input(Some("detection:one"))).unwrap()["inserted"],
            false
        );
        record(dir.path(), input(None)).unwrap();
        let page = list(dir.path(), None).unwrap();
        assert_eq!(page["items"].as_array().unwrap().len(), 2);
        assert_eq!(page["items"][0]["title"], "Élise 🌿");
        assert_ne!(page["items"][0]["id"], page["items"][1]["id"]);
        let other = tempfile::tempdir().unwrap();
        super::super::create(other.path(), "Autre").unwrap();
        assert!(list(other.path(), None).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn cursor_pagination_keeps_every_event_when_new_ones_arrive() {
        let dir = tempfile::tempdir().unwrap();
        super::super::create(dir.path(), "Témoin").unwrap();
        for _ in 0..55 {
            record(dir.path(), input(None)).unwrap();
        }
        let first = list(dir.path(), None).unwrap();
        assert_eq!(first["hasMore"], true);
        let before = first["items"][49]["id"].as_i64().unwrap();
        record(dir.path(), input(None)).unwrap();
        let next = list(dir.path(), Some(before)).unwrap();
        assert_eq!(next["items"].as_array().unwrap().len(), 5);
        assert_eq!(next["hasMore"], false);
        assert_eq!(list(dir.path(), None).unwrap()["items"][0]["id"], 56);
        let mut bad = input(None);
        bad.kind = "unknown".into();
        assert!(record(dir.path(), bad).is_err());
    }
}
