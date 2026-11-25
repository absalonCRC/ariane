mod cards;
pub use cards::{update_card,recover_card_edits};
mod aliases;
pub use aliases::update_aliases;
mod classification;
pub use classification::{apply_note_type, classification_types, example_type, predicted_type};
#[cfg(test)]
pub(crate) use classification::{predicted_type_with_policy, EntityType};
mod notes;
pub use notes::{create_quick_note, note_references, suggest_notes};
mod browse;
mod access;
use access::Access;
pub(crate) use access::VaultFolder;
mod pdf;
mod scan;
pub(crate) use scan::fingerprint;
pub use browse::browse;
mod owned;
pub mod parse;
use crate::inference::Engine;
use crate::{
    error::{AppResult, Result},
    model::*,
    project,
};
pub use owned::{create_entity, create_owned, create_project};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Mutex},
};
pub fn index_db(path: &Path) -> Result<Connection> {
    let mut c = Connection::open(path).app()?;
    c.busy_timeout(std::time::Duration::from_secs(10)).app()?;
    let version: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0)).app()?;
    if version == 0 {
        // SQLite may return BUSY immediately on simultaneous WAL mode changes.
        // Serialize initialization per index, including the first reads after a restore.
        project::with_lock(path, || initialize_index(&mut c))?;
    }
    crate::vectors::migrate_batch(&c)?;
    Ok(c)
}
fn initialize_index(c: &mut Connection) -> Result<()> {
    let version: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0)).app()?;
    if version != 0 { return Ok(()); }
    c.pragma_update(None, "journal_mode", "WAL").app()?;
    let tx = c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).app()?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,vault TEXT,path TEXT,hash TEXT,payload TEXT);
        CREATE INDEX IF NOT EXISTS sources_vault_path ON sources(vault,path);
        CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY,source TEXT,page INTEGER,text TEXT,vector TEXT,model TEXT);
        CREATE INDEX IF NOT EXISTS chunk_source ON chunks(source);
        CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(text,source UNINDEXED,page UNINDEXED);
        CREATE TABLE IF NOT EXISTS source_file_state(source TEXT PRIMARY KEY,signature TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS index_generations(singleton INTEGER PRIMARY KEY CHECK(singleton=1),catalog INTEGER NOT NULL,vectors INTEGER NOT NULL);
        INSERT OR IGNORE INTO index_generations VALUES(1,0,0);
        CREATE TRIGGER IF NOT EXISTS sources_generation_insert AFTER INSERT ON sources BEGIN UPDATE index_generations SET catalog=catalog+1 WHERE singleton=1; END;
        CREATE TRIGGER IF NOT EXISTS sources_generation_update AFTER UPDATE ON sources BEGIN UPDATE index_generations SET catalog=catalog+1 WHERE singleton=1; END;
        CREATE TRIGGER IF NOT EXISTS sources_generation_delete AFTER DELETE ON sources BEGIN UPDATE index_generations SET catalog=catalog+1 WHERE singleton=1; END;
        CREATE TRIGGER IF NOT EXISTS chunks_generation_insert AFTER INSERT ON chunks BEGIN UPDATE index_generations SET vectors=vectors+1 WHERE singleton=1; END;
        CREATE TRIGGER IF NOT EXISTS chunks_generation_update AFTER UPDATE ON chunks BEGIN UPDATE index_generations SET vectors=vectors+1 WHERE singleton=1; END;
        CREATE TRIGGER IF NOT EXISTS chunks_generation_delete AFTER DELETE ON chunks BEGIN UPDATE index_generations SET vectors=vectors+1 WHERE singleton=1; END;").app()?;
    let has_verified = {
        let mut columns = tx.prepare("PRAGMA table_info(source_file_state)").app()?;
        let mut rows = columns.query_map([], |r| r.get::<_, String>(1)).app()?;
        rows.any(|row| row.is_ok_and(|name| name == "verified"))
    };
    if !has_verified {
        tx.execute(
            "ALTER TABLE source_file_state ADD COLUMN verified INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .app()?;
    }
    tx.pragma_update(None, "user_version", 1).app()?;
    tx.commit().app()
}
pub fn list(root: &Path, index: &Path) -> Result<Vec<Vault>> {
    let c = project::database(root)?;
    let idx = index_db(index)?;
    let data = index.parent().ok_or("Index de sources invalide.")?;
    // An unavailable profile never authorizes a project path from its database.
    let access = Access::load(data, root).unwrap_or_default();
    let active_index = access.index_path(data).is_none_or(|expected| expected == index);
    let shared_index = index.file_name().is_some_and(|name| name == "sources.sqlite");
    let internal = root.canonicalize().app()?.join("Vault");
    let mut q = c.prepare("SELECT id,path,scope FROM vaults").app()?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .app()?;
    let mut out = vec![];
    for r in rows {
        let (id, path, scope) = r.app()?;
        let folder = Path::new(&path);
        let owned = folder == internal && owned::is_owned(root, folder);
        let (available, needs_authorization) = if owned {
            (active_index && (!shared_index || id == project::hash(&path)), false)
        } else if active_index {
            access.status(&id, folder)
        } else {
            (false, true)
        };
        let count = if available {
            idx.query_row("SELECT count(*) FROM sources WHERE vault=?", [&id], |r| r.get(0))
                .app()?
        } else {
            0
        };
        out.push(Vault {
            id,
            name: folder
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            available,
            needs_authorization,
            owned,
            path,
            scope: serde_json::from_str(&scope).unwrap_or_default(),
            count,
        })
    }
    Ok(out)
}
fn register(root: &Path, path: &Path) -> Result<()> {
    let path = path.canonicalize().app()?;
    if !path.is_dir() {
        return Err("Choisissez un dossier de vault.".into());
    }
    let c = project::database(root)?;
    c.execute(
        "INSERT OR IGNORE INTO vaults(id,path) VALUES(?,?)",
        params![
            project::hash(&path.to_string_lossy()),
            path.to_string_lossy()
        ],
    )
    .app()?;
    Ok(())
}

pub(crate) fn private_source_index(data: &Path, root: &Path) -> Option<PathBuf> {
    Access::load(data, root).ok()?.index_path(data)
}

pub(crate) fn connect(
    root: &Path,
    data: &Path,
    folder: VaultFolder,
    reconnect: Option<&str>,
) -> Result<()> {
    project::with_lock(root, || {
        if VaultFolder::selected(&folder.path)? != folder {
            return Err("Le dossier a changé. Sélectionnez-le à nouveau.".into());
        }
        let mut c = project::database(root)?;
        let mut access = Access::load(data, root)?;
        let tx = c.transaction().app()?;
        let path = folder.path.to_str().ok_or("Chemin de vault invalide.")?;
        let attached: Option<String> = tx.query_row(
            "SELECT id FROM vaults WHERE path=?",
            [path],
            |row| row.get(0),
        ).optional().app()?;
        let (id, previous) = if let Some(id) = reconnect {
            let previous: String = tx.query_row("SELECT path FROM vaults WHERE id=?", [id], |row| row.get(0))
                .optional().app()?.ok_or("Vault introuvable")?;
            if owned::is_owned(root, Path::new(&previous))
                || owned::is_owned(root, &folder.path)
            {
                return Err("Choisissez un dossier de sources externe au projet.".into());
            }
            if attached.as_deref().is_some_and(|attached| attached != id) {
                return Err("Ce dossier de sources est déjà rattaché au projet.".into());
            }
            tx.execute("UPDATE vaults SET path=? WHERE id=?", params![path, id]).app()?;
            (id.to_owned(), Some(previous))
        } else if let Some(id) = attached {
            (id, None)
        } else {
            let id = project::hash(path);
            tx.execute("INSERT INTO vaults(id,path) VALUES(?,?)", params![id, path]).app()?;
            (id, None)
        };
        // Publish consent before committing the reference. A failed relocation
        // can leave a pending reference, but the new consent cannot match the old path.
        access.grant(&id, folder, previous.as_deref());
        access.save(data, root)?;
        tx.commit().app()
    })
}
pub fn set_scope(root: &Path, id: &str, scope: Vec<String>) -> Result<()> {
    for s in &scope {
        if Path::new(s).is_absolute()
            || Path::new(s)
                .components()
                .any(|x| matches!(x, std::path::Component::ParentDir))
        {
            return Err("Périmètre de sources invalide".into());
        }
    }
    project::database(root)?
        .execute(
            "UPDATE vaults SET scope=? WHERE id=?",
            params![serde_json::to_string(&scope).app()?, id],
        )
        .app()?;
    Ok(())
}
pub fn allowed(s: &Source, vaults: &[Vault]) -> bool {
    vaults.iter().any(|v| {
        v.available
            && v.id == s.vault_id
            && (v.scope.is_empty()
                || v.scope
                    .iter()
                    .any(|scope| Path::new(&s.path).starts_with(scope)))
    })
}
/// Scope predicate uses only indexed metadata; foreign payloads are never parsed.
pub(crate) const SCOPE_SQL: &str = "EXISTS(SELECT 1 FROM json_each(?1) v WHERE json_extract(v.value,'$.id')=s.vault AND (json_array_length(v.value,'$.scope')=0 OR EXISTS(SELECT 1 FROM json_each(v.value,'$.scope') f WHERE s.path=f.value OR substr(s.path,1,length(f.value)+1)=f.value||'/')))";
pub(crate) fn scope_json(vaults: &[Vault]) -> Result<String> {
    serde_json::to_string(
        &vaults
            .iter()
            .filter(|v| v.available)
            .map(|v| serde_json::json!({"id":v.id,"scope":v.scope}))
            .collect::<Vec<_>>(),
    )
    .app()
}
#[cfg(test)]
pub fn all(index: &Path, vaults: &[Vault]) -> Result<Vec<Source>> {
    let c = index_db(index)?;
    let mut q = c
        .prepare(&format!("SELECT payload FROM sources s WHERE {SCOPE_SQL}"))
        .app()?;
    let rows = q
        .query_map([scope_json(vaults)?], |r| r.get::<_, String>(0))
        .app()?;
    rows.map(|r| serde_json::from_str(&r.app()?).app())
        .collect()
}

pub fn source(index: &Path, id: &str, vaults: &[Vault]) -> Result<Source> {
    let c = index_db(index)?;
    let payload: String = c.query_row(
        &format!("SELECT payload FROM sources s WHERE s.id=?2 AND {SCOPE_SQL}"),
        params![scope_json(vaults)?, id],
        |r| r.get(0),
    ).optional().app()?.ok_or("Source hors du périmètre du projet")?;
    let s: Source = serde_json::from_str(&payload).app()?;
    if !allowed(&s, vaults) {
        return Err("Source hors du périmètre du projet".into());
    }
    Ok(s)
}
pub fn file(index: &Path, id: &str, vaults: &[Vault]) -> Result<PathBuf> {
    let s = source(index, id, vaults)?;
    let v = vaults
        .iter()
        .find(|v| v.id == s.vault_id)
        .ok_or("Vault introuvable")?;
    let root = Path::new(&v.path).canonicalize().app()?;
    let path = root.join(s.path).canonicalize().app()?;
    if !path.starts_with(root) {
        return Err("Le fichier est hors du vault".into());
    }
    Ok(path)
}
/// Compatibility entry point for callers without interactive activity tracking.
#[cfg(test)]
pub fn index(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    cancel: &AtomicBool,
    progress: impl Fn(serde_json::Value),
) -> Result<serde_json::Value> {
    scan::run(root, index, resources, engine, cancel, None, progress)
}

/// Index while yielding to editor activity and foreground inference.
pub fn index_with_activity(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    cancel: &AtomicBool,
    activity: &crate::memory_engine::Activity,
    progress: impl Fn(serde_json::Value),
) -> Result<serde_json::Value> {
    scan::run(
        root,
        index,
        resources,
        engine,
        cancel,
        Some(activity),
        progress,
    )
}
/// Make a newly created project fiche available immediately, without a model or
/// a full vault scan. The regular indexer can add vectors later.
pub fn index_created_entity(root: &Path, index: &Path, path: &Path) -> Result<Source> {
    let vault = list(root, index)?
        .into_iter()
        .find(|v| v.owned && v.available)
        .ok_or("Vault du projet introuvable.")?;
    let relative = path
        .strip_prefix(&vault.path)
        .map_err(|e| e.to_string())?
        .to_string_lossy();
    let bytes = fs::read(path).app()?;
    let mut source = parse::parse(&vault.id, &relative, &String::from_utf8_lossy(&bytes));
    let hash = project::hash(&format!(
        "{}:{:x}",
        bytes.len(),
        <sha2::Sha256 as sha2::Digest>::digest(&bytes)
    ));
    source.fingerprint = hash.clone();
    let mut c = index_db(index)?;
    let tx = c.transaction().app()?;
    tx.execute(
        "INSERT OR REPLACE INTO sources(id,vault,path,hash,payload) VALUES(?,?,?,?,?)",
        params![
            source.id,
            vault.id,
            relative,
            hash,
            serde_json::to_string(&source).app()?
        ],
    )
    .app()?;
    tx.execute("DELETE FROM chunks WHERE source=?", [&source.id])
        .app()?;
    tx.execute("DELETE FROM search WHERE source=?", [&source.id])
        .app()?;
    for chunk in parse::chunks(&source.text) {
        tx.execute(
            "INSERT INTO chunks(source,text) VALUES(?,?)",
            params![source.id, chunk],
        )
        .app()?;
        tx.execute(
            "INSERT INTO search(text,source) VALUES(?,?)",
            params![chunk, source.id],
        )
        .app()?;
    }
    tx.commit().app()?;
    Ok(source)
}

pub fn remove(root: &Path, data: &Path, id: &str) -> Result<()> {
    project::with_lock(root, || {
        let mut access = Access::load(data, root)?;
        if access.revoke(id) {
            access.save(data, root)?;
        }
        project::database(root)?
            .execute("DELETE FROM vaults WHERE id=?", [id])
            .app()?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn concurrent_first_readers_can_open_a_restored_source_index() {
        let dir = tempfile::tempdir().unwrap();
        for n in 0..8 {
            let index = dir.path().join(format!("sources-{n}.sqlite"));
            let barrier = std::sync::Barrier::new(8);
            std::thread::scope(|scope| {
                for _ in 0..8 {
                    scope.spawn(|| {
                        barrier.wait();
                        let conn = super::index_db(&index).unwrap();
                        let count: i64 = conn.query_row("SELECT count(*) FROM sources", [], |r| r.get(0)).unwrap();
                        assert_eq!(count, 0);
                    });
                }
            });
        }
    }
    use super::*;
    #[test]
    fn received_project_reconnects_without_sharing_relocated_sources_or_changing_citations() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("Profile");
        fs::create_dir(&data).unwrap();
        let original = temp.path().join("Original");
        let received = temp.path().join("Copie reçue");
        let external = temp.path().join("Sources originales");
        let relocated = temp.path().join("Sources locales");
        let relative = "Fiches/Carnet.md";
        for directory in [&external, &relocated] {
            fs::create_dir_all(directory.join("Fiches")).unwrap();
        }
        fs::write(external.join(relative), "Témoin original.").unwrap();
        fs::write(relocated.join(relative), "Témoin de la copie.").unwrap();

        project::create(&original, "Livre").unwrap();
        connect(&original, &data, VaultFolder::selected(&external).unwrap(), None).unwrap();
        let shared = project::backup::source_index(&data, &original);
        let saved = list(&original, &shared).unwrap().remove(0);
        assert!(saved.available && !saved.needs_authorization);
        set_scope(&original, &saved.id, vec!["Fiches".into()]).unwrap();
        let source_id = project::hash(&format!("{}/{relative}", saved.id));
        let citation = serde_json::json!({"source": source_id, "quote": "Carnet"});
        project::links::cite(&original, "reference", citation.clone()).unwrap();

        let scanning = |root: &Path, index: &Path| {
            let activity = crate::memory_engine::Activity::default();
            activity.writing(true);
            index_with_activity(
                root, index, temp.path(), &Mutex::new(Engine::default()),
                &AtomicBool::new(false), &activity, |_| {},
            ).unwrap()
        };
        assert_eq!(scanning(&original, &shared)["indexed"], 1);
        fs::create_dir(&received).unwrap();
        fs::copy(original.join("ariane.sqlite"), received.join("ariane.sqlite")).unwrap();
        project::load(&received).unwrap();

        let inherited = list(&received, &shared).unwrap().remove(0);
        assert_eq!(inherited.id, saved.id);
        assert!(inherited.needs_authorization && !inherited.available);
        assert_eq!(inherited.count, 0);
        assert_eq!(scanning(&received, &shared)["indexed"], 0);
        assert_eq!(
            serde_json::to_value(browse(&received, &shared, "", None, None, None, 0).unwrap())
                .unwrap()["total"],
            0,
        );
        assert!(source(&shared, &source_id, &[inherited]).is_err());

        connect(&received, &data, VaultFolder::selected(&relocated).unwrap(), Some(&saved.id)).unwrap();
        let private = project::backup::source_index(&data, &received);
        assert_ne!(shared, private);
        assert_eq!(scanning(&received, &private)["indexed"], 1);
        let authorized = list(&received, &private).unwrap();
        assert_eq!(authorized[0].scope, ["Fiches"]);
        assert_eq!(source(&private, &source_id, &authorized).unwrap().text, "Témoin de la copie.");
        assert_eq!(file(&private, &source_id, &authorized).unwrap(), relocated.canonicalize().unwrap().join(relative));
        assert_eq!(source(&shared, &source_id, &list(&original, &shared).unwrap()).unwrap().text, "Témoin original.");
        assert!(source(&shared, &source_id, &list(&received, &shared).unwrap()).is_err());
        assert_eq!(
            project::database(&received).unwrap().query_row(
                "SELECT payload FROM citations WHERE id='reference'", [], |row| row.get::<_, String>(0),
            ).unwrap(),
            citation.to_string(),
        );
        // The consent survives a normal reopen and is tied to this database file.
        project::load(&received).unwrap();
        assert!(list(&received, &private).unwrap()[0].available);
        fs::rename(received.join("ariane.sqlite"), received.join("ancienne-base.sqlite")).unwrap();
        fs::copy(original.join("ariane.sqlite"), received.join("ariane.sqlite")).unwrap();
        assert!(list(&received, &shared).unwrap()[0].needs_authorization);
    }

    #[test]
    fn resumes_only_missing_vectors_for_unchanged_source() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        crate::project::create(&root, "Test").unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        fs::write(
            vault.join("note.md"),
            format!(
                "{}\n\n{}",
                "Première partie. ".repeat(120),
                "Autre partie. ".repeat(120)
            ),
        )
        .unwrap();
        connect(&root, temp.path(), VaultFolder::selected(&vault).unwrap(), None).unwrap();
        let path = temp.path().join("index.sqlite");
        let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let engine = Mutex::new(Engine::default());
        let cancel = AtomicBool::new(false);
        index(&root, &path, &resources, &engine, &cancel, |_| {}).unwrap();
        let db = index_db(&path).unwrap();
        let records = {
            let mut q = db
                .prepare("SELECT id,vector FROM chunks ORDER BY id")
                .unwrap();
            q.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?)))
                .unwrap()
                .collect::<std::result::Result<Vec<_>, _>>()
                .unwrap()
        };
        assert!(records.len() >= 2);
        db.execute("UPDATE chunks SET vector=NULL WHERE id=?", [records[0].0])
            .unwrap();
        index(&root, &path, &resources, &engine, &cancel, |_| {}).unwrap();
        let restored = {
            let mut q = db
                .prepare("SELECT id,vector FROM chunks ORDER BY id")
                .unwrap();
            q.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?)))
                .unwrap()
                .collect::<std::result::Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(records, restored);
        db.execute(
            "UPDATE chunks SET model='embeddinggemma-2-Q8_0',vector='[1]'",
            [],
        )
        .unwrap();
        let report = index(&root, &path, &resources, &engine, &cancel, |_| {}).unwrap();
        assert_eq!(report["errors"], serde_json::json!([]));
        let migrated: i64 = db
            .query_row(
                "SELECT count(*) FROM chunks WHERE model=? AND length(vector)>10",
                [crate::inference::MODEL_ID],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(migrated, records.len() as i64);
    }
    #[test]
    fn local_index_retrieval_and_scope() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        crate::project::create(&project, "Sources").unwrap();
        let fixture = temp.path().join("vault");
        fs::create_dir_all(fixture.join("Personnes")).unwrap();
        fs::create_dir_all(fixture.join("Lieux")).unwrap();
        fs::write(
            fixture.join("Personnes/Pierre Plantard.md"),
            "---\ntype: Personne\naliases: [Pierre]\n---\n# Pierre Plantard\nUne personne.\n",
        )
        .unwrap();
        fs::write(
            fixture.join("Personnes/Pierre Perret.md"),
            "---\ntype: Personne\naliases: [Pierre]\n---\n# Pierre Perret\nUne autre personne.\n",
        )
        .unwrap();
        fs::write(
            fixture.join("Lieux/Ville.md"),
            "---\ntype: Lieu\n---\n# Ville\nLes souvenirs et les villes.\n",
        )
        .unwrap();
        connect(&project, temp.path(), VaultFolder::selected(&fixture).unwrap(), None).unwrap();
        let indexpath = temp.path().join("index.sqlite");
        let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let engine = Mutex::new(Engine::default());
        let report = index(
            &project,
            &indexpath,
            &resources,
            &engine,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        assert_eq!(report["errors"], serde_json::json!([]), "{report}");
        assert_eq!(report["semantic"], true);
        let suggestions = crate::retrieval::suggest(
            &project, &indexpath, &resources, &engine, "Pierre ", 0, false,
        )
        .unwrap();
        assert!(suggestions.is_empty());
        let suggestions = crate::retrieval::suggest(
            &project,
            &indexpath,
            &resources,
            &engine,
            "Pierre Plantard est né.",
            0,
            true,
        )
        .unwrap();
        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].title, "Pierre Plantard");
        let hits = crate::retrieval::search(
            &project,
            &indexpath,
            &resources,
            &engine,
            "les souvenirs et les villes",
            true,
        )
        .unwrap();
        assert!(!hits.is_empty());
        let v = list(&project, &indexpath).unwrap();
        set_scope(&project, &v[0].id, vec!["Lieux".into()]).unwrap();
        assert!(all(&indexpath, &list(&project, &indexpath).unwrap())
            .unwrap()
            .iter()
            .all(|s| s.path.starts_with("Lieux/")));
    }
}
