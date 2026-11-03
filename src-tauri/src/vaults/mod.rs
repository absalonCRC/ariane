mod classification;
pub use classification::{classification_types, example_type, predicted_type, apply_note_type};
mod notes;
pub use notes::{create_quick_note, suggest_notes, note_references};
mod browse;
mod pdf;
mod scan;
pub use browse::browse;
pub mod parse;
mod owned;
pub use owned::{create_entity, create_owned, create_project};
use crate::inference::Engine;
use crate::{
    error::{AppResult, Result},
    model::*,
    project,
};
use rusqlite::{params, Connection};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::AtomicBool,
        Mutex,
    },
};
pub fn index_db(path: &Path) -> Result<Connection> {
    let c = Connection::open(path).app()?;
    c.busy_timeout(std::time::Duration::from_secs(10)).app()?;
    c.execute_batch("PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,vault TEXT,path TEXT,hash TEXT,payload TEXT);
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
        let mut columns = c.prepare("PRAGMA table_info(source_file_state)").app()?;
        let mut rows = columns.query_map([], |r| r.get::<_, String>(1)).app()?;
        rows.any(|row| row.is_ok_and(|name| name == "verified"))
    };
    if !has_verified { c.execute("ALTER TABLE source_file_state ADD COLUMN verified INTEGER NOT NULL DEFAULT 0", []).app()?; }
    crate::vectors::migrate_batch(&c)?;
    Ok(c)
}
pub fn list(root: &Path, index: &Path) -> Result<Vec<Vault>> {
    let c = project::database(root)?;
    let idx = index_db(index)?;
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
        let count = idx
            .query_row("SELECT count(*) FROM sources WHERE vault=?", [&id], |r| {
                r.get(0)
            })
            .app()?;
        out.push(Vault {
            id,
            name: Path::new(&path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            available: Path::new(&path).is_dir(),
            owned: owned::is_owned(root, Path::new(&path)),
            path,
            scope: serde_json::from_str(&scope).unwrap_or_default(),
            count,
        })
    }
    Ok(out)
}
pub fn connect(root: &Path, path: &Path) -> Result<()> {
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
        v.id == s.vault_id
            && (v.scope.is_empty()
                || v.scope
                    .iter()
                    .any(|scope| Path::new(&s.path).starts_with(scope)))
    })
}
/// Scope predicate uses only indexed metadata; foreign payloads are never parsed.
pub(crate) const SCOPE_SQL: &str = "EXISTS(SELECT 1 FROM json_each(?1) v WHERE json_extract(v.value,'$.id')=s.vault AND (json_array_length(v.value,'$.scope')=0 OR EXISTS(SELECT 1 FROM json_each(v.value,'$.scope') f WHERE s.path=f.value OR substr(s.path,1,length(f.value)+1)=f.value||'/')))";
pub(crate) fn scope_json(vaults: &[Vault]) -> Result<String> {
    serde_json::to_string(&vaults.iter().map(|v| serde_json::json!({"id":v.id,"scope":v.scope})).collect::<Vec<_>>()).app()
}
pub fn all(index: &Path, vaults: &[Vault]) -> Result<Vec<Source>> {
    let c=index_db(index)?;
    let mut q=c.prepare(&format!("SELECT payload FROM sources s WHERE {SCOPE_SQL}")).app()?;
    let rows=q.query_map([scope_json(vaults)?],|r|r.get::<_,String>(0)).app()?;
    rows.map(|r|serde_json::from_str(&r.app()?).app()).collect()
}

pub fn source(index: &Path, id: &str, vaults: &[Vault]) -> Result<Source> {
    let c = index_db(index)?;
    let payload: String = c
        .query_row("SELECT payload FROM sources WHERE id=?", [id], |r| r.get(0))
        .app()?;
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
#[cfg(any(test, feature = "performance-harness"))]
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
    scan::run(root, index, resources, engine, cancel, Some(activity), progress)
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resumes_only_missing_vectors_for_unchanged_source() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        crate::project::create(&root, "Test").unwrap();
        let vault = temp.path().join("vault");
        fs::create_dir(&vault).unwrap();
        fs::write(vault.join("note.md"), format!("{}\n\n{}", "Première partie. ".repeat(120), "Autre partie. ".repeat(120))).unwrap();
        connect(&root, &vault).unwrap();
        let path = temp.path().join("index.sqlite");
        let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let engine = Mutex::new(Engine::default());
        let cancel = AtomicBool::new(false);
        index(&root,&path,&resources,&engine,&cancel, |_| {}).unwrap();
        let db = index_db(&path).unwrap();
        let records = {
            let mut q = db.prepare("SELECT id,vector FROM chunks ORDER BY id").unwrap();
            q.query_map([], |r| Ok((r.get::<_,i64>(0)?,r.get::<_,Vec<u8>>(1)?))).unwrap().collect::<std::result::Result<Vec<_>,_>>().unwrap()
        };
        assert!(records.len() >= 2);
        db.execute("UPDATE chunks SET vector=NULL WHERE id=?", [records[0].0]).unwrap();
        index(&root,&path,&resources,&engine,&cancel, |_| {}).unwrap();
        let restored = {
            let mut q = db.prepare("SELECT id,vector FROM chunks ORDER BY id").unwrap();
            q.query_map([], |r| Ok((r.get::<_,i64>(0)?,r.get::<_,Vec<u8>>(1)?))).unwrap().collect::<std::result::Result<Vec<_>,_>>().unwrap()
        };
        assert_eq!(records,restored);
        db.execute("UPDATE chunks SET model='embeddinggemma-2-Q8_0',vector='[1]'", []).unwrap();
        let report = index(&root,&path,&resources,&engine,&cancel, |_| {}).unwrap();
        assert_eq!(report["errors"], serde_json::json!([]));
        let migrated: i64 = db.query_row("SELECT count(*) FROM chunks WHERE model=? AND length(vector)>10", [crate::inference::MODEL_ID], |r|r.get(0)).unwrap();
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
        fs::write(fixture.join("Personnes/Pierre Plantard.md"), "---\ntype: Personne\naliases: [Pierre]\n---\n# Pierre Plantard\nUne personne.\n").unwrap();
        fs::write(fixture.join("Personnes/Pierre Perret.md"), "---\ntype: Personne\naliases: [Pierre]\n---\n# Pierre Perret\nUne autre personne.\n").unwrap();
        fs::write(fixture.join("Lieux/Ville.md"), "---\ntype: Lieu\n---\n# Ville\nLes souvenirs et les villes.\n").unwrap();
        connect(&project, &fixture).unwrap();
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
