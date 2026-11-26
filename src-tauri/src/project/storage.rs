use super::mirrors::{mirror, scene_disk, validate_disk};
use super::{all_sections, database, row_section};
use crate::{
    error::{AppResult, Result},
    model::*,
};
use rusqlite::{params, TransactionBehavior};
use sha2::{Digest, Sha256};
use std::path::Path;
pub fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
pub fn load(root: &Path) -> Result<Project> {
    super::with_lock(root, || load_unlocked(root))
}
pub(crate) fn load_unlocked(root: &Path) -> Result<Project> {
    let root_dir = super::io::Dir::open(root)?;
    if root_dir
        .open_file("ariane.sqlite", libc::O_RDONLY, 0)?
        .is_none()
    {
        return Err("Ce dossier ne contient pas de projet ariane.".into());
    }
    let c = database(root)?;
    // Standalone backup files use a rollback journal. Re-enable the project's
    // normal WAL mode before the restored project is offered to concurrent readers.
    let journal: String = c.pragma_query_value(None, "journal_mode", |row| row.get(0)).app()?;
    if !journal.eq_ignore_ascii_case("wal") {
        c.pragma_update(None, "journal_mode", "WAL").app()?;
    }
    let mut recovered = false;
    let mut conflicts = vec![];
    // Read each section only once, including trash. It is important that all
    // ids are validated before any mirror is touched.
    let all = all_sections(&c)?;
    let mirrors = {
        let mut query = c.prepare("SELECT s.id,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id").app()?;
        let rows = query
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    (r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?),
                ))
            })
            .app()?;
        rows.collect::<std::result::Result<std::collections::HashMap<_, _>, _>>()
            .app()?
    };
    for s in all.iter().filter(|s| !s.trashed && s.kind == "scene") {
        let (stored, pending) = mirrors.get(&s.id).ok_or("Section introuvable.")?;
        let disk = scene_disk(&root_dir, &s.id)?;
        let desired = hash(&s.text);
        let disk_hash = disk.as_ref().map(|text| hash(text));
        let base = pending.as_ref().unwrap_or(stored);
        if let Some(actual) = disk_hash.as_ref() {
            // A pending write can have reached disk before its DB acknowledgement.
            if !base.is_empty() && actual != base && (pending.is_none() || actual != &desired) {
                conflicts.push(s.id.clone());
                continue;
            }
            if pending.is_some() && base.is_empty() && actual != &desired {
                conflicts.push(s.id.clone());
                continue;
            }
        }
        if pending.is_some() || stored != &desired || disk.is_none() {
            mirror(&root_dir, &c, s)?;
            recovered |= pending.is_some() || !stored.is_empty();
        }
    }
    let name = c
        .query_row("SELECT value FROM meta WHERE key='name'", [], |r| r.get(0))
        .app()?;
    let settings: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .unwrap_or("{}".into());
    let (trash, sections): (Vec<_>, Vec<_>) = all.into_iter().partition(|s| s.trashed);
    Ok(Project {
        active_branch: Some(crate::history::active_id(&c)?),
        smart_tags: super::tags::definitions(&c)?,
        path: root.to_string_lossy().into(),
        name,
        sections,
        settings: serde_json::from_str(&settings).unwrap_or_default(),
        recovered,
        trash,
        can_undo_structure: c
            .query_row("SELECT EXISTS(SELECT 1 FROM structure_history)", [], |r| {
                r.get(0)
            })
            .app()?,
        conflicts,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorError {
    pub id: String,
    pub message: String,
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReport {
    pub sections: Vec<Section>,
    pub mirror_errors: Vec<MirrorError>,
}
/// Compatibility wrapper for existing local callers. The app should use
/// `save_report` so that a durable commit and a failed mirror are distinct.
#[cfg(test)]
pub fn save(root: &Path, patches: Vec<TextPatch>) -> Result<Vec<Section>> {
    Ok(save_report(root, patches)?.sections)
}
pub fn save_report(root: &Path, patches: Vec<TextPatch>) -> Result<SaveReport> {
    save_report_with(root, patches, |_| Ok(()))
}
fn save_report_with(
    root: &Path,
    patches: Vec<TextPatch>,
    mut before_mirror: impl FnMut(&Section) -> Result<()>,
) -> Result<SaveReport> {
    super::with_lock(root, || {
        let root_dir = super::io::Dir::open(root)?;
        let mut c = database(root)?;
        let smart_tags = super::tags::definitions(&c)?;
        let mut seen = std::collections::HashSet::new();
        for patch in &patches {
            if let Some(outline) = &patch.outline {
                for node in &outline.nodes { super::tags::validate_ids(&node.tag_ids, &smart_tags)?; }
            }
            super::validate_id(&patch.id)?;
            if !seen.insert(&patch.id) {
                return Err(
                    "Une section ne peut être sauvegardée deux fois dans le même lot.".into(),
                );
            }
            let (rev, old, raw, mir, pending): (i64, String, Option<String>, String, Option<String>) = c.query_row(
                "SELECT s.revision,s.text,s.outline,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id WHERE s.id=?", [&patch.id],
                |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).app()?;
            if rev != patch.revision {
                return Err(
                    "Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into(),
                );
            }
            let old_outline = raw
                .map(|json| serde_json::from_str::<Outline>(&json).app())
                .transpose()?;
            effective_outline(patch, &old, old_outline)?;
            if let Some(aids) = &patch.writing_aids {
                super::writing_aids::validate(&patch.text, aids)?;
            }
            validate_disk(&root_dir, &patch.id, &old, &mir, pending.as_deref())?;
        }
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        for p in &patches {
            let (rev, old, raw, mir, pending): (i64, String, Option<String>, String, Option<String>) = tx.query_row(
                "SELECT s.revision,s.text,s.outline,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id WHERE s.id=?", [&p.id],
                |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).app()?;
            if rev != p.revision {
                return Err(
                    "Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into(),
                );
            }
            let base = validate_disk(&root_dir, &p.id, &old, &mir, pending.as_deref())?;
            let old_outline = raw
                .map(|json| serde_json::from_str::<Outline>(&json).app())
                .transpose()?;
            let next_outline = effective_outline(p, &old, old_outline.clone())?;
            let raw_aids: String = tx.query_row(
                "SELECT writing_aids FROM sections WHERE id=?", [&p.id], |r| r.get(0)
            ).app()?;
            let previous_aids = serde_json::from_str::<Vec<WritingAid>>(&raw_aids).app()?;
            let mut next_aids = p.writing_aids.clone().unwrap_or_else(|| previous_aids.clone());
            if p.writing_aids.is_none() && old != p.text {
                super::writing_aids::detach(&mut next_aids);
            }
            if old != p.text || old_outline != next_outline || previous_aids != next_aids {
                // Keep the pre-edit state before a substantial deletion or replacement.
                if !old.is_empty() && old != p.text {
                    let prefix = old
                        .chars()
                        .zip(p.text.chars())
                        .take_while(|(a, b)| a == b)
                        .count();
                    let suffix = old
                        .chars()
                        .rev()
                        .zip(p.text.chars().rev())
                        .take_while(|(a, b)| a == b)
                        .count();
                    let length = old.chars().count();
                    let shared_tail = suffix
                        .min(length.saturating_sub(prefix))
                        .min(p.text.chars().count().saturating_sub(prefix));
                    let removed = length.saturating_sub(prefix + shared_tail);
                    crate::history::checkpoint_with(
                        &tx,
                        &p.id,
                        removed >= 200 && removed >= length / 3,
                    )?;
                }
                let encoded = next_outline
                    .map(|outline| serde_json::to_string(&outline).app())
                    .transpose()?;
                tx.execute(
                    "UPDATE sections SET text=?,outline=?,writing_aids=?,revision=revision+1 WHERE id=?",
                    params![p.text, encoded, serde_json::to_string(&next_aids).app()?, p.id],
                )
                .app()?;
                if !p.text.is_empty() {
                    crate::history::checkpoint_with(&tx, &p.id, false)?;
                }
            }
            if old == p.text && pending.is_none() && !base.is_empty() && base == mir
                && mir == hash(&old) {
                continue;
            }
            tx.execute("INSERT INTO mirror_pending(id,base) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET base=excluded.base", params![p.id, base]).app()?;
        }
        let mut saved = Vec::with_capacity(patches.len());
        {
            let mut query = tx.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included,tag_ids,writing_aids FROM sections WHERE id=?").app()?;
            for p in &patches {
                saved.push(query.query_row([&p.id], row_section).app()?);
            }
        }
        tx.commit().app()?;
        let mut mirror_errors = Vec::new();
        for section in &saved {
            if !c.query_row(
                "SELECT EXISTS(SELECT 1 FROM mirror_pending WHERE id=?)",
                [&section.id],
                |r| r.get::<_, bool>(0),
            ).app()? {
                continue;
            }
            if let Err(message) =
                before_mirror(section).and_then(|_| mirror(&root_dir, &c, section))
            {
                mirror_errors.push(MirrorError {
                    id: section.id.clone(),
                    message,
                });
            }
        }
        Ok(SaveReport {
            sections: saved,
            mirror_errors,
        })
    })
}

fn effective_outline(
    patch: &TextPatch,
    old_text: &str,
    old: Option<Outline>,
) -> Result<Option<Outline>> {
    let next = if let Some(outline) = &patch.outline {
        Some(outline.clone())
    } else if old_text == patch.text {
        old
    } else {
        None
    };
    if let Some(outline) = &next {
        super::outline::validate(outline, &patch.text)?;
    }
    Ok(next)
}

#[cfg(test)]
pub fn scene_path(root: &Path, id: &str) -> std::path::PathBuf {
    root.join("manuscrit").join(format!("{id}.md"))
}
#[cfg(test)]
mod tests;
