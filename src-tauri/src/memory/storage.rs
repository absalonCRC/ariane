use crate::{
    error::{AppResult, Result},
    project,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::path::Path;

pub(super) fn database(root: &Path) -> Result<Connection> {
    if !root.join("ariane.sqlite").is_file() {
        return Err("Projet ariane introuvable.".into());
    }
    let c = project::database(root)?;
    // Read paths must not acquire a write lock just to reopen an initialized
    // schema. GLiNER and Gemma publish independently under WAL.
    let schema: Option<String> = c.query_row("SELECT value FROM meta WHERE key='memory_schema_version'", [], |r|r.get(0),
        ).optional().app()?;
    if schema.as_deref() == Some("3") { return Ok(c); }
    c.execute_batch("CREATE TABLE IF NOT EXISTS memory_encoding_cache(key TEXT PRIMARY KEY,vector BLOB NOT NULL,used INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS memory_classification_queue(source TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,context TEXT NOT NULL,registry TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,retry INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS memory_passages(
        key TEXT PRIMARY KEY, section TEXT NOT NULL, node TEXT, title TEXT NOT NULL,
        text TEXT NOT NULL, hash TEXT NOT NULL, position INTEGER NOT NULL,
        revision INTEGER NOT NULL, analyzed INTEGER NOT NULL DEFAULT 0,
        vector TEXT, model TEXT, query_vector TEXT);
        CREATE TABLE IF NOT EXISTS memory_ner(
          passage_key TEXT PRIMARY KEY,hash TEXT NOT NULL,model TEXT NOT NULL,
          FOREIGN KEY(passage_key) REFERENCES memory_passages(key) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS memory_passage_section ON memory_passages(section,position);
        CREATE TABLE IF NOT EXISTS memory_sections(
          id TEXT PRIMARY KEY,revision INTEGER NOT NULL,mirror TEXT NOT NULL,
          outline_hash TEXT NOT NULL,title TEXT NOT NULL);
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(key UNINDEXED,text,tokenize='unicode61 remove_diacritics 2');
        CREATE TABLE IF NOT EXISTS memory_entities(
          id TEXT PRIMARY KEY,title TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE,kind TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS memory_mentions(
          passage_key TEXT NOT NULL,entity_id TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,
          origin TEXT NOT NULL,PRIMARY KEY(passage_key,entity_id,start,end),
          FOREIGN KEY(passage_key) REFERENCES memory_passages(key) ON DELETE CASCADE,
          FOREIGN KEY(entity_id) REFERENCES memory_entities(id) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS memory_mentions_entity ON memory_mentions(entity_id);
        CREATE TABLE IF NOT EXISTS memory_dismissals(id TEXT NOT NULL,hash TEXT NOT NULL,
          PRIMARY KEY(id,hash));
        CREATE TABLE IF NOT EXISTS memory_session(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);").app()?;
    let has_query: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM pragma_table_info('memory_passages') WHERE name='query_vector')",[],|r|r.get(0)).app()?;
    if !has_query {
        c.execute_batch("ALTER TABLE memory_passages ADD COLUMN query_vector TEXT; UPDATE memory_passages SET analyzed=0;").app()?;
    }
    c.execute("INSERT INTO meta(key,value) VALUES('memory_schema_version','3') ON CONFLICT(key) DO UPDATE SET value=excluded.value", []).app()?;
    Ok(c)
}

pub(super) fn fingerprint(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

pub(super) fn delete_passage(tx: &Transaction<'_>, key: &str) -> Result<()> {
    tx.execute("DELETE FROM memory_ner WHERE passage_key=?", [key]).app()?;
    tx.execute("DELETE FROM memory_mentions WHERE passage_key=?", [key])
        .app()?;
    tx.execute("DELETE FROM memory_fts WHERE key=?", [key])
        .app()?;
    tx.execute("DELETE FROM memory_passages WHERE key=?", [key])
        .app()?;
    Ok(())
}

pub(super) fn upsert_passage(
    tx: &Transaction<'_>,
    p: &super::Passage,
    revision: i64,
) -> Result<()> {
    tx.execute("DELETE FROM memory_mentions WHERE passage_key=?", [&p.key])
        .app()?;
    tx.execute(
        "INSERT INTO memory_passages(key,section,node,title,text,hash,position,revision)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET
        section=excluded.section,node=excluded.node,title=excluded.title,text=excluded.text,
        hash=excluded.hash,position=excluded.position,revision=excluded.revision,
        analyzed=0,vector=NULL,model=NULL,query_vector=NULL",
        params![
            p.key,
            p.section,
            p.node,
            p.title,
            p.text,
            p.hash,
            p.position as i64,
            revision
        ],
    )
    .app()?;
    tx.execute("DELETE FROM memory_fts WHERE key=?", [&p.key])
        .app()?;
    tx.execute(
        "INSERT INTO memory_fts(key,text) VALUES(?,?)",
        params![p.key, p.text],
    )
    .app()?;
    Ok(())
}
