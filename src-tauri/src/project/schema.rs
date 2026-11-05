use crate::error::{AppResult, Result};
use rusqlite::{Connection, TransactionBehavior};
use std::path::Path;
const SCHEMA_VERSION: i64 = 3;
/// SQLite itself refuses symlink filenames. Files used by the mirror protocol are
/// opened relative to a verified directory descriptor in `io`.
pub fn database(root: &Path) -> Result<Connection> {
    let directory = super::io::Dir::open(root)?;
    directory.child("manuscrit", false)?;
    directory.child("recuperation", false)?;
    // Validate the database independently, before SQLite opens it. SQLite's
    // NOFOLLOW flag also covers replacement of its final path component.
    for filename in [
        "ariane.sqlite",
        "ariane.sqlite-wal",
        "ariane.sqlite-shm",
        "ariane.sqlite-journal",
    ] {
        directory.open_file(filename, libc::O_RDONLY, 0)?;
    }
    let path = root.canonicalize().app()?.join("ariane.sqlite");
    let flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
        | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
        | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX
        | rusqlite::OpenFlags::SQLITE_OPEN_NOFOLLOW;
    let mut c = Connection::open_with_flags(path, flags).app()?;
    c.busy_timeout(std::time::Duration::from_secs(5)).app()?;
    c.execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
        .app()?;
    let schema: i64 = c
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .app()?;
    if schema > SCHEMA_VERSION {
        return Err("Ce projet nécessite une version plus récente d’ariane.".into());
    }
    if schema < SCHEMA_VERSION {
        if schema > 0 {
            backup_before_migration(root, &c, if schema < 2 { "versions" } else { "smart-tags" })?;
        }
        // Recheck under SQLite's write lock: another process might have migrated
        // between the first check and this transaction.
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        let current: i64 = tx
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .app()?;
        if current < 1 {
            tx.execute_batch("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sections(id TEXT PRIMARY KEY,parent TEXT,title TEXT NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL,text TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,synopsis TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Brouillon',goal INTEGER NOT NULL DEFAULT 0,mirror TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL,scope TEXT,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS vaults(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,scope TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS links(section TEXT,source TEXT,payload TEXT,PRIMARY KEY(section,source));
 CREATE TABLE IF NOT EXISTS citations(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS structure_history(id INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mirror_pending(id TEXT PRIMARY KEY,base TEXT NOT NULL,FOREIGN KEY(id) REFERENCES sections(id) ON DELETE CASCADE);").app()?;
            let columns = tx
                .prepare("PRAGMA table_info(sections)")
                .app()?
                .query_map([], |r| r.get::<_, String>(1))
                .app()?
                .collect::<std::result::Result<std::collections::HashSet<_>, _>>()
                .app()?;
            for (name, declaration) in [
                ("outline", "TEXT"),
                ("role", "TEXT NOT NULL DEFAULT 'manuscript'"),
                ("trashed", "INTEGER NOT NULL DEFAULT 0"),
                ("included", "INTEGER NOT NULL DEFAULT 1"),
            ] {
                if !columns.contains(name) {
                    tx.execute_batch(&format!(
                        "ALTER TABLE sections ADD COLUMN {name} {declaration}"
                    ))
                    .app()?;
                }
            }
            tx.execute(
                "INSERT OR REPLACE INTO meta(key,value) VALUES('outline_schema_version','1')",
                [],
            )
            .app()?;
            tx.execute_batch(
                "CREATE INDEX IF NOT EXISTS versions_created ON versions(created DESC,id DESC);
 CREATE INDEX IF NOT EXISTS versions_scope_name_created ON versions(scope,name,created DESC);
 CREATE INDEX IF NOT EXISTS sections_parent ON sections(parent);",
            )
            .app()?;
        }
        if current < 2 {
            let columns = tx
                .prepare("PRAGMA table_info(versions)")
                .app()?
                .query_map([], |r| r.get::<_, String>(1))
                .app()?
                .collect::<std::result::Result<std::collections::HashSet<_>, _>>()
                .app()?;
            for column in ["branch_id", "parent_id", "session_id", "merge_parent_id"] {
                if !columns.contains(column) {
                    tx.execute_batch(&format!("ALTER TABLE versions ADD COLUMN {column} TEXT"))
                        .app()?;
                }
            }
            tx.execute_batch("CREATE TABLE IF NOT EXISTS history_branches(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL,is_main INTEGER NOT NULL DEFAULT 0,base_version TEXT,head_version TEXT,draft TEXT NOT NULL,base_payload TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS automatic_versions(id TEXT PRIMARY KEY REFERENCES versions(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,bytes INTEGER NOT NULL);
 INSERT INTO history_branches(id,name,created,is_main,base_version,head_version,draft)
 SELECT 'main','Texte principal',strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,NULL,NULL,'{}'
 WHERE NOT EXISTS(SELECT 1 FROM history_branches WHERE id='main');
 INSERT INTO meta(key,value) VALUES('active_branch','main') ON CONFLICT(key) DO NOTHING;
 UPDATE versions SET branch_id='main' WHERE branch_id IS NULL;
 CREATE INDEX IF NOT EXISTS versions_branch_created ON versions(branch_id,created DESC,id DESC);").app()?;
        }
        if current < 3 {
            let has_tags = tx.prepare("PRAGMA table_info(sections)").app()?.query_map([], |r|r.get::<_,String>(1)).app()?.collect::<std::result::Result<Vec<_>,_>>().app()?.iter().any(|name|name == "tag_ids");
            if !has_tags { tx.execute_batch("ALTER TABLE sections ADD COLUMN tag_ids TEXT NOT NULL DEFAULT '[]';").app()?; }
            tx.execute_batch("INSERT INTO meta(key,value) VALUES('smart_tags','[]') ON CONFLICT(key) DO NOTHING;").app()?;
        }
        tx.pragma_update(None, "user_version", SCHEMA_VERSION)
            .app()?;
        tx.commit().app()?;
        c.pragma_update(None, "journal_mode", "WAL").app()?;
    }
    Ok(c)
}

/// Preserve a consistent SQLite snapshot (including uncheckpointed WAL pages).
pub(crate) fn backup_before_migration(root: &Path, c: &Connection, label: &str) -> Result<()> {
    let dir = super::io::Dir::open(root)?
        .child("recuperation", true)?
        .ok_or("Dossier de récupération inaccessible.")?;
    let name = format!("avant-{label}-{}.sqlite", uuid::Uuid::new_v4());
    let file = dir
        .open_file(&name, libc::O_RDWR | libc::O_CREAT | libc::O_EXCL, 0o600)?
        .ok_or("Copie de récupération inaccessible.")?;
    let mut target = Connection::open_with_flags(
        root.canonicalize().app()?.join("recuperation").join(name),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()?;
    rusqlite::backup::Backup::new(c, &mut target)
        .app()?
        .run_to_completion(128, std::time::Duration::from_millis(10), None)
        .app()?;
    file.sync_all().app()?;
    Ok(())
}
