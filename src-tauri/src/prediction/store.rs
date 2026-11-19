use super::words::{self, Counts};
use crate::error::{AppResult, Result};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::Path,
    time::Duration,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub enabled: bool,
    pub distinct: bool,
}

#[derive(Serialize)]
pub struct Suggestion {
    pub word: String,
    pub feedback: String,
    pub epoch: i64,
}

pub(super) fn open(data: &Path) -> Result<Connection> {
    let file = data.canonicalize().app()?.join("prediction.sqlite");
    let c = Connection::open_with_flags(
        file,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()?;
    c.busy_timeout(Duration::from_millis(350)).app()?;
    let version: i64 = c
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .app()?;
    if version == 0 {
        c.execute_batch(
            "PRAGMA journal_mode=WAL;
             BEGIN IMMEDIATE;
             CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL, distinct_hint INTEGER NOT NULL, epoch INTEGER NOT NULL);
             INSERT OR IGNORE INTO preferences VALUES (1,0,0,0);
             CREATE TABLE IF NOT EXISTS forgotten (project TEXT PRIMARY KEY);
             CREATE TABLE IF NOT EXISTS documents (project TEXT NOT NULL, scene TEXT NOT NULL, language TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(project,scene));
             CREATE TABLE IF NOT EXISTS lexemes (project TEXT NOT NULL, scene TEXT NOT NULL, language TEXT NOT NULL, prefix TEXT NOT NULL, word TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(project,scene,prefix,word));
             CREATE INDEX IF NOT EXISTS lexemes_lookup ON lexemes(language,prefix,project,word);
             CREATE TABLE IF NOT EXISTS feedback (project TEXT NOT NULL, token TEXT NOT NULL, weight INTEGER NOT NULL, PRIMARY KEY(project,token));
             PRAGMA user_version=1;
             COMMIT;"
        ).app()?;
    } else if version != 1 {
        return Err("Profil de prédiction incompatible.".into());
    }
    Ok(c)
}

pub(super) fn preferences(c: &Connection) -> Result<(Preferences, i64)> {
    c.query_row(
        "SELECT enabled,distinct_hint,epoch FROM preferences WHERE id=1",
        [],
        |r| {
            Ok((
                Preferences {
                    enabled: r.get(0)?,
                    distinct: r.get(1)?,
                },
                r.get(2)?,
            ))
        },
    )
    .app()
}

pub(super) fn blocked(c: &Connection, project: &str) -> Result<bool> {
    c.query_row(
        "SELECT EXISTS(SELECT 1 FROM forgotten WHERE project=?1)",
        [project],
        |r| r.get(0),
    )
    .app()
}

pub(super) fn reset(c: &mut Connection) -> Result<()> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .app()?;
    // Keep fingerprints to avoid relearning unchanged documents after a restart.
    tx.execute_batch(
        "DELETE FROM lexemes; DELETE FROM feedback; UPDATE preferences SET epoch=epoch+1;",
    )
    .app()?;
    tx.commit().app()
}

pub(super) fn forget(c: &mut Connection, project: &str, forget: bool) -> Result<()> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .app()?;
    if forget {
        for table in ["lexemes", "documents", "feedback"] {
            tx.execute(&format!("DELETE FROM {table} WHERE project=?1"), [project])
                .app()?;
        }
        tx.execute("INSERT OR IGNORE INTO forgotten VALUES (?1)", [project])
            .app()?;
    } else {
        tx.execute("DELETE FROM forgotten WHERE project=?1", [project])
            .app()?;
    }
    tx.execute("UPDATE preferences SET epoch=epoch+1", [])
        .app()?;
    tx.commit().app()
}

pub(super) fn feedback(
    c: &mut Connection,
    project: &str,
    token: &str,
    epoch: i64,
    accepted: bool,
) -> Result<()> {
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Retour de prédiction invalide.".into());
    }
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .app()?;
    let (prefs, current) = preferences(&tx)?;
    if prefs.enabled && epoch == current && !blocked(&tx, project)? {
        tx.execute(
            "INSERT INTO feedback VALUES (?1,?2,?3)
             ON CONFLICT(project,token) DO UPDATE SET weight=max(-8,min(4,weight+excluded.weight))",
            params![project, token, if accepted { 1 } else { -4 }],
        )
        .app()?;
    }
    tx.commit().app()
}

