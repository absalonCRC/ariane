use super::entities;
use super::GEMMA_MODEL;
use super::{storage, Passage, WHITESPACE};
use crate::{
    error::{AppResult, Result},
    model::Section,
    project,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};
pub(super) fn utf16_byte(text: &str, offset: usize) -> Result<usize> {
    if offset == 0 {
        return Ok(0);
    }
    let mut units = 0;
    for (byte, ch) in text.char_indices() {
        units += ch.len_utf16();
        if units == offset {
            return Ok(byte + ch.len_utf8());
        }
        if units > offset {
            return Err("Position UTF-16 invalide.".into());
        }
    }
    if units == offset {
        Ok(text.len())
    } else {
        Err("Position UTF-16 hors du texte.".into())
    }
}

pub(super) fn section_passages(s: &Section) -> Result<Vec<Passage>> {
    if s.kind != "scene" {
        return Ok(vec![]);
    }
    let nodes: Vec<(Option<String>, usize, usize)> = if let Some(outline) = &s.outline {
        crate::project::validate_outline(outline, &s.text)?;
        let mut bytes = Vec::with_capacity(outline.nodes.len() + 1);
        let mut offset = 0;
        let mut next = 0;
        for (byte, ch) in s.text.char_indices() {
            if outline.nodes.get(next).is_some_and(|n| n.start == offset) {
                bytes.push(byte);
                next += 1;
            }
            offset += ch.len_utf16();
        }
        if outline.nodes.get(next).is_some_and(|n| n.start == offset) {
            bytes.push(s.text.len());
        }
        bytes.push(s.text.len());
        let out = outline
            .nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (Some(n.id.clone()), bytes[i], bytes[i + 1]))
            .collect();
        out
    } else {
        vec![(None, 0, s.text.len())]
    };
    // Fence state spans outline nodes. Exclude intersecting nodes conservatively
    // so names in examples/code never become manuscript facts.
    let mut code = Vec::new();
    let mut fence: Option<(char, usize, usize)> = None;
    let mut offset = 0;
    for line in s.text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let marker = trimmed.chars().next().unwrap_or(' ');
        let count = trimmed.chars().take_while(|c| *c == marker).count();
        if (marker == '`' || marker == '~') && count >= 3 {
            match fence {
                None => fence = Some((marker, count, offset)),
                Some((open, length, start)) if open == marker && count >= length => {
                    code.push((start, offset + line.len()));
                    fence = None;
                }
                _ => {}
            }
        }
        offset += line.len();
    }
    if let Some((_, _, start)) = fence {
        code.push((start, s.text.len()));
    }
    Ok(nodes
        .into_iter()
        .enumerate()
        .filter(|(_, (_, start, end))| !code.iter().any(|(a, b)| start < b && end > a))
        .map(|(position, (node, start, end))| {
            let text = s.text[start..end].to_owned();
            let key = match &node {
                Some(n) => format!("{}\u{1f}{}", s.id, n),
                None => format!("{}\u{1f}", s.id),
            };
            let title = s.title.clone();
            Passage {
                key,
                section: s.id.clone(),
                node,
                title,
                text: text.clone(),
                hash: storage::fingerprint(&text),
                position,
            }
        })
        .collect())
}

pub(super) fn row_passage(r: &rusqlite::Row<'_>) -> rusqlite::Result<Passage> {
    Ok(Passage {
        key: r.get(0)?,
        section: r.get(1)?,
        node: r.get(2)?,
        title: r.get(3)?,
        text: r.get(4)?,
        hash: r.get(5)?,
        position: r.get::<_, i64>(6)? as usize,
    })
}

pub fn sync(root: &Path) -> Result<()> {
    sync_idle(root, None, || false)
}

pub fn sync_idle(
    root: &Path,
    preferred: Option<&str>,
    interrupted: impl Fn() -> bool,
) -> Result<()> {
    let mut c = storage::database(root)?;
    prune_missing(&mut c)?;
    let mut scenes = scene_revisions(&c, false)?;
    scenes.sort_by_key(|(id, _)| if Some(id.as_str()) == preferred { 0 } else { 1 });
    let mut updated = 0;
    for (id, revision) in scenes {
        if interrupted() || updated == 16 {
            break;
        }
        if sync_section(&mut c, &id, revision)? == Some(true) {
            updated += 1;
        }
    }
    Ok(())
}

pub(super) fn scene_revisions(c: &Connection, document_order: bool) -> Result<Vec<(String, i64)>> {
    let mut query = c.prepare(if document_order {
        "SELECT id,revision FROM sections WHERE kind='scene' AND trashed=0 ORDER BY position,id"
    } else {
        "SELECT id,revision FROM sections WHERE kind='scene' AND trashed=0"
    }).app()?;
    let rows = query.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).app()?;
    rows.collect::<rusqlite::Result<_>>().app()
}

pub(super) fn prune_missing(c: &mut Connection) -> Result<()> {
    let missing: Vec<String> = {
        let mut query = c.prepare(
            "SELECT m.id FROM memory_sections m WHERE NOT EXISTS (
                SELECT 1 FROM sections s WHERE s.id=m.id AND s.kind='scene' AND s.trashed=0
            )",
        ).app()?;
        let rows = query.query_map([], |row| row.get(0)).app()?;
        rows.collect::<rusqlite::Result<_>>().app()?
    };
    for id in missing {
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        if tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sections WHERE id=? AND kind='scene' AND trashed=0)",
            [&id],
            |row| row.get::<_, bool>(0),
        ).app()? {
            continue;
        }
        let keys: Vec<String> = {
            let mut q = tx
                .prepare("SELECT key FROM memory_passages WHERE section=?")
                .app()?;
            let rows = q.query_map([&id], |r| r.get(0)).app()?;
            rows.collect::<std::result::Result<_, _>>().app()?
        };
        for key in keys {
            storage::delete_passage(&tx, &key)?;
        }
        tx.execute("DELETE FROM memory_sections WHERE id=?", [id])
            .app()?;
        tx.commit().app()?;
    }
    Ok(())
}

