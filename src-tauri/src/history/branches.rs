mod merge;
#[cfg(test)]
mod tests;

pub use merge::{merge_branch, merge_preview, MergeResolution};

use super::{insert, snapshot, unpack, Snapshot};
use crate::{
    error::{AppResult, Result},
    model::{Project, Version},
    project,
};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub id: String,
    pub name: String,
    pub created: String,
    pub is_main: bool,
    pub base_version: Option<String>,
    pub head_version: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryState {
    pub active_branch: String,
    pub branches: Vec<Branch>,
}

pub(crate) fn active(c: &Connection) -> Result<String> {
    c.query_row(
        "SELECT value FROM meta WHERE key='active_branch'",
        [],
        |r| r.get(0),
    )
    .app()
}

/// Versions from the current branch and its recorded ancestors are valid restore targets.
pub(super) fn can_restore(c: &Connection, version: &Version) -> Result<bool> {
    let branch = active(c)?;
    if version.branch_id.as_deref().unwrap_or("main") == branch {
        return Ok(true);
    }
    c.query_row(
        "WITH RECURSIVE lineage(id) AS (
            SELECT head_version FROM history_branches WHERE id=?1 AND head_version IS NOT NULL
            UNION SELECT base_version FROM history_branches WHERE id=?1 AND base_version IS NOT NULL
            UNION SELECT v.parent_id FROM versions v JOIN lineage l ON v.id=l.id WHERE v.parent_id IS NOT NULL
            UNION SELECT v.merge_parent_id FROM versions v JOIN lineage l ON v.id=l.id WHERE v.merge_parent_id IS NOT NULL
        ) SELECT EXISTS(SELECT 1 FROM lineage WHERE id=?2)",
        params![branch, version.id],
        |r| r.get(0),
    ).app()
}