pub(super) fn project_identity(root: &Path, db: &Connection) -> Result<String> {
    let id: String = db
        .query_row("SELECT value FROM meta WHERE key='project_id'", [], |row| {
            row.get(0)
        })
        .app()?;
    let restored = crate::project::backup::restored_identity(root)?.unwrap_or_default();
    Ok(crate::project::hash(&format!("{id}\0{restored}")))
}

struct Document {
    scene: String,
    fingerprint: String,
    revision: i64,
    counts: Counts,
}

pub(super) fn train(c: &mut Connection, root: &Path) -> Result<Option<String>> {
    let (prefs, epoch) = preferences(c)?;
    if !prefs.enabled {
        return Ok(None);
    }
    let source = Connection::open_with_flags(
        root.canonicalize().app()?.join("ariane.sqlite"),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()?;
    source.busy_timeout(Duration::from_millis(350)).app()?;
    let snapshot = source.unchecked_transaction().app()?;
    let project = project_identity(root, &snapshot)?;
    if blocked(c, &project)? {
        return Ok(Some(project));
    }
    let settings: String = snapshot
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |row| {
            row.get(0)
        })
        .app()?;
    let settings: serde_json::Value = serde_json::from_str(&settings).app()?;
    let language = words::language(settings["language"].as_str().unwrap_or("fr"));
    let known = {
        let mut query = c
            .prepare("SELECT scene,language,fingerprint FROM documents WHERE project=?1")
            .app()?;
        let rows = query
            .query_map([&project], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (row.get::<_, String>(1)?, row.get::<_, String>(2)?),
                ))
            })
            .app()?;
        rows.collect::<rusqlite::Result<HashMap<_, _>>>().app()?
    };
    let mut changes = Vec::new();
    let mut seen = HashSet::new();
    if let Some(language) = language {
        let mut select = snapshot.prepare(
            "SELECT id,text,revision FROM sections WHERE kind='scene' AND trashed=0 AND included=1"
        ).app()?;
        let mut rows = select.query([]).app()?;
        while let Some(row) = rows.next().app()? {
            let scene: String = row.get(0).app()?;
            let text: &str = row.get_ref(1).app()?.as_str().app()?;
            let fingerprint = crate::project::hash(text);
            if !known
                .get(&scene)
                .is_some_and(|(lang, hash)| lang == language && hash == &fingerprint)
            {
                changes.push(Document {
                    scene: scene.clone(),
                    fingerprint,
                    revision: row.get(2).app()?,
                    counts: words::counts(text),
                });
            }
            seen.insert(scene);
        }
    }
    let removed: Vec<_> = known.keys().filter(|id| !seen.contains(*id)).collect();
    if changes.is_empty() && removed.is_empty() {
        return Ok(Some(project));
    }
    drop(snapshot);
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .app()?;
    let (latest, current) = preferences(&tx)?;
    if !latest.enabled || current != epoch || blocked(&tx, &project)? {
        return Ok(None);
    }
    {
        let mut delete_words = tx
            .prepare("DELETE FROM lexemes WHERE project=?1 AND scene=?2")
            .app()?;
        let mut delete_doc = tx
            .prepare("DELETE FROM documents WHERE project=?1 AND scene=?2")
            .app()?;
        for scene in removed {
            delete_words.execute(params![project, scene]).app()?;
            delete_doc.execute(params![project, scene]).app()?;
        }
        let mut insert_doc = tx.prepare(
            "INSERT INTO documents VALUES (?1,?2,?3,?4,?5)
             ON CONFLICT(project,scene) DO UPDATE SET language=excluded.language,fingerprint=excluded.fingerprint,revision=excluded.revision"
        ).app()?;
        let mut insert_word = tx
            .prepare("INSERT INTO lexemes VALUES (?1,?2,?3,?4,?5,?6)")
            .app()?;
        for document in changes {
            delete_words
                .execute(params![project, document.scene])
                .app()?;
            insert_doc
                .execute(params![
                    project,
                    document.scene,
                    language,
                    document.fingerprint,
                    document.revision
                ])
                .app()?;
            for ((prefix, word), count) in document.counts {
                insert_word
                    .execute(params![
                        project,
                        document.scene,
                        language,
                        prefix,
                        word,
                        count
                    ])
                    .app()?;
            }
        }
    }
    tx.commit().app()?;
    Ok(Some(project))
}