struct SceneStamp {
    revision: i64,
    mirror: String,
    outline_hash: String,
    title: String,
    synchronized: bool,
}

fn scene_stamp(c: &Connection, id: &str) -> Result<Option<SceneStamp>> {
    c.prepare_cached(
        "SELECT s.revision,s.mirror,COALESCE(s.outline,''),s.title,
                m.revision,m.mirror,m.outline_hash,m.title
         FROM sections s LEFT JOIN memory_sections m ON m.id=s.id
         WHERE s.id=? AND s.kind='scene' AND s.trashed=0",
    ).app()?.query_row([id], |row| {
        let revision = row.get(0)?;
        let mirror: String = row.get(1)?;
        let outline_hash = storage::fingerprint(&row.get::<_, String>(2)?);
        let title: String = row.get(3)?;
        let synchronized = row.get::<_, Option<i64>>(4)? == Some(revision)
            && row.get::<_, String>(5)? == mirror
            && row.get::<_, String>(6)? == outline_hash
            && row.get::<_, String>(7)? == title;
        Ok(SceneStamp { revision, mirror, outline_hash, title, synchronized })
    }).optional().app()
}

/// Stale or missing scenes return None. Unchanged scenes never take a write lock.
pub(super) fn sync_section(c: &mut Connection, id: &str, revision: i64) -> Result<Option<bool>> {
    let Some(stamp) = scene_stamp(c, id)?.filter(|stamp| stamp.revision == revision) else {
        return Ok(None);
    };
    if stamp.synchronized {
        return Ok(Some(false));
    }
    // The scene may have been saved or synchronized while waiting for the lock.
    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).app()?;
    let Some(stamp) = scene_stamp(&tx, id)?.filter(|stamp| stamp.revision == revision) else {
        return Ok(None);
    };
    if stamp.synchronized {
        return Ok(Some(false));
    }
    let Some(section) = project::section(&tx, id)? else {
        return Ok(None);
    };
    write_passages(&tx, &section, &stamp)?;
    tx.commit().app()?;
    Ok(Some(true))
}

fn write_passages(tx: &Transaction<'_>, section: &Section, stamp: &SceneStamp) -> Result<()> {
    let revision = stamp.revision;
    let desired = section_passages(section)?;
    let existing: HashMap<String, (String, String, i64, i64)> = {
        let mut query = tx.prepare_cached(
            "SELECT key,hash,title,position,revision FROM memory_passages WHERE section=?",
        ).app()?;
        let rows = query.query_map([&section.id], |row| {
            Ok((row.get(0)?, (row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))
        }).app()?;
        rows.collect::<rusqlite::Result<_>>().app()?
    };
    let wanted: HashSet<&str> = desired.iter().map(|passage| passage.key.as_str()).collect();
    for key in existing.keys().filter(|key| !wanted.contains(key.as_str())) {
        storage::delete_passage(tx, key)?;
    }
    for passage in desired {
        let previous = existing.get(&passage.key);
        match previous {
            Some((hash, old_title, position, old_revision)) if *hash == passage.hash => {
                if *old_title != passage.title {
                    tx.execute("UPDATE memory_passages SET analyzed=0,vector=NULL,query_vector=NULL,model=NULL WHERE key=?", [&passage.key]).app()?;
                }
                if *old_title != passage.title || *position != passage.position as i64
                    || *old_revision != revision
                {
                    tx.execute(
                        "UPDATE memory_passages SET title=?,position=?,revision=? WHERE key=?",
                        params![passage.title, passage.position as i64, revision, passage.key],
                    ).app()?;
                }
            }
            _ => {
                storage::upsert_passage(tx, &passage, revision, previous.is_some())?;
                entities::rules(tx, &passage)?;
            }
        }
    }
    tx.execute(
        "INSERT INTO memory_sections(id,revision,mirror,outline_hash,title) VALUES(?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,mirror=excluded.mirror,
            outline_hash=excluded.outline_hash,title=excluded.title",
        params![section.id, revision, stamp.mirror, stamp.outline_hash, stamp.title],
    ).app()?;
    Ok(())
}

pub fn pending(root: &Path, preferred: Option<&str>, limit: usize) -> Result<Vec<Passage>> {
    pending_at(root, preferred, None, limit)
}

pub fn pending_at(
    root: &Path,
    preferred: Option<&str>,
    node: Option<&str>,
    limit: usize,
) -> Result<Vec<Passage>> {
    let c = storage::database(root)?;
    let model = GEMMA_MODEL;
    let mut q=c.prepare("SELECT key,section,node,title,text,hash,position FROM memory_passages WHERE (analyzed=0 OR model IS NULL OR model<>? OR (section=? AND node IS ? AND query_vector IS NULL)) AND length(trim(text,?))>0 AND length(text)<=65536 ORDER BY CASE WHEN section=? AND node IS ? THEN 0 WHEN section=? THEN 1 ELSE 2 END,section,position LIMIT ?").app()?;
    let rows = q
        .query_map(
            params![
                model,
                preferred.unwrap_or(""),
                node,
                WHITESPACE,
                preferred.unwrap_or(""),
                node,
                preferred.unwrap_or(""),
                limit.min(64) as i64
            ],
            row_passage,
        )
        .app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}
