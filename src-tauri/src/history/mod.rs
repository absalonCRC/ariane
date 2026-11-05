mod automatic;
mod branches;
pub use branches::{history_state, create_branch, switch_branch, promote_version, merge_preview, merge_branch, MergeResolution};
pub use automatic::checkpoint;
pub(crate) use automatic::checkpoint_with;
use crate::{
    error::{AppResult, Result},
    model::*,
    project,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Serialize, Deserialize, Default, Clone)]
pub(super) struct Snapshot {
    pub sections: Vec<Section>,
    #[serde(default)]
    pub settings: serde_json::Value,
    #[serde(default)]
    pub citations: Vec<(String, String)>,
    #[serde(default)]
    pub links: Vec<(String, String, String)>,
    #[serde(default)]
    pub pins: Vec<(String, String)>,
    #[serde(default)]
    pub annotations: Option<Vec<(String,String)>>,
}
pub(super) fn unpack(payload: &str) -> Result<Snapshot> {
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
        let mut c = project::database(root)?;
        let tx=c.transaction().app()?;
        let snapshot = snapshot(&tx, &scope)?;
        let version=insert(&tx, name, scope, snapshot)?;
        tx.commit().app()?;
        Ok(version)
    })
}
pub(super) fn snapshot(c: &Connection, scope: &Option<String>) -> Result<Snapshot> {
    let sections = if let Some(id) = &scope {
        project::validate_id(id)?;
        let mut q = c.prepare("WITH RECURSIVE chosen(id) AS (SELECT id FROM sections WHERE id=? UNION SELECT s.id FROM sections s JOIN chosen ON s.parent=chosen.id) SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included FROM sections WHERE id IN chosen ORDER BY position,id").app()?;
        let rows = q.query_map([id], project::row_section).app()?;
        rows.collect::<std::result::Result<Vec<_>,_>>().app()?
    } else { project::all_sections(c)? };
    let settings: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .unwrap_or("{}".into());
    let ids=serde_json::to_string(&sections.iter().map(|s|&s.id).collect::<Vec<_>>()).app()?;
    let mut query = c.prepare("SELECT id,payload FROM citations WHERE ?1 IS NULL OR EXISTS(SELECT 1 FROM sections WHERE id IN (SELECT value FROM json_each(?2)) AND instr(text,citations.id)>0) ORDER BY id").app()?;
    let citations = query
        .query_map(params![scope,ids], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    let mut query = c
        .prepare("SELECT section,source,payload FROM links WHERE section IN (SELECT value FROM json_each(?1)) ORDER BY section,source")
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
    let pins = if has_pins(c)? {
        let mut q = c.prepare("SELECT section,source FROM margin_pins WHERE section IN (SELECT value FROM json_each(?1)) ORDER BY section,source").app()?;
        let rows = q.query_map([&ids], |r| Ok((r.get(0)?, r.get(1)?))).app()?;
        rows.collect::<std::result::Result<Vec<_>, _>>().app()?
    } else { vec![] };
    let annotations = if c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='annotations')",[],|r|r.get::<_,bool>(0)).app()? {
        let mut q=c.prepare("SELECT id,payload FROM annotations WHERE ?1 IS NULL OR json_extract(payload,'$.section') IN (SELECT value FROM json_each(?2)) ORDER BY id").app()?;
        let values=q.query_map(params![scope,ids],|r|Ok((r.get(0)?,r.get(1)?))).app()?.collect::<std::result::Result<Vec<_>,_>>().app()?;
        Some(values)
    } else {Some(vec![])};
    Ok(Snapshot { sections, annotations, settings: serde_json::from_str(&settings).app()?, citations, links, pins })
}
fn has_pins(c: &Connection) -> Result<bool> {
    c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='margin_pins')", [], |r| r.get(0)).app()
}
pub(super) fn insert(c: &Connection, name: &str, scope: Option<String>, snapshot: Snapshot) -> Result<Version> {
    let payload = serde_json::to_string(&snapshot).app()?;
    let v = Version {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.trim().to_owned(),
        created: chrono::Utc::now().to_rfc3339(),
        scope,
        sections: snapshot.sections,
        automatic: false,
        branch_id: Some(branches::active(c)?),
        parent_id: c.query_row("SELECT head_version FROM history_branches WHERE id=?",[branches::active(c)?],|r|r.get(0)).app()?,
        session_id: None,
        merge_parent_id:None,
    };
    if v.name.is_empty() {
        return Err("Nommez cette version.".into());
    }
    c.execute(
        "INSERT INTO versions(id,name,created,scope,payload,branch_id,parent_id,session_id) VALUES(?,?,?,?,?,?,?,?)",
        params![v.id, v.name, v.created, v.scope, payload,v.branch_id,v.parent_id,v.session_id],
    )
    .app()?;
    if v.scope.is_none() && name != "Origine de la variante" {
        c.execute("UPDATE history_branches SET head_version=? WHERE id=?",params![v.id,v.branch_id]).app()?;
    }
    Ok(v)
}
// The list deliberately excludes manuscript payloads; a version is loaded on demand.
#[cfg(test)]
pub fn list(root: &Path) -> Result<Vec<Version>> { list_page(root, 0) }
pub fn list_page(root: &Path, offset: usize) -> Result<Vec<Version>> {
    let c = project::database(root)?;
    let mut q = c
        .prepare("SELECT v.id,v.name,v.created,v.scope,v.branch_id,v.parent_id,v.session_id,a.id IS NOT NULL,v.merge_parent_id FROM versions v LEFT JOIN automatic_versions a ON a.id=v.id WHERE COALESCE(v.branch_id,'main')=(SELECT value FROM meta WHERE key='active_branch') ORDER BY v.created DESC,v.id DESC LIMIT 50 OFFSET ?")
        .app()?;
    let rows = q
        .query_map([i64::try_from(offset).unwrap_or(i64::MAX)], |r| {
            Ok(Version {
                id: r.get(0)?,
                name: r.get(1)?,
                created: r.get(2)?,
                scope: r.get(3)?,
                sections: vec![],
                branch_id: r.get(4)?, parent_id:r.get(5)?,session_id:r.get(6)?,automatic:r.get(7)?,merge_parent_id:r.get(8)?,
            })
        })
        .app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}