#[derive(Default)]
struct Candidate {
    base: i64,
    common: i64,
    project: i64,
    alias: i64,
}

fn ranked(
    c: &Connection,
    language: &str,
    prefix: &str,
    project: &str,
    names: &Counts,
    personal: bool,
) -> Result<BTreeMap<String, Candidate>> {
    let mut candidates = BTreeMap::<String, Candidate>::new();
    if let Some(base) = words::BASE.get(language) {
        for ((_, word), count) in base.iter().filter(|((key, _), _)| key == prefix) {
            candidates.entry(word.clone()).or_default().base = (*count).into();
        }
    }
    if !personal {
        return Ok(candidates);
    }
    let mut query = c.prepare_cached(
        "SELECT word, sum(count), sum(CASE WHEN project=?3 THEN count ELSE 0 END)
         FROM lexemes WHERE language=?1 AND prefix=?2
         GROUP BY word HAVING count(DISTINCT project)>=2 OR sum(CASE WHEN project=?3 THEN count ELSE 0 END)>0
         ORDER BY sum(CASE WHEN project=?3 THEN count ELSE 0 END) DESC, sum(count) DESC, word LIMIT 96"
    ).app()?;
    let rows = query
        .query_map(params![language, prefix, project], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .app()?;
    for row in rows {
        let (word, total, project_score) = row.app()?;
        let candidate = candidates.entry(word).or_default();
        // A word learned only in another project is never generated here.
        candidate.common = if project_score == 0 { total } else { 0 };
        candidate.project = project_score;
    }
    for ((_, word), _) in names.iter().filter(|((key, _), _)| key == prefix) {
        candidates.entry(word.clone()).or_default().alias = 1;
    }
    Ok(candidates)
}

pub(super) fn suggest(
    c: &Connection,
    language: &str,
    text: &str,
    project: &str,
    names: &Counts,
    personal: bool,
) -> Result<Option<Suggestion>> {
    let (_, epoch) = preferences(c)?;
    let mut feedback = c
        .prepare_cached("SELECT weight FROM feedback WHERE project=?1 AND token=?2")
        .app()?;
    let prefixes = words::prefix(text);
    for prefix in prefixes {
        let exact = prefix.contains(' ');
        let mut best = None::<(i64, Suggestion)>;
        for (word, candidate) in ranked(c, language, &prefix, project, names, personal)? {
            if !words::complete_word(&word)
                || (!exact
                    && candidate.base == 0
                    && candidate.project < 2
                    && candidate.common < 2
                    && candidate.alias == 0)
            {
                continue;
            }
            let token = crate::project::hash(&format!(
                "{language}\0{prefix}\0{}",
                words::normalize(&word)
            ));
            let preference: i64 = if personal {
                feedback
                    .query_row(params![project, token], |row| row.get(0))
                    .optional()
                    .app()?
                    .unwrap_or(0)
            } else {
                0
            };
            let score = candidate.base.min(8) * 2
                + candidate.common.min(8) * 2
                + candidate.project.min(12) * 5
                + candidate.alias * 7
                + preference * 2;
            if score > 0 && best.as_ref().is_none_or(|(value, _)| score > *value) {
                best = Some((
                    score,
                    Suggestion {
                        word,
                        feedback: token,
                        epoch,
                    },
                ));
            }
        }
        if let Some((_, result)) = best {
            return Ok(Some(result));
        }
    }
    Ok(None)
}
