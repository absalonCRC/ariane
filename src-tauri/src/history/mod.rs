use crate::{
    error::{AppResult, Result},
    model::*,
    project,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Serialize, Deserialize, Default)]
struct Snapshot {
    sections: Vec<Section>,
    #[serde(default)]
    settings: serde_json::Value,
    #[serde(default)]
    citations: Vec<(String, String)>,
    #[serde(default)]
    links: Vec<(String, String, String)>,
}
fn unpack(payload: &str) -> Result<Snapshot> {
    if payload.trim_start().starts_with('[') {
        Ok(Snapshot {
            sections: serde_json::from_str(payload).app()?,
            ..Default::default()
        })
    } else {
        serde_json::from_str(payload).app()
    }
}
pub fn descendants(all: &[Section], id: &str) -> Vec<Section> {
    let ids = project::tree::descendant_ids(all, [id]);
    all.iter()
        .filter(|s| ids.contains(&s.id))
        .cloned()
        .collect()
}
pub fn capture(root: &Path, name: &str, scope: Option<String>) -> Result<Version> {
    crate::project::with_lock(root, || {
    let c = project::database(root)?;
    let sections = if let Some(id) = &scope {
        project::validate_id(id)?;
        let mut q = c.prepare("WITH RECURSIVE chosen(id) AS (SELECT id FROM sections WHERE id=? UNION SELECT s.id FROM sections s JOIN chosen ON s.parent=chosen.id) SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included FROM sections WHERE id IN chosen ORDER BY position,id").app()?;
        let rows = q.query_map([id], project::row_section).app()?;
        rows.collect::<std::result::Result<Vec<_>,_>>().app()?
    } else { project::all_sections(&c)? };
    let settings: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .unwrap_or("{}".into());
    let ids=serde_json::to_string(&sections.iter().map(|s|&s.id).collect::<Vec<_>>()).app()?;
    let mut query = c.prepare("SELECT id,payload FROM citations WHERE ?1 IS NULL OR EXISTS(SELECT 1 FROM sections WHERE id IN (SELECT value FROM json_each(?2)) AND instr(text,citations.id)>0)").app()?;
    let citations = query
        .query_map(params![scope,ids], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    let mut query = c
        .prepare("SELECT section,source,payload FROM links WHERE section IN (SELECT value FROM json_each(?1))")
        .app()?;
    let links = query
        .query_map([&ids], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    let payload = serde_json::to_string(&Snapshot {
        sections: sections.clone(),
        settings: serde_json::from_str(&settings).app()?,
        citations,
        links,
    })
    .app()?;
    let v = Version {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.trim().to_owned(),
        created: chrono::Utc::now().to_rfc3339(),
        scope,
        sections,
    };
    if v.name.is_empty() {
        return Err("Nommez cette version.".into());
    }
    c.execute(
        "INSERT INTO versions VALUES(?,?,?,?,?)",
        params![v.id, v.name, v.created, v.scope, payload],
    )
    .app()?;
    Ok(v)
    })
}
// The list deliberately excludes manuscript payloads; a version is loaded on demand.
#[cfg(test)]
pub fn list(root: &Path) -> Result<Vec<Version>> { list_page(root, 0) }
pub fn list_page(root: &Path, offset: usize) -> Result<Vec<Version>> {
    let c = project::database(root)?;
    let mut q = c
        .prepare("SELECT id,name,created,scope FROM versions ORDER BY created DESC,id DESC LIMIT 50 OFFSET ?")
        .app()?;
    let rows = q
        .query_map([i64::try_from(offset).unwrap_or(i64::MAX)], |r| {
            Ok(Version {
                id: r.get(0)?,
                name: r.get(1)?,
                created: r.get(2)?,
                scope: r.get(3)?,
                sections: vec![],
            })
        })
        .app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}
pub fn get(root: &Path, id: &str) -> Result<Version> {
    let c = project::database(root)?;
    let mut v = c
        .query_row(
            "SELECT id,name,created,scope FROM versions WHERE id=?",
            [id],
            |r| {
                Ok(Version {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created: r.get(2)?,
                    scope: r.get(3)?,
                    sections: vec![],
                })
            },
        )
        .app()?;
    let payload: String = c
        .query_row("SELECT payload FROM versions WHERE id=?", [id], |r| {
            r.get(0)
        })
        .app()?;
    v.sections = unpack(&payload)?.sections;
    Ok(v)
}
pub fn restore(root: &Path, id: &str) -> Result<Project> {
    crate::project::with_lock(root, || {
    if let Some(id) = project::load(root)?.conflicts.first() {
        return Err(format!("EXTERNAL:{id}"));
    }
    let v = get(root, id)?;
    for section in &v.sections {
        project::validate_id(&section.id)?;
        if let Some(parent) = &section.parent { project::validate_id(parent)?; }
        if let Some(outline) = &section.outline { project::validate_outline(outline,&section.text)?; }
    }
    capture(root, "Avant restauration", v.scope.clone())?;
    let mut c = project::database(root)?;
    let payload: String = c
        .query_row("SELECT payload FROM versions WHERE id=?", [id], |r| {
            r.get(0)
        })
        .app()?;
    let snapshot = unpack(&payload)?;
    for section in &snapshot.sections {
        project::validate_id(&section.id)?;
        if let Some(parent) = &section.parent { project::validate_id(parent)?; }
        if let Some(outline) = &section.outline { project::validate_outline(outline, &section.text)?; }
    }
    let before = project::all_sections(&c)?;
    let affected = if let Some(scope) = &v.scope {
        descendants(&before, scope)
    } else {
        before.clone()
    };
    let tx = c.transaction().app()?;
    for s in &affected {
        tx.execute("DELETE FROM sections WHERE id=?", [&s.id])
            .app()?;
        tx.execute("DELETE FROM links WHERE section=?", [&s.id])
            .app()?;
    }
    for s in &snapshot.sections {
        if let Some(outline) = &s.outline {
            crate::project::validate_outline(outline, &s.text)?;
        }
        let rev = before
            .iter()
            .find(|old| old.id == s.id)
            .map_or(s.revision, |old| old.revision)
            + 1;
        tx.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,synopsis,status,goal,mirror,outline,role,trashed,included) VALUES(?,?,?,?,?,?,?,?,?,?,'',?,?,?,?)",params![s.id,s.parent,s.title,s.kind,s.position,s.text,rev,s.synopsis,s.status,s.goal,s.outline.as_ref().map(serde_json::to_string).transpose().app()?,s.role,s.trashed,s.included]).app()?;
    }
    if v.scope.is_none() {
        tx.execute("DELETE FROM citations", []).app()?;
        tx.execute(
            "INSERT OR REPLACE INTO meta VALUES('settings',?)",
            [snapshot.settings.to_string()],
        )
        .app()?;
    }
    for (id, payload) in snapshot.citations {
        tx.execute(
            "INSERT OR REPLACE INTO citations VALUES(?,?)",
            params![id, payload],
        )
        .app()?;
    }
    for (section, id, payload) in snapshot.links {
        tx.execute(
            "INSERT OR REPLACE INTO links VALUES(?,?,?)",
            params![section, id, payload],
        )
        .app()?;
    }
    tx.execute("DELETE FROM structure_history", []).app()?;
    tx.commit().app()?;
    project::load(root)
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn captures_metadata_only_change_and_restores_outline() {
        let d = tempfile::tempdir().unwrap();
        let id = project::create(d.path(), "A").unwrap().sections[0].id.clone();
        project::save(d.path(), vec![TextPatch {
            id: id.clone(), revision: 0, text: "A\nB".into(), outline: None,
        }]).unwrap();
        let first = Outline { version: 1, nodes: vec![
            OutlineNode { id: "a".into(), parent: None, start: 0 },
            OutlineNode { id: "b".into(), parent: Some("a".into()), start: 2 },
        ] };
        project::save(d.path(), vec![TextPatch {
            id: id.clone(), revision: 1, text: "A\nB".into(), outline: Some(first.clone()),
        }]).unwrap();
        let auto = list(d.path()).unwrap().into_iter().find(|v| v.name == "Sauvegarde automatique").unwrap();
        assert_eq!(get(d.path(), &auto.id).unwrap().sections[0].outline, None);
        let saved = capture(d.path(), "Structured", Some(id.clone())).unwrap();
        project::save(d.path(), vec![TextPatch {
            id, revision: 2, text: "A\nB".into(), outline: Some(Outline { version: 1, nodes: vec![
                OutlineNode { id: "a".into(), parent: None, start: 0 },
                OutlineNode { id: "b".into(), parent: None, start: 2 },
            ] }),
        }]).unwrap();
        let restored = restore(d.path(), &saved.id).unwrap();
        assert_eq!(restored.sections[0].outline, Some(first));
    }
    #[test]
    fn legacy_snapshot_without_outline_restores() {
        let d = tempfile::tempdir().unwrap();
        let p = project::create(d.path(), "A").unwrap();
        let id = &p.sections[0].id;
        let payload = serde_json::json!([{
            "id": id, "parent": null, "title": "Old", "kind": "scene", "position": 1,
            "text": "legacy", "revision": 0, "synopsis": "", "status": "Brouillon", "goal": 0
        }]);
        let c = project::database(d.path()).unwrap();
        c.execute("INSERT INTO versions(id,name,created,scope,payload) VALUES('legacy','Legacy','2020-01-01T00:00:00Z',NULL,?)", [payload.to_string()]).unwrap();
        drop(c);
        let restored = restore(d.path(), "legacy").unwrap();
        assert_eq!(restored.sections[0].text, "legacy");
        assert_eq!(restored.sections[0].outline, None);
    }
    #[test]
    fn restores_text_and_keeps_current_history() {
        let d = tempfile::tempdir().unwrap();
        let p = project::create(d.path(), "A").unwrap();
        let id = p.sections[0].id.clone();
        let v = capture(d.path(), "Original", None).unwrap();
        project::save(
            d.path(),
            vec![TextPatch {
                id,
                revision: 0,
                text: "modifié".into(),
                outline: None,
            }],
        )
        .unwrap();
        assert_eq!(restore(d.path(), &v.id).unwrap().sections[0].text, "");
        assert_eq!(list(d.path()).unwrap().len(), 2);
        assert!(list(d.path()).unwrap()[0].sections.is_empty());
    }
    #[test]
    fn scoped_snapshot_removes_new_children_and_preserves_other_scenes() {
        let d = tempfile::tempdir().unwrap();
        let p = project::create(d.path(), "A").unwrap();
        let id = p.sections[0].id.clone();
        let v = capture(d.path(), "Scène", Some(id.clone())).unwrap();
        project::add(d.path(), Some(id.clone()), "Sous-scène", "scene").unwrap();
        project::add(d.path(), None, "Autre", "scene").unwrap();
        let restored = restore(d.path(), &v.id).unwrap();
        assert_eq!(restored.sections.len(), 2);
        assert!(restored.sections.iter().any(|s| s.title == "Autre"));
        assert!(!restored.sections.iter().any(|s| s.title == "Sous-scène"));
    }
}