/// The pending Markdown writes were created by this operation, not by a crash.
pub(super) fn load_applied(root: &Path) -> Result<Project> {
    let mut project = project::load(root)?;
    if project.conflicts.is_empty() {
        project.recovered = false;
    }
    Ok(project)
}
fn branch(c: &Connection, id: &str) -> Result<Branch> {
    c.query_row(
        "SELECT id,name,created,is_main,base_version,head_version FROM history_branches WHERE id=?",
        [id],
        |r| {
            Ok(Branch {
                id: r.get(0)?,
                name: r.get(1)?,
                created: r.get(2)?,
                is_main: r.get(3)?,
                base_version: r.get(4)?,
                head_version: r.get(5)?,
            })
        },
    )
    .app()
}
pub fn history_state(root: &Path) -> Result<HistoryState> {
    let c = project::database(root)?;
    let mut q = c
        .prepare("SELECT id FROM history_branches ORDER BY is_main DESC,created,id")
        .app()?;
    let ids = q
        .query_map([], |r| r.get::<_, String>(0))
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    Ok(HistoryState {
        active_branch: active(&c)?,
        branches: ids.iter().map(|id| branch(&c, id)).collect::<Result<_>>()?,
    })
}
fn ensure_clean(root: &Path) -> Result<()> {
    if let Some(id) = project::load(root)?.conflicts.first() {
        return Err(format!("EXTERNAL:{id}"));
    }
    Ok(())
}
fn draft(c: &Connection, id: &str) -> Result<Snapshot> {
    if active(c)? == id {
        return snapshot(c, &None);
    }
    let payload: String = c
        .query_row("SELECT draft FROM history_branches WHERE id=?", [id], |r| {
            r.get(0)
        })
        .app()?;
    unpack(&payload)
}
fn save_draft(c: &Connection) -> Result<()> {
    c.execute(
        "UPDATE history_branches SET draft=? WHERE id=?",
        params![
            serde_json::to_string(&snapshot(c, &None)?).app()?,
            active(c)?
        ],
    )
    .app()?;
    Ok(())
}
pub(super) fn validate(state: &Snapshot) -> Result<()> {
    let ids: HashSet<_> = state.sections.iter().map(|s| s.id.as_str()).collect();
    if ids.len() != state.sections.len() {
        return Err("Identifiants de sections en double.".into());
    }
    if let Some(catalog) = &state.entity_catalog {
        project::entities::validate(catalog)?;
    }
    for tag in &state.smart_tags {
        project::tags::validate_tag(tag, &state.smart_tags)?;
    }
    for s in &state.sections {
        project::tags::validate_ids(&s.tag_ids, &state.smart_tags)?;
        project::writing_aids::validate(&s.text, &s.writing_aids)?;
        if let Some(o) = &s.outline {
            for n in &o.nodes {
                project::tags::validate_ids(&n.tag_ids, &state.smart_tags)?;
            }
        }
        project::validate_id(&s.id)?;
        if !["scene", "chapter", "folder"].contains(&s.kind.as_str()) {
            return Err("Type de section invalide.".into());
        }
        if let Some(o) = &s.outline {
            project::validate_outline(o, &s.text)?;
        }
        let mut seen = HashSet::new();
        let mut parent = s.parent.as_deref();
        seen.insert(s.id.as_str());
        while let Some(id) = parent {
            if !seen.insert(id) || !ids.contains(id) {
                return Err("Cette intégration crée une arborescence incompatible. Revoyez les déplacements et suppressions.".into());
            }
            parent = state
                .sections
                .iter()
                .find(|p| p.id == id)
                .and_then(|p| p.parent.as_deref());
        }
    }
    Ok(())
}
// All DB changes, outgoing draft and pending mirror bases share one transaction.
// load() finishes/retries the Markdown mirrors after commit, using their actual old contents.
pub(super) fn replace(c: &Connection, root: &Path, state: &Snapshot) -> Result<()> {
    validate(state)?;
    if let Some(catalog) = &state.entity_catalog {
        project::entities::write(c, catalog)?;
    }
    let old = project::all_sections(c)?;
    let previous_epoch:i64=c.query_row("SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM meta WHERE key='workspace_revision'),0)",[],|r|r.get(0)).app()?;
    let revision_floor = old
        .iter()
        .chain(&state.sections)
        .map(|s| s.revision)
        .max()
        .unwrap_or(0)
        .max(previous_epoch)
        + 1;
    c.execute(
        "INSERT OR REPLACE INTO meta VALUES('workspace_revision',?)",
        [revision_floor.to_string()],
    )
    .app()?;
    let dir = project::io::Dir::open(root)?;
    let mut bases = BTreeMap::new();
    for s in &state.sections {
        bases.insert(
            s.id.clone(),
            project::scene_disk(&dir, &s.id)?
                .map(|text| project::hash(&text))
                .unwrap_or_default(),
        );
    }
    c.execute_batch("DELETE FROM mirror_pending; DELETE FROM sections; DELETE FROM links; DELETE FROM citations; DELETE FROM structure_history;
CREATE TABLE IF NOT EXISTS margin_pins(section TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(section,source)); DELETE FROM margin_pins;").app()?;
    for s in &state.sections {
        let revision = revision_floor;
        c.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,synopsis,status,goal,mirror,outline,role,trashed,included,tag_ids,writing_aids) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",params![s.id,s.parent,s.title,s.kind,s.position,s.text,revision,s.synopsis,s.status,s.goal,bases[&s.id],s.outline.as_ref().map(serde_json::to_string).transpose().app()?,s.role,s.trashed,s.included,serde_json::to_string(&s.tag_ids).app()?,serde_json::to_string(&s.writing_aids).app()?]).app()?;
        if s.kind == "scene" && !s.trashed {
            c.execute(
                "INSERT INTO mirror_pending(id,base) VALUES(?,?)",
                params![s.id, bases[&s.id]],
            )
            .app()?;
        }
    }
    c.execute(
        "INSERT OR REPLACE INTO meta VALUES('settings',?)",
        [state.settings.to_string()],
    )
    .app()?;
    c.execute(
        "INSERT OR REPLACE INTO meta VALUES('smart_tags',?)",
        [serde_json::to_string(&state.smart_tags).app()?],
    )
    .app()?;
    if let Some(annotations) = &state.annotations {
        c.execute_batch("CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY,payload TEXT NOT NULL); DELETE FROM annotations;").app()?;
        for (id, payload) in annotations {
            c.execute("INSERT INTO annotations VALUES(?,?)", params![id, payload])
                .app()?;
        }
    }
    for (id, payload) in &state.citations {
        c.execute("INSERT INTO citations VALUES(?,?)", params![id, payload])
            .app()?;
    }
    for (section, source, payload) in &state.links {
        if state.sections.iter().any(|s| s.id == *section) {
            c.execute(
                "INSERT INTO links VALUES(?,?,?)",
                params![section, source, payload],
            )
            .app()?;
        }
    }
    for (section, source) in &state.pins {
        if state.sections.iter().any(|s| s.id == *section) {
            c.execute(
                "INSERT INTO margin_pins VALUES(?,?)",
                params![section, source],
            )
            .app()?;
        }
    }
    Ok(())
}
pub fn create_branch(root: &Path, name: &str, from: Option<String>) -> Result<Project> {
    project::with_lock(root, || {
        ensure_clean(root)?;
        if name.trim().is_empty() {
            return Err("Nommez cette variante.".into());
        }
        let mut c = project::database(root)?;
        let exists: bool = c
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM history_branches WHERE lower(name)=lower(?))",
                [name.trim()],
                |r| r.get(0),
            )
            .app()?;
        if exists {
            return Err("Une variante porte déjà ce nom.".into());
        }
        let tx = c.transaction().app()?;
        let state = if let Some(id) = &from {
            let scope: Option<String> = tx
                .query_row("SELECT scope FROM versions WHERE id=?", [id], |r| r.get(0))
                .app()?;
            if scope.is_some() {
                return Err(
                    "Choisissez une version de tout le projet pour créer une variante.".into(),
                );
            }
            let payload: String = tx
                .query_row("SELECT payload FROM versions WHERE id=?", [id], |r| {
                    r.get(0)
                })
                .app()?;
            unpack(&payload)?
        } else {
            snapshot(&tx, &None)?
        };
        validate(&state)?;
        let origin_branch = if let Some(id) = &from {
            tx.query_row(
                "SELECT COALESCE(branch_id,'main') FROM versions WHERE id=?",
                [id],
                |r| r.get::<_, String>(0),
            )
            .app()?
        } else {
            active(&tx)?
        };
        let merge_base = if origin_branch == "main" {
            serde_json::to_string(&state).app()?
        } else {
            tx.query_row(
                "SELECT base_payload FROM history_branches WHERE id=?",
                [origin_branch],
                |r| r.get::<_, String>(0),
            )
            .app()?
        };
        save_draft(&tx)?;
        // This named origin is an explicit consequence of creating a variant, and cannot be pruned.
        let base = insert(&tx, "Origine de la variante", None, state.clone())?;
        let id = uuid::Uuid::new_v4().to_string();
        let payload = serde_json::to_string(&state).app()?;
        tx.execute(
            "INSERT INTO history_branches VALUES(?,?,?,0,?,?,?,?)",
            params![
                id,
                name.trim(),
                chrono::Utc::now().to_rfc3339(),
                base.id,
                base.id,
                payload,
                merge_base
            ],
        )
        .app()?;
        replace(&tx, root, &state)?;
        tx.execute("UPDATE meta SET value=? WHERE key='active_branch'", [id])
            .app()?;
        tx.commit().app()?;
        load_applied(root)
    })
}
pub fn switch_branch(root: &Path, id: &str) -> Result<Project> {
    project::with_lock(root, || {
        ensure_clean(root)?;
        let mut c = project::database(root)?;
        branch(&c, id)?;
        if active(&c)? == id {
            return project::load(root);
        }
        let state = draft(&c, id)?;
        let tx = c.transaction().app()?;
        save_draft(&tx)?;
        replace(&tx, root, &state)?;
        tx.execute("UPDATE meta SET value=? WHERE key='active_branch'", [id])
            .app()?;
        tx.commit().app()?;
        load_applied(root)
    })
}
pub fn promote_version(root: &Path, id: &str, name: &str) -> Result<Version> {
    project::with_lock(root, || {
        if name.trim().is_empty() {
            return Err("Nommez cette version.".into());
        }
        let mut c = project::database(root)?;
        let tx = c.transaction().app()?;
        if tx
            .execute(
                "UPDATE versions SET name=? WHERE id=? AND COALESCE(branch_id,'main')=?",
                params![name.trim(), id, active(&tx)?],
            )
            .app()?
            != 1
        {
            return Err("Version introuvable.".into());
        }
        tx.execute("DELETE FROM automatic_versions WHERE id=?", [id])
            .app()?;
        tx.commit().app()?;
        super::get(root, id)
    })
}
