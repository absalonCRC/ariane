use super::model::*;
use crate::error::{AppResult, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub const MAX_TEXT: usize = 2 * 1024 * 1024;
pub fn db(data: &Path) -> Result<Connection> {
    let c = Connection::open_with_flags(
        data.canonicalize().app()?.join("inbox.sqlite"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
            | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
            | rusqlite::OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()?;
    c.create_scalar_function(
        "capture_lower",
        1,
        rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC
            | rusqlite::functions::FunctionFlags::SQLITE_UTF8,
        |context| Ok(context.get::<String>(0)?.to_lowercase()),
    )
    .app()?;
    c.busy_timeout(std::time::Duration::from_secs(5)).app()?;
    c.execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
        .app()?;
    let version: i64 = c
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .app()?;
    if version > 1 {
        return Err("Cette boîte de réception nécessite une version plus récente d’ariane.".into());
    }
    if version == 0 {
        c.execute_batch("BEGIN IMMEDIATE;
            CREATE TABLE captures(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE operations(id TEXT PRIMARY KEY,input TEXT NOT NULL,output TEXT NOT NULL);
            CREATE TABLE transfers(id TEXT PRIMARY KEY,capture TEXT NOT NULL UNIQUE,input TEXT NOT NULL,destination TEXT NOT NULL);
            PRAGMA user_version=1; COMMIT; PRAGMA journal_mode=WAL;").app()?;
    }
    Ok(c)
}
pub fn validate_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 128
        || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Identifiant de capture invalide.".into());
    }
    Ok(())
}
pub fn validate_capture(value: &Capture) -> Result<()> {
    validate_id(&value.id)?;
    if value.text.len() > MAX_TEXT
        || value.revision < 0
        || !["draft", "ready", "filed"].contains(&value.status.as_str())
        || value.selection.head > value.text.encode_utf16().count()
        || value.selection.anchor > value.text.encode_utf16().count()
    {
        return Err("Capture invalide ou trop volumineuse.".into());
    }
    Ok(())
}
pub fn get(c: &Connection, id: &str) -> Result<Capture> {
    let raw: String = c
        .query_row("SELECT payload FROM captures WHERE id=?", [id], |r| {
            r.get(0)
        })
        .app()?;
    serde_json::from_str(&raw).app()
}
pub fn put(c: &Connection, value: &Capture) -> Result<()> {
    validate_capture(value)?;
    c.execute(
        "INSERT INTO captures VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        params![value.id, serde_json::to_string(value).app()?],
    )
    .app()?;
    Ok(())
}
fn new_draft(c: &Connection) -> Result<Capture> {
    let now = chrono::Utc::now().to_rfc3339();
    let value = Capture {
        id: uuid::Uuid::new_v4().to_string(),
        revision: 0,
        text: String::new(),
        created_at: now.clone(),
        updated_at: now,
        status: "draft".into(),
        selection: Selection::default(),
        destination: None,
        pending_destination: None,
        mirror_pending: None,
    };
    put(c, &value)?;
    c.execute(
        "INSERT INTO meta VALUES('active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [&value.id],
    )
    .app()?;
    Ok(value)
}
pub fn draft(c: &mut Connection) -> Result<Capture> {
    let tx = c.transaction().app()?;
    let id: Option<String> = tx
        .query_row("SELECT value FROM meta WHERE key='active'", [], |r| {
            r.get(0)
        })
        .optional()
        .app()?;
    let value = if let Some(id) = id {
        let value = get(&tx, &id)?;
        if value.status != "draft" {
            return Err("Brouillon actif invalide.".into());
        }
        value
    } else {
        new_draft(&tx)?
    };
    tx.commit().app()?;
    Ok(value)
}
pub fn replay(c: &Connection, id: &str, input: &str) -> Result<Option<serde_json::Value>> {
    validate_id(id)?;
    let previous: Option<(String, String)> = c
        .query_row(
            "SELECT input,output FROM operations WHERE id=?",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .app()?;
    if let Some((before, result)) = previous {
        if before != input && before != format!("sha256:{}", crate::project::hash(input)) {
            return Err("Cette opération a déjà un autre contenu.".into());
        }
        return Ok(Some(serde_json::from_str(&result).app()?));
    }
    Ok(None)
}
pub fn record(c: &Connection, id: &str, input: &str, value: &serde_json::Value) -> Result<()> {
    c.execute(
        "INSERT INTO operations VALUES(?,?,?)",
        params![
            id,
            format!("sha256:{}", crate::project::hash(input)),
            value.to_string()
        ],
    )
    .app()?;
    Ok(())
}
pub fn save(
    c: &mut Connection,
    id: &str,
    revision: i64,
    operation: &str,
    text: &str,
    selection: Selection,
) -> Result<Capture> {
    let input = serde_json::to_string(&("save", id, revision, text, &selection)).app()?;
    let tx = c.transaction().app()?;
    if let Some(mut value) = replay(&tx, operation, &input)? {
        // The input hash authenticates this text; receipts need not duplicate every draft.
        if value.get("text").is_none() {
            value["text"] = serde_json::json!(text);
        }
        return serde_json::from_value(value).app();
    }
    let mut value = get(&tx, id)?;
    if value.revision != revision || value.status != "draft" {
        return Err("La capture a changé. Votre texte reste disponible.".into());
    }
    value.text = text.into();
    value.selection = selection;
    value.revision += 1;
    value.updated_at = chrono::Utc::now().to_rfc3339();
    put(&tx, &value)?;
    let mut receipt = serde_json::to_value(&value).app()?;
    receipt.as_object_mut().unwrap().remove("text");
    record(&tx, operation, &input, &receipt)?;
    tx.commit().app()?;
    Ok(value)
}
pub fn finish(c: &mut Connection, id: &str, revision: i64, operation: &str) -> Result<Capture> {
    let input = serde_json::to_string(&("finish", id, revision)).app()?;
    let tx = c.transaction().app()?;
    if let Some(value) = replay(&tx, operation, &input)? {
        return serde_json::from_value(value).app();
    }
    let mut value = get(&tx, id)?;
    if value.status != "draft" || value.revision != revision {
        return Err("La capture a changé. Votre texte reste disponible.".into());
    }
    let next = if value.text.trim().is_empty() {
        value
    } else {
        value.status = "ready".into();
        value.revision += 1;
        value.updated_at = chrono::Utc::now().to_rfc3339();
        put(&tx, &value)?;
        new_draft(&tx)?
    };
    record(&tx, operation, &input, &serde_json::to_value(&next).app()?)?;
    tx.commit().app()?;
    Ok(next)
}
pub fn list(c: &Connection, query: &str, filed: bool, offset: usize) -> Result<Page> {
    let mut stmt=c.prepare("SELECT payload FROM captures WHERE json_extract(payload,'$.status')=? AND instr(capture_lower(json_extract(payload,'$.text')),capture_lower(?))>0 ORDER BY json_extract(payload,'$.updatedAt') DESC,id DESC LIMIT 51 OFFSET ?").app()?;
    let rows = stmt
        .query_map(
            params![
                if filed { "filed" } else { "ready" },
                query,
                offset.min(1_000_000) as i64
            ],
            |r| r.get::<_, String>(0),
        )
        .app()?;
    let mut items = rows
        .map(|v| serde_json::from_str(&v.app()?).app())
        .collect::<Result<Vec<Capture>>>()?;
    for item in &mut items {
        if item.status == "ready" {
            let raw: Option<String> = c
                .query_row(
                    "SELECT destination FROM transfers WHERE capture=?",
                    [&item.id],
                    |r| r.get(0),
                )
                .optional()
                .app()?;
            item.pending_destination = raw
                .map(|raw| serde_json::from_str(&raw).app())
                .transpose()?;
        }
    }
    let more = items.len() > 50;
    items.truncate(50);
    Ok(Page { items, more })
}
pub fn preferences(c: &Connection) -> Result<Preferences> {
    let raw: Option<String> = c
        .query_row("SELECT value FROM meta WHERE key='preferences'", [], |r| {
            r.get(0)
        })
        .optional()
        .app()?;
    raw.map(|s| serde_json::from_str(&s).app())
        .unwrap_or_else(|| Ok(Preferences::default()))
}
pub fn set_preferences(c: &Connection, value: &Preferences) -> Result<()> {
    validate_preferences(value)?;
    c.execute("INSERT INTO meta VALUES('preferences',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(value).app()?]).app()?;
    Ok(())
}

pub fn validate_preferences(value: &Preferences) -> Result<()> {
    if !value.volume.is_finite()
        || !(0.0..=1.0).contains(&value.volume)
        || value.shortcut.as_ref().is_some_and(|s| s.len() > 100)
    {
        return Err("Réglages de capture invalides.".into());
    }
    if let Some(key) = &value.shortcut {
        let key = key.replace("Mod+", "CommandOrControl+");
        let parsed = key
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .map_err(|_| "Raccourci global invalide.")?;
        if parsed.mods.is_empty() && !format!("{:?}", parsed.key).starts_with('F') {
            return Err("Raccourci global invalide.".into());
        }
        if [
            "Mod+Q",
            "Mod+W",
            "Mod+H",
            "Mod+M",
            "Mod+Z",
            "Mod+Shift+Z",
            "Mod+X",
            "Mod+C",
            "Mod+V",
            "Mod+A",
            "Mod+Space",
            "Mod+Tab",
            "Alt+Tab",
            "Mod+Shift+M",
        ]
        .contains(&value.shortcut.as_deref().unwrap())
        {
            return Err("Cette combinaison est réservée à la saisie ou au système.".into());
        }
    }
    Ok(())
}
