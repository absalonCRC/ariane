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
    let mut ids = std::collections::HashSet::from([id.to_owned()]);
    loop {
        let old = ids.len();
        for s in all {
            if s.parent.as_ref().is_some_and(|p| ids.contains(p)) {
                ids.insert(s.id.clone());
            }
        }
        if ids.len() == old {
            break;
        }
    }
    all.iter()
        .filter(|s| ids.contains(&s.id))
        .cloned()
        .collect()
}
pub fn capture(root: &Path, name: &str, scope: Option<String>) -> Result<Version> {
    let c = project::database(root)?;
    let all = project::sections(&c)?;
    let sections = scope
        .as_ref()
        .map_or(all.clone(), |id| descendants(&all, id));
    let settings: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .unwrap_or("{}".into());
    let mut query = c.prepare("SELECT id,payload FROM citations").app()?;
    let citations = query
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    let mut query = c
        .prepare("SELECT section,source,payload FROM links")
        .app()?;
    let links = query
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?
        .into_iter()
        .filter(|(id, _, _)| sections.iter().any(|s| s.id == *id))
        .collect();
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
}
// The list deliberately excludes manuscript payloads; a version is loaded on demand.
pub fn list(root: &Path) -> Result<Vec<Version>> {
    let c = project::database(root)?;
    let mut q = c
        .prepare("SELECT id,name,created,scope FROM versions ORDER BY created DESC")
        .app()?;
    let rows = q
        .query_map([], |r| {
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
    if let Some(id) = project::load(root)?.conflicts.first() {
        return Err(format!("EXTERNAL:{id}"));
    }
    let v = get(root, id)?;
    capture(root, "Avant restauration", v.scope.clone())?;
    let mut c = project::database(root)?;
    let payload: String = c
        .query_row("SELECT payload FROM versions WHERE id=?", [id], |r| {
            r.get(0)
        })
        .app()?;
    let snapshot = unpack(&payload)?;
    let before = project::sections(&c)?;
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
        tx.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,synopsis,status,goal,mirror,outline) VALUES(?,?,?,?,?,?,?,?,?,?,'',?)",params![s.id,s.parent,s.title,s.kind,s.position,s.text,rev,s.synopsis,s.status,s.goal,s.outline.as_ref().map(serde_json::to_string).transpose().app()?]).app()?;
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
    tx.commit().app()?;
    project::load(root)
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
