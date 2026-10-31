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
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
pub fn index_db(path: &Path) -> Result<Connection> {
    let c = Connection::open(path).app()?;
    c.busy_timeout(std::time::Duration::from_secs(10)).app()?;
    c.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,vault TEXT,path TEXT,hash TEXT,payload TEXT);CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY,source TEXT,page INTEGER,text TEXT,vector TEXT,model TEXT);CREATE INDEX IF NOT EXISTS chunk_source ON chunks(source);CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(text,source UNINDEXED,page UNINDEXED);").app()?;
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
pub fn all(index: &Path, vaults: &[Vault]) -> Result<Vec<Source>> {
    let c = index_db(index)?;
    let mut q = c.prepare("SELECT payload FROM sources").app()?;
    let rows = q.query_map([], |r| r.get::<_, String>(0)).app()?;
    let mut out = vec![];
    for r in rows {
        let s: Source = serde_json::from_str(&r.app()?).app()?;
        if allowed(&s, vaults) {
            out.push(s)
        }
    }
    Ok(out)
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
pub fn index(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    cancel: &AtomicBool,
    progress: impl Fn(serde_json::Value),
) -> Result<serde_json::Value> {
    let vaults = list(root, index)?;
    let mut total = 0;
    let mut errors = vec![];
    let mut indexed = 0;
    let mut semantic = true;
    for v in &vaults {
        if !v.available {
            errors.push(format!("{} : dossier introuvable", v.name));
            continue;
        }
        let paths: Vec<_> = walkdir::WalkDir::new(&v.path)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                let template_folder = e.depth() == 1 && e.file_type().is_dir()
                    && ["template", "templates", "modele", "modeles"].contains(&parse::normalize(&name).as_str());
                (e.depth() == 0 || !name.starts_with('.')) && !template_folder
            })
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.into_path())
            .filter(|p| {
                p.extension().is_some_and(|x| {
                    ["md", "pdf", "png", "jpg", "jpeg", "webp"]
                        .contains(&x.to_string_lossy().to_lowercase().as_str())
                })
            })
            .collect();
        total += paths.len();
        let mut seen = HashSet::new();
        for path in paths {
            if cancel.load(Ordering::Relaxed) {
                return Ok(serde_json::json!({"cancelled":true,"indexed":indexed,"errors":errors}));
            }
            let rel = path
                .strip_prefix(&v.path)
                .unwrap()
                .to_string_lossy()
                .to_string();
            let id = project::hash(&format!("{}/{rel}", v.id));
            seen.insert(id.clone());
            let result = (|| -> Result<()> {
                let bytes = fs::read(&path).app()?;
                if bytes.len() > 100_000_000 {
                    return Err("Document trop volumineux (100 Mo maximum)".into());
                }
                let hash = project::hash(&format!(
                    "{}:{}",
                    bytes.len(),
                    format_args!("{:x}", <sha2::Sha256 as sha2::Digest>::digest(&bytes))
                ));
                let mut c = index_db(index)?;
                let old: String = c
                    .query_row("SELECT hash FROM sources WHERE id=?", [&id], |r| r.get(0))
                    .unwrap_or_default();
                let missing: i64 = c
                    .query_row(
                        "SELECT count(*) FROM chunks WHERE source=? AND (vector IS NULL OR model IS NULL OR model<>?)",
                        params![id, crate::inference::MODEL_ID],
                        |r| r.get(0),
                    )
                    .app()?;
                if old == hash {
                    if missing == 0 || !semantic { return Ok(()); }
                    let pending = {
                        let mut q = c.prepare("SELECT id,text FROM chunks WHERE source=? AND (vector IS NULL OR model IS NULL OR model<>?)").app()?;
                        let rows = q.query_map(params![id, crate::inference::MODEL_ID], |r| Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).app()?;
                        rows.collect::<std::result::Result<Vec<_>,_>>().app()?
                    };
                    for (chunk_id, text) in pending {
                        if cancel.load(Ordering::Relaxed) { return Err("Indexation suspendue.".into()); }
                        match engine.lock().map_err(|e| e.to_string())?.embed(resources, &text, false) {
                            Ok(vector) => { c.execute("UPDATE chunks SET vector=?,model=? WHERE id=? AND source=? AND (vector IS NULL OR model IS NULL OR model<>?)", params![serde_json::to_string(&vector).app()?,crate::inference::MODEL_ID,chunk_id,id,crate::inference::MODEL_ID]).app()?; }
                            Err(e) => { errors.push(format!("{rel} : {e}")); semantic=false; break; }
                        }
                    }
                    return Ok(());
                }
                let ext = path.extension().unwrap().to_string_lossy().to_lowercase();
                let mut pages = vec![];
                let mut s = if ext == "md" {
                    parse::parse(
                        &v.id,
                        &rel,
                        &String::from_utf8_lossy(&bytes).replace("\r\n", "\n"),
                    )
                } else if ext == "pdf" {
                    let output = std::process::Command::new(resources.join("engine/pdf-text"))
                        .arg(&path)
                        .output()
                        .app()?;
                    if !output.status.success() {
                        return Err("PDF illisible ou protégé".into());
                    }
                    pages = serde_json::from_slice::<Vec<String>>(&output.stdout).app()?;
                    parse::parse(&v.id, &rel, &pages.join("\n\n"))
                } else {
                    let mut s = parse::parse(&v.id, &rel, "");
                    s.kind = "Image".into();
                    s
                };
                s.fingerprint = hash.clone();
                if ext == "pdf" {
                    s.kind = "PDF".into()
                }
                let mut records = vec![];
                let inputs = if ext == "pdf" {
                    pages
                        .iter()
                        .enumerate()
                        .flat_map(|(i, p)| {
                            parse::chunks(p)
                                .into_iter()
                                .map(move |t| (Some(i as i64 + 1), t))
                        })
                        .collect::<Vec<_>>()
                } else {
                    parse::chunks(&s.text)
                        .into_iter()
                        .map(|t| (None, t))
                        .collect()
                };
                for (page, text) in inputs {
                    if cancel.load(Ordering::Relaxed) {
                        return Err("Indexation suspendue.".into());
                    }
                    let vec = if semantic {
                        match engine
                            .lock()
                            .map_err(|e| e.to_string())?
                            .embed(resources, &text, false)
                        {
                            Ok(v) => Some(serde_json::to_string(&v).app()?),
                            Err(e) => {
                                errors.push(format!("{rel} : {e}"));
                                semantic = false;
                                None
                            }
                        }
                    } else {
                        None
                    };
                    records.push((page, text, vec));
                }
                let tx = c.transaction().app()?;
                tx.execute("DELETE FROM search WHERE source=?", [&id])
                    .app()?;
                tx.execute("DELETE FROM chunks WHERE source=?", [&id])
                    .app()?;
                tx.execute(
                    "INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?)",
                    params![s.id, v.id, rel, hash, serde_json::to_string(&s).app()?],
                )
                .app()?;
                for (page, text, vec) in records {
                    tx.execute(
                        "INSERT INTO chunks(source,page,text,vector,model) VALUES(?,?,?,?,?)",
                        params![id, page, text, vec, crate::inference::MODEL_ID],
                    )
                    .app()?;
                    tx.execute(
                        "INSERT INTO search(text,source,page) VALUES(?,?,?)",
                        params![text, id, page],
                    )
                    .app()?;
                }
                tx.commit().app()?;
                Ok(())
            })();
            if cancel.load(Ordering::Relaxed) {
                return Ok(serde_json::json!({"cancelled":true,"indexed":indexed,"errors":errors}));
            }
            if let Err(e) = result {
                errors.push(format!("{rel} : {e}"))
            }
            indexed += 1;
            progress(
                serde_json::json!({"done":indexed,"total":total,"file":rel,"semantic":semantic}),
            );
        }
        let mut c = index_db(index)?;
        let ids = {
            let mut q = c.prepare("SELECT id FROM sources WHERE vault=?").app()?;
            let r = q.query_map([&v.id], |r| r.get::<_, String>(0)).app()?;
            r.collect::<std::result::Result<Vec<_>, _>>().app()?
        };
        let tx = c.transaction().app()?;
        for id in ids {
            if !seen.contains(&id) {
                tx.execute("DELETE FROM search WHERE source=?", [&id])
                    .app()?;
                tx.execute("DELETE FROM chunks WHERE source=?", [&id])
                    .app()?;
                tx.execute("DELETE FROM sources WHERE id=?", [&id]).app()?;
            }
        }
        tx.commit().app()?;
    }
    Ok(serde_json::json!({"indexed":indexed,"errors":errors,"semantic":semantic}))
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
            q.query_map([], |r| Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).unwrap().collect::<std::result::Result<Vec<_>,_>>().unwrap()
        };
        assert!(records.len() >= 2);
        db.execute("UPDATE chunks SET vector=NULL WHERE id=?", [records[0].0]).unwrap();
        index(&root,&path,&resources,&engine,&cancel, |_| {}).unwrap();
        let restored = {
            let mut q = db.prepare("SELECT id,vector FROM chunks ORDER BY id").unwrap();
            q.query_map([], |r| Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).unwrap().collect::<std::result::Result<Vec<_>,_>>().unwrap()
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
