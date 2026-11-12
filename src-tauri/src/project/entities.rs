//! Confirmed identities belong to the project, independently of derived NER and source paths.
use crate::{
    error::{AppResult, Result},
    project,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub aliases: Vec<String>,
    pub source_ids: Vec<String>,
    pub detected_ids: Vec<String>,
    pub confirmed: bool,
    #[serde(default)]
    pub redirect: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Provenance {
    pub source: Option<String>,
    pub section: Option<String>,
    pub node: Option<String>,
    pub quote: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Relation {
    pub id: String,
    pub from: String,
    pub to: String,
    pub name: String,
    pub status: String,
    pub provenance: Option<Provenance>,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Catalog {
    pub revision: u64,
    pub entities: Vec<Identity>,
    pub relations: Vec<Relation>,
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Operation {
    Save {
        entity: Identity,
    },
    Relation {
        relation: Relation,
    },
    RemoveRelation {
        id: String,
    },
    Merge {
        source: String,
        target: String,
        token: String,
    },
    UndoMerge {
        id: String,
    },
}
pub fn read(c: &Connection) -> Result<Catalog> {
    let payload: Option<String> = c
        .query_row(
            "SELECT value FROM meta WHERE key='entity_catalog'",
            [],
            |r| r.get(0),
        )
        .optional()
        .app()?;
    payload
        .map(|p| serde_json::from_str(&p).app())
        .unwrap_or(Ok(Catalog::default()))
}
pub fn write(c: &Connection, catalog: &Catalog) -> Result<()> {
    validate(catalog)?;
    let mut next = catalog.clone();
    next.revision = read(c)?.revision.max(catalog.revision) + 1;
    c.execute(
        "INSERT OR REPLACE INTO meta VALUES('entity_catalog',?)",
        [serde_json::to_string(&next).app()?],
    )
    .app()?;
    Ok(())
}
pub fn validate(catalog: &Catalog) -> Result<()> {
    if catalog.entities.len() > 20000 || catalog.relations.len() > 50000 {
        return Err("Catalogue trop volumineux.".into());
    }
    let mut ids = std::collections::HashSet::new();
    for e in &catalog.entities {
        project::validate_id(&e.id)?;
        if !ids.insert(&e.id)
            || e.title.trim().is_empty()
            || e.title.chars().count() > 200
            || e.kind.trim().is_empty()
            || e.aliases.len() > 100
            || e.aliases.iter().any(|a| a.chars().count() > 200)
        {
            return Err("Identité invalide.".into());
        }
    }
    for e in &catalog.entities {
        let mut seen = std::collections::HashSet::new();
        let mut current = e;
        while let Some(id) = &current.redirect {
            if !seen.insert(id) {
                return Err("Redirection circulaire.".into());
            }
            current = catalog
                .entities
                .iter()
                .find(|v| &v.id == id)
                .ok_or("Identité introuvable.")?;
        }
    }
    let mut relations = std::collections::HashSet::new();
    for r in &catalog.relations {
        project::validate_id(&r.id)?;
        if !relations.insert(&r.id)
            || !ids.contains(&r.from)
            || !ids.contains(&r.to)
            || r.name.trim().is_empty()
            || r.name.len() > 400
            || !["proposed", "confirmed"].contains(&r.status.as_str())
            || r.provenance.as_ref().is_some_and(|p| p.quote.len() > 16000)
        {
            return Err("Relation invalide.".into());
        }
    }
    Ok(())
}
fn fingerprint(v: &Catalog) -> Result<String> {
    Ok(project::hash(&serde_json::to_string(v).app()?))
}
fn content_fingerprint(catalog: &Catalog) -> Result<String> {
    let mut value = catalog.clone();
    value.revision = 0;
    fingerprint(&value)
}
pub fn preview(root: &Path, source: &str, target: &str) -> Result<serde_json::Value> {
    let c = project::database(root)?;
    let catalog = read(&c)?;
    let a = catalog
        .entities
        .iter()
        .find(|e| e.id == source && e.redirect.is_none())
        .ok_or("Identité introuvable.")?;
    let b = catalog
        .entities
        .iter()
        .find(|e| e.id == target && e.redirect.is_none())
        .ok_or("Identité introuvable.")?;
    if source == target {
        return Err("Choisissez deux identités distinctes.".into());
    }
    Ok(
        serde_json::json!({"source":a,"target":b,"token":fingerprint(&catalog)?,"relations":catalog.relations.iter().filter(|r|r.from==source||r.to==source||r.from==target||r.to==target).collect::<Vec<_>>() }),
    )
}
pub fn history(root: &Path) -> Result<serde_json::Value> {
    let c = project::database(root)?;
    let branch = crate::history::active_id(&c)?;
    let mut q = c
        .prepare(
            "SELECT id,source,target,undone FROM entity_merges WHERE branch=? ORDER BY rowid DESC",
        )
        .app()?;
    let rows=q.query_map([branch],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"source":r.get::<_,String>(1)?,"target":r.get::<_,String>(2)?,"undone":r.get::<_,bool>(3)?}))).app()?;
    Ok(serde_json::Value::Array(
        rows.collect::<std::result::Result<Vec<_>, _>>().app()?,
    ))
}
pub fn apply(root: &Path, revision: u64, operation: Operation) -> Result<Catalog> {
    project::with_lock(root, || {
        let mut c = project::database(root)?;
        let tx = c.transaction().app()?;
        let mut catalog = read(&tx)?;
        if catalog.revision != revision {
            if let Operation::Merge {
                source,
                target,
                token,
            } = &operation
            {
                let mut q=tx.prepare("SELECT before_payload,after_hash FROM entity_merges WHERE source=? AND target=? AND branch=? AND undone=0").app()?;
                let records = q
                    .query_map(
                        params![source, target, crate::history::active_id(&tx)?],
                        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
                    )
                    .app()?
                    .collect::<std::result::Result<Vec<_>, _>>()
                    .app()?;
                let now = content_fingerprint(&catalog)?;
                if records
                    .iter()
                    .any(|(before, after)| project::hash(before) == *token && after == &now)
                {
                    return Ok(catalog);
                }
            }
            if let Operation::UndoMerge { id } = &operation {
                let undone: bool = tx
                    .query_row(
                        "SELECT undone FROM entity_merges WHERE id=? AND branch=?",
                        params![id, crate::history::active_id(&tx)?],
                        |r| r.get(0),
                    )
                    .optional()
                    .app()?
                    .unwrap_or(false);
                if undone {
                    return Ok(catalog);
                }
            }
            return Err("Le catalogue a changé. Actualisez avant de réessayer.".into());
        }
        match operation {
            Operation::Save { mut entity } => {
                entity.title = entity.title.trim().to_owned();
                if let Some(old) = catalog.entities.iter().find(|e| e.id == entity.id) {
                    if old.redirect != entity.redirect {
                        return Err("Utilisez la fusion pour modifier une redirection.".into());
                    }
                } else if entity.redirect.is_some() {
                    return Err("Redirection invalide.".into());
                }
                catalog.entities.retain(|e| e.id != entity.id);
                catalog.entities.push(entity);
            }
            Operation::Relation { relation } => {
                catalog.relations.retain(|r| r.id != relation.id);
                catalog.relations.push(relation);
            }
            Operation::RemoveRelation { id } => catalog.relations.retain(|r| r.id != id),
            Operation::Merge {
                source,
                target,
                token,
            } => {
                if token != fingerprint(&catalog)? || source == target {
                    return Err("La prévisualisation a changé.".into());
                }
                let before = serde_json::to_string(&catalog).app()?;
                let a = catalog
                    .entities
                    .iter()
                    .find(|e| e.id == source && e.redirect.is_none())
                    .cloned()
                    .ok_or("Identité introuvable.")?;
                let b = catalog
                    .entities
                    .iter_mut()
                    .find(|e| e.id == target && e.redirect.is_none())
                    .ok_or("Identité introuvable.")?;
                for alias in std::iter::once(a.title).chain(a.aliases) {
                    if alias != b.title && !b.aliases.contains(&alias) {
                        b.aliases.push(alias);
                    }
                }
                for id in a.source_ids {
                    if !b.source_ids.contains(&id) {
                        b.source_ids.push(id);
                    }
                }
                for id in a.detected_ids {
                    if !b.detected_ids.contains(&id) {
                        b.detected_ids.push(id);
                    }
                }
                catalog
                    .entities
                    .iter_mut()
                    .find(|e| e.id == source)
                    .expect("source exists")
                    .redirect = Some(target.clone());
                for r in &mut catalog.relations {
                    if r.from == source {
                        r.from = target.clone();
                    }
                    if r.to == source {
                        r.to = target.clone();
                    }
                }
                // Distinct provenance/status remain distinct; exact duplicates retain their original IDs in the recovery journal.
                let mut seen = std::collections::HashSet::new();
                catalog.relations.retain(|r| {
                    seen.insert(
                        serde_json::to_string(&(
                            r.from.clone(),
                            r.to.clone(),
                            r.name.clone(),
                            r.status.clone(),
                            r.provenance.clone(),
                        ))
                        .unwrap_or_default(),
                    )
                });
                catalog.revision += 1;
                tx.execute("INSERT INTO entity_merges(id,branch,source,target,before_payload,after_hash,undone) VALUES(?,?,?,?,?,?,0)",params![uuid::Uuid::new_v4().to_string(),crate::history::active_id(&tx)?,source,target,before,content_fingerprint(&catalog)?]).app()?;
                catalog.revision -= 1;
            }
            Operation::UndoMerge { id } => {
                let (before,after,undone,branch):(String,String,bool,String)=tx.query_row("SELECT before_payload,after_hash,undone,branch FROM entity_merges WHERE id=?",[&id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).app()?;
                if undone {
                    return Ok(catalog);
                }
                if branch != crate::history::active_id(&tx)?
                    || after != content_fingerprint(&catalog)?
                {
                    return Err("Des modifications suivent cette fusion. Elles ont été conservées ; la restauration automatique est refusée.".into());
                }
                catalog = serde_json::from_str(&before).app()?;
                catalog.revision = revision;
                tx.execute("UPDATE entity_merges SET undone=1 WHERE id=?", [id])
                    .app()?;
            }
        }
        write(&tx, &catalog)?;
        tx.commit().app()?;
        read(&c)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn identity(id: &str, title: &str) -> Identity {
        Identity {
            id: id.into(),
            title: title.into(),
            kind: "Personne".into(),
            confirmed: true,
            ..Default::default()
        }
    }
    fn save(root: &Path, id: &str, title: &str) -> Catalog {
        let rev = read(&project::database(root).unwrap()).unwrap().revision;
        apply(
            root,
            rev,
            Operation::Save {
                entity: identity(id, title),
            },
        )
        .unwrap()
    }
    #[test]
    fn homonyms_merge_undo_after_reopen_and_stale_changes_are_safe() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Test").unwrap();
        save(d.path(), "a", "Claude");
        let c = save(d.path(), "b", "Claude");
        assert_eq!(c.entities.len(), 2);
        let preview = preview(d.path(), "a", "b").unwrap();
        let merged = apply(
            d.path(),
            c.revision,
            Operation::Merge {
                source: "a".into(),
                target: "b".into(),
                token: preview["token"].as_str().unwrap().into(),
            },
        )
        .unwrap();
        assert_eq!(
            merged
                .entities
                .iter()
                .find(|e| e.id == "a")
                .unwrap()
                .redirect
                .as_deref(),
            Some("b")
        );
        let records = history(d.path()).unwrap();
        let id = records[0]["id"].as_str().unwrap();
        let reopened = read(&project::database(d.path()).unwrap()).unwrap();
        let undone = apply(
            d.path(),
            reopened.revision,
            Operation::UndoMerge { id: id.into() },
        )
        .unwrap();
        assert!(undone.entities.iter().all(|e| e.redirect.is_none()));
        assert!(apply(
            d.path(),
            c.revision,
            Operation::Save {
                entity: identity("c", "Récent")
            }
        )
        .is_err());
    }
    #[test]
    fn undo_refuses_to_overwrite_a_later_edit_and_relations_keep_provenance() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Test").unwrap();
        save(d.path(), "a", "A");
        save(d.path(), "b", "B");
        let c = save(d.path(), "c", "C");
        let r = Relation {
            id: "r".into(),
            from: "a".into(),
            to: "c".into(),
            name: "connaît".into(),
            status: "proposed".into(),
            provenance: Some(Provenance {
                source: Some("external".into()),
                section: None,
                node: None,
                quote: "Document".into(),
            }),
        };
        let c = apply(d.path(), c.revision, Operation::Relation { relation: r }).unwrap();
        let token = preview(d.path(), "a", "b").unwrap()["token"]
            .as_str()
            .unwrap()
            .to_owned();
        let merged = apply(
            d.path(),
            c.revision,
            Operation::Merge {
                source: "a".into(),
                target: "b".into(),
                token,
            },
        )
        .unwrap();
        assert_eq!(merged.relations[0].from, "b");
        assert_eq!(merged.relations[0].status, "proposed");
        assert!(merged.relations[0].provenance.is_some());
        let id = history(d.path()).unwrap()[0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let recent = save(d.path(), "c", "Nouvelle édition");
        assert!(
            apply(d.path(), recent.revision, Operation::UndoMerge { id })
                .unwrap_err()
                .contains("conservées")
        );
        assert_eq!(read(&project::database(d.path()).unwrap()).unwrap(), recent);
    }
    #[test]
    fn identities_restore_with_variants_and_saved_views_stay_project_preferences() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Test").unwrap();
        save(d.path(), "a", "Origine");
        let version = crate::history::capture(d.path(), "Origine", None).unwrap();
        crate::history::create_branch(d.path(), "Variante", None).unwrap();
        let id = crate::history::history_state(d.path())
            .unwrap()
            .active_branch;
        save(d.path(), "a", "Variante");
        crate::history::switch_branch(d.path(), "main").unwrap();
        assert_eq!(
            read(&project::database(d.path()).unwrap())
                .unwrap()
                .entities[0]
                .title,
            "Origine"
        );
        crate::history::switch_branch(d.path(), &id).unwrap();
        assert_eq!(
            read(&project::database(d.path()).unwrap())
                .unwrap()
                .entities[0]
                .title,
            "Variante"
        );
        crate::history::switch_branch(d.path(), "main").unwrap();
        save(d.path(), "a", "Modifié");
        crate::history::restore(d.path(), &version.id).unwrap();
        assert_eq!(
            read(&project::database(d.path()).unwrap())
                .unwrap()
                .entities[0]
                .title,
            "Origine"
        );
    }
    #[test]
    fn merge_retries_are_idempotent_and_several_merges_undo_in_reverse_order() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Test").unwrap();
        save(d.path(), "a", "A");
        save(d.path(), "b", "B");
        let initial = save(d.path(), "c", "C");
        let token = preview(d.path(), "a", "b").unwrap()["token"]
            .as_str()
            .unwrap()
            .to_owned();
        let first = apply(
            d.path(),
            initial.revision,
            Operation::Merge {
                source: "a".into(),
                target: "b".into(),
                token: token.clone(),
            },
        )
        .unwrap();
        assert_eq!(
            apply(
                d.path(),
                initial.revision,
                Operation::Merge {
                    source: "a".into(),
                    target: "b".into(),
                    token
                }
            )
            .unwrap(),
            first
        );
        let token = preview(d.path(), "b", "c").unwrap()["token"]
            .as_str()
            .unwrap()
            .to_owned();
        let second = apply(
            d.path(),
            first.revision,
            Operation::Merge {
                source: "b".into(),
                target: "c".into(),
                token,
            },
        )
        .unwrap();
        let h = history(d.path()).unwrap();
        let undo = apply(
            d.path(),
            second.revision,
            Operation::UndoMerge {
                id: h[0]["id"].as_str().unwrap().into(),
            },
        )
        .unwrap();
        let undo = apply(
            d.path(),
            undo.revision,
            Operation::UndoMerge {
                id: h[1]["id"].as_str().unwrap().into(),
            },
        )
        .unwrap();
        assert!(undo.entities.iter().all(|e| e.redirect.is_none()));
    }
    #[test]
    fn migration_backs_up_v3_and_refuses_future_schema() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Test").unwrap();
        let c = project::database(d.path()).unwrap();
        c.execute_batch("PRAGMA user_version=3;").unwrap();
        drop(c);
        let c = project::database(d.path()).unwrap();
        assert_eq!(
            c.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
                .unwrap(),
            4
        );
        assert!(std::fs::read_dir(d.path().join("recuperation"))
            .unwrap()
            .any(|e| e
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("avant-identites")));
        c.execute_batch("PRAGMA user_version=99;").unwrap();
        drop(c);
        assert!(project::database(d.path()).is_err());
    }
    #[test]
    fn cyclic_redirects_and_invalid_relations_roll_back() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Test").unwrap();
        let before = save(d.path(), "a", "A");
        assert!(apply(
            d.path(),
            before.revision,
            Operation::Relation {
                relation: Relation {
                    id: "r".into(),
                    from: "a".into(),
                    to: "missing".into(),
                    name: "lie".into(),
                    status: "confirmed".into(),
                    provenance: None
                }
            }
        )
        .is_err());
        assert_eq!(read(&project::database(d.path()).unwrap()).unwrap(), before);
    }
}
