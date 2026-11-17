use super::{model::*, storage};
use crate::error::{AppResult, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::{path::Path, time::Duration};

pub fn snapshot(c: &Connection, path: &Path) -> Result<()> {
    // Reserve a fresh destination: never follow a symlink or overwrite an existing backup.
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .app()?;
    let canonical = path
        .parent()
        .ok_or("Destination invalide")?
        .canonicalize()
        .app()?
        .join(path.file_name().ok_or("Destination invalide")?);
    let mut target = Connection::open_with_flags(
        canonical,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()?;
    rusqlite::backup::Backup::new(c, &mut target)
        .app()?
        .run_to_completion(128, Duration::from_millis(10), None)
        .app()?;
    let manifest = serde_json::json!({"kind":"ariane-captures","format":1,"application":env!("CARGO_PKG_VERSION"),"createdAt":chrono::Utc::now().to_rfc3339()});
    target.execute("INSERT INTO meta VALUES('backup_manifest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[manifest.to_string()]).app()?;
    target
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;")
        .app()?;
    file.sync_all().app()?;
    Ok(())
}
pub fn restore(c: &mut Connection, data: &Path, path: &Path) -> Result<usize> {
    if std::fs::symlink_metadata(path)
        .app()?
        .file_type()
        .is_symlink()
    {
        return Err("Sauvegarde symbolique refusée.".into());
    }
    let source = Connection::open_with_flags(
        path.canonicalize().app()?,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()?;
    source.execute_batch("BEGIN").app()?;
    let version: i64 = source
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .app()?;
    let integrity: String = source
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .app()?;
    if version != 1 || integrity != "ok" {
        return Err("Sauvegarde de captures invalide ou incompatible.".into());
    }
    // Bound each serialized row, not the entire archive: a valid reception can grow.
    // 16 MiB also accommodates escaped JSON for a capture of at most 2 MiB.
    for (table, columns) in [
        ("captures", vec!["payload"]),
        ("meta", vec!["value"]),
        ("operations", vec!["input", "output"]),
        ("transfers", vec!["input", "destination"]),
    ] {
        for column in columns {
            let oversized: bool = source
                .query_row(
                    &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE length(CAST({column} AS BLOB)) > 16777216)"),
                    [],
                    |r| r.get(0),
                )
                .app()?;
            if oversized {
                return Err("Sauvegarde de captures invalide ou incompatible.".into());
            }
        }
    }
    let manifest: String = source
        .query_row(
            "SELECT value FROM meta WHERE key='backup_manifest'",
            [],
            |r| r.get(0),
        )
        .app()?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest).app()?;
    if manifest["kind"] != "ariane-captures" || manifest["format"] != 1 {
        return Err("Sauvegarde de captures invalide ou incompatible.".into());
    }
    let mut q = source
        .prepare("SELECT payload FROM captures ORDER BY id")
        .app()?;
    for row in q.query_map([], |r| r.get::<_, String>(0)).app()? {
        let value: Capture = serde_json::from_str(&row.app()?).app()?;
        storage::validate_capture(&value)?;
    }
    let preferences = storage::preferences(&source)?;
    storage::validate_preferences(&preferences)?;
    let return_path = data.join(format!(
        "avant-restauration-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    snapshot(c, &return_path)?;
    let active = storage::draft(c)?;
    let tx = c.transaction().app()?;
    let mut count = 0;
    let mut restored_draft = false;
    for row in q.query_map([], |r| r.get::<_, String>(0)).app()? {
        let mut value: Capture = serde_json::from_str(&row.app()?).app()?;
        if value.text.is_empty() {
            continue;
        }
        let old: Option<String> = tx
            .query_row(
                "SELECT payload FROM captures WHERE id=?",
                [&value.id],
                |r| r.get(0),
            )
            .optional()
            .app()?;
        if let Some(raw) = old {
            let before: Capture = serde_json::from_str(&raw).app()?;
            if before.text == value.text {
                continue;
            }
            // Both versions remain explicit, rather than silently preferring a timestamp.
            value.id = format!(
                "restored-{}",
                crate::project::hash(&format!("{}:{}", value.id, value.text))
            );
            value.destination = None;
            value.status = "ready".into();
            value.revision = 0;
            if storage::get(&tx, &value.id).is_ok() {
                continue;
            }
        } else if value.status == "draft" {
            if active.text.is_empty() && !restored_draft {
                tx.execute("UPDATE meta SET value=? WHERE key='active'", [&value.id])
                    .app()?;
                restored_draft = true;
            } else {
                value.status = "ready".into();
            }
        }
        storage::put(&tx, &value)?;
        count += 1;
    }
    // Preserve durable intentions and receipts; divergent IDs require a manual resolution.
    for table in ["operations", "transfers"] {
        let columns = if table == "operations" {
            "id,input,output"
        } else {
            "id,capture,input,destination"
        };
        let mut query = source
            .prepare(&format!("SELECT {columns} FROM {table}"))
            .app()?;
        if table == "operations" {
            let rows = query
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })
                .app()?;
            for row in rows {
                let (id, input, output) = row.app()?;
                tx.execute(
                    "INSERT OR IGNORE INTO operations VALUES(?,?,?)",
                    params![id, input, output],
                )
                .app()?;
            }
        } else {
            let rows = query
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                })
                .app()?;
            for row in rows {
                let (id, capture, input, destination) = row.app()?;
                let value = storage::get(&tx, &capture)?;
                let expected: Destination = serde_json::from_str(&destination).app()?;
                if crate::project::hash(&value.text) == expected.fingerprint {
                    tx.execute(
                        "INSERT OR IGNORE INTO transfers VALUES(?,?,?,?)",
                        params![id, capture, input, destination],
                    )
                    .app()?;
                }
            }
        }
    }
    storage::set_preferences(&tx, &preferences)?;
    tx.commit().app()?;
    Ok(count)
}
