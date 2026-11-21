use super::section;
use super::{database, hash, load_unlocked};
use crate::{
    error::{AppResult, Result},
    model::*,
};
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::Path;
pub(crate) fn scene_disk(root: &super::io::Dir, id: &str) -> Result<Option<String>> {
    super::validate_id(id)?;
    match root.child("manuscrit", false)? {
        Some(dir) => dir.read(&format!("{id}.md")),
        None => Ok(None),
    }
}

pub(super) fn mirror(root: &super::io::Dir, c: &Connection, s: &Section) -> Result<()> {
    super::validate_id(&s.id)?;
    let dir = root
        .child("manuscrit", true)?
        .ok_or("Dossier manuscrit inaccessible.")?;
    dir.write_atomic(&format!("{}.md", s.id), &s.text)?;
    c.execute(
        "UPDATE sections SET mirror=? WHERE id=?",
        params![hash(&s.text), s.id],
    )
    .app()?;
    c.execute("DELETE FROM mirror_pending WHERE id=?", [&s.id])
        .app()?;
    Ok(())
}

pub(super) fn validate_disk(
    root: &super::io::Dir,
    id: &str,
    old: &str,
    mirror: &str,
    pending: Option<&str>,
) -> Result<String> {
    let disk = scene_disk(root, id)?;
    if let Some(text) = &disk {
        let actual = hash(text);
        let expected = pending.unwrap_or(mirror);
        if (!expected.is_empty()
            && actual != expected
            && (pending.is_none() || actual != hash(old)))
            || (pending.is_some() && expected.is_empty() && actual != hash(old))
        {
            return Err(format!("EXTERNAL:{id}"));
        }
    }
    Ok(disk.map(|text| hash(&text)).unwrap_or_default())
}

pub fn resolve_external(
    root: &Path,
    id: &str,
    keep_local: bool,
    pending: Option<String>,
    pending_aids: Option<Vec<crate::model::WritingAid>>,
) -> Result<Project> {
    super::with_lock(root, || {
        super::validate_id(id)?;
        let root_dir = super::io::Dir::open(root)?;
        let mut c = database(root)?;
        let mut s = section(&c, id)?.ok_or("Section introuvable")?;
        let disk = scene_disk(&root_dir, id)?.ok_or("Miroir introuvable.")?;
        if let Some(aids) = &pending_aids {
            super::writing_aids::validate(pending.as_deref().unwrap_or(&s.text), aids)?;
        }
        // Preserve both versions in a verified recovery directory first.
        let dir = root_dir
            .child("recuperation", true)?
            .ok_or("Dossier de récupération inaccessible.")?;
        dir.write_atomic(
            &format!("{}-{}.md", s.id, uuid::Uuid::new_v4()),
            if keep_local {
                &disk
            } else {
                pending.as_deref().unwrap_or(&s.text)
            },
        )?;
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        if keep_local {
            if let Some(text) = pending.or_else(|| pending_aids.as_ref().map(|_| s.text.clone())) {
                if text != s.text {
                    s.outline = None;
                    if pending_aids.is_none() {
                        super::writing_aids::detach(&mut s.writing_aids);
                    }
                }
                if let Some(aids) = pending_aids {
                    s.writing_aids = aids;
                }
                s.text = text;
                tx.execute(
                    "UPDATE sections SET text=?,outline=?,writing_aids=?,revision=revision+1 WHERE id=?",
                    params![
                        s.text,
                        s.outline
                            .as_ref()
                            .map(serde_json::to_string)
                            .transpose()
                            .app()?,
                        serde_json::to_string(&s.writing_aids).app()?,
                        id
                    ],
                )
                .app()?;
            }
            tx.execute("INSERT INTO mirror_pending(id,base) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET base=excluded.base", params![id, hash(&disk)]).app()?;
        } else {
            let original = if pending_aids.is_some() {
                pending.as_deref().unwrap_or(&s.text)
            } else {
                &s.text
            };
            if let Some(aids) = pending_aids {
                s.writing_aids = aids;
            }
            if disk != original {
                super::writing_aids::detach(&mut s.writing_aids);
            }
            let outline = if disk == s.text {
                s.outline
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()
                    .app()?
            } else {
                None
            };
            tx.execute(
                "UPDATE sections SET text=?,outline=?,writing_aids=?,mirror=?,revision=revision+1 WHERE id=?",
                params![disk, outline, serde_json::to_string(&s.writing_aids).app()?, hash(&disk), id],
            )
            .app()?;
            tx.execute("DELETE FROM mirror_pending WHERE id=?", [id])
                .app()?;
        }
        tx.commit().app()?;
        if keep_local {
            mirror(&root_dir, &c, &s)?;
        }
        load_unlocked(root)
    })
}