pub fn get(root: &Path, id: &str) -> Result<Version> {
    let c = project::database(root)?;
    let mut v = c
        .query_row(
            "SELECT v.id,v.name,v.created,v.scope,v.branch_id,v.parent_id,v.session_id,a.id IS NOT NULL,v.merge_parent_id FROM versions v LEFT JOIN automatic_versions a ON a.id=v.id WHERE v.id=?",
            [id],
            |r| {
                Ok(Version {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created: r.get(2)?,
                    scope: r.get(3)?,
                    sections: vec![],
                    branch_id:r.get(4)?,parent_id:r.get(5)?,session_id:r.get(6)?,automatic:r.get(7)?,merge_parent_id:r.get(8)?,
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
    let mut c = project::database(root)?;
    if !branches::can_restore(&c, &v)? { return Err("Cette version appartient à une autre variante.".into()); }
    let payload: String = c.query_row("SELECT payload FROM versions WHERE id=?",[id],|r|r.get(0)).app()?;
    let restored=unpack(&payload)?;
    let current=snapshot(&c,&None)?;
    let mut next=restored.clone();
    if let Some(scope)=&v.scope {
        let affected:std::collections::HashSet<_>=descendants(&current.sections,scope).iter().map(|s|s.id.clone()).chain(restored.sections.iter().map(|s|s.id.clone())).collect();
        next=current.clone();
        next.sections.retain(|s|!affected.contains(&s.id));next.sections.extend(restored.sections);
        next.links.retain(|(section,_,_)|!affected.contains(section));next.links.extend(restored.links);
        next.pins.retain(|(section,_)|!affected.contains(section));next.pins.extend(restored.pins);
        if let Some(annotations)=restored.annotations {
            let values=next.annotations.get_or_insert_with(Vec::new);
            values.retain(|(_,payload)|serde_json::from_str::<serde_json::Value>(payload).ok().and_then(|v|v["section"].as_str().map(str::to_owned)).is_none_or(|id|!affected.contains(&id)));
            values.extend(annotations);
        }
        for (id,payload) in restored.citations {next.citations.retain(|(existing,_)|*existing!=id);next.citations.push((id,payload));}
    }
    branches::validate(&next)?;
    let tx=c.transaction().app()?;
    insert(&tx,"Avant restauration",v.scope.clone(),snapshot(&tx,&v.scope)?)?;
    branches::replace(&tx,root,&next)?;
    tx.commit().app()?;
    branches::load_applied(root)
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
        assert_eq!(list(d.path()).unwrap().len(), 3);
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
