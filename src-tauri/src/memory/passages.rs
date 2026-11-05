use super::entities;
use super::GEMMA_MODEL;
use super::{storage, Passage, WHITESPACE};
use crate::{
    error::{AppResult, Result},
    model::Section,
    project,
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
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
    sync_preferred(root, None)
}

pub fn sync_preferred(root: &Path, preferred: Option<&str>) -> Result<()> {
    sync_idle(root, preferred, || false)
}

pub fn sync_idle(
    root: &Path,
    preferred: Option<&str>,
    interrupted: impl Fn() -> bool,
) -> Result<()> {
    let mut c = storage::database(root)?;
    let metadata: Vec<(String, i64, String, String, String)> = {
        let mut q=c.prepare("SELECT id,revision,mirror,COALESCE(outline,''),title FROM sections WHERE kind='scene' AND trashed=0").app()?;
        let rows = q
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .app()?;
        rows.collect::<std::result::Result<_, _>>().app()?
    };
    let seen: HashSet<&str> = metadata
        .iter()
        .map(|(id, _, _, _, _)| id.as_str())
        .collect();
    let old_sections: Vec<String> = {
        let mut q = c.prepare("SELECT id FROM memory_sections").app()?;
        let rows = q.query_map([], |r| r.get(0)).app()?;
        rows.collect::<std::result::Result<_, _>>().app()?
    };
    for id in old_sections
        .into_iter()
        .filter(|id| !seen.contains(id.as_str()))
    {
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
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
    let mut processed = 0;
    let mut metadata = metadata;
    metadata.sort_by_key(|(id, _, _, _, _)| if Some(id.as_str()) == preferred { 0 } else { 1 });
    for (id, revision, mirror, outline, title) in metadata {
        if interrupted() {
            break;
        }
        let outline_hash = storage::fingerprint(&outline);
        let old: Option<(i64, String, String, String)> = c
            .query_row(
                "SELECT revision,mirror,outline_hash,title FROM memory_sections WHERE id=?",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .app()?;
        if old
            == Some((
                revision,
                mirror.clone(),
                outline_hash.clone(),
                title.clone(),
            ))
        {
            continue;
        }
        // Bounded transactions yield to saves between scenes, including initial indexing.
        if processed >= 16 {
            break;
        }
        processed += 1;
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        let Some(s) = project::section(&tx, &id)? else {
            continue;
        };
        if s.revision != revision {
            continue;
        }
        let desired = section_passages(&s)?;
        let existing: HashMap<String, (String, String, usize, i64)> = {
            let mut q = tx
                .prepare(
                    "SELECT key,hash,title,position,revision FROM memory_passages WHERE section=?",
                )
                .app()?;
            let rows = q
                .query_map([&id], |r| {
                    Ok((
                        r.get(0)?,
                        (
                            r.get(1)?,
                            r.get(2)?,
                            r.get::<_, i64>(3)? as usize,
                            r.get(4)?,
                        ),
                    ))
                })
                .app()?;
            rows.collect::<std::result::Result<_, _>>().app()?
        };
        let wanted: HashSet<&str> = desired.iter().map(|p| p.key.as_str()).collect();
        for key in existing.keys().filter(|key| !wanted.contains(key.as_str())) {
            storage::delete_passage(&tx, key)?;
        }
        for p in desired {
            match existing.get(&p.key) {
                Some((hash, old_title, position, old_revision)) if hash == &p.hash => {
                    if old_title != &p.title {
                        tx.execute("UPDATE memory_passages SET analyzed=0,vector=NULL,query_vector=NULL,model=NULL WHERE key=?",[&p.key]).app()?;
                    }
                    if old_title != &p.title || *position != p.position || *old_revision != revision
                    {
                        tx.execute(
                            "UPDATE memory_passages SET title=?,position=?,revision=? WHERE key=?",
                            params![p.title, p.position as i64, revision, p.key],
                        )
                        .app()?;
                    }
                }
                _ => {
                    storage::upsert_passage(&tx, &p, revision)?;
                    entities::rules(&tx, &p)?;
                }
            }
        }
        tx.execute("INSERT INTO memory_sections(id,revision,mirror,outline_hash,title) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,mirror=excluded.mirror,outline_hash=excluded.outline_hash,title=excluded.title",params![id,revision,mirror,outline_hash,title]).app()?;
        tx.commit().app()?;
    }
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
