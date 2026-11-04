//! Incremental lexical publication, followed by resumable idle embeddings.
use super::*;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    io::Read,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    sync::atomic::Ordering,
};
const MAX_FILE: u64 = 100_000_000;
const RECONCILE_SECONDS: i64 = 3600;

fn signature(m: &fs::Metadata) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}",
        m.dev(),
        m.ino(),
        m.len(),
        m.mtime(),
        m.mtime_nsec(),
        m.ctime(),
        m.ctime_nsec()
    )
}
fn fingerprint(file: &mut fs::File, cancel: &AtomicBool) -> Result<String> {
    let mut hash = Sha256::new();
    let mut count = 0u64;
    let mut buf = [0u8; 65536];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Indexation suspendue.".into());
        }
        let n = file.read(&mut buf).app()?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > MAX_FILE {
            return Err("Document trop volumineux (100 Mo maximum)".into());
        }
        hash.update(&buf[..n]);
    }
    Ok(project::hash(&format!("{count}:{:x}", hash.finalize())))
}
fn publish(c: &mut Connection, source: &Source, chunks: &[(Option<i64>, String)]) -> Result<()> {
    let tx = c.transaction().app()?;
    tx.execute("DELETE FROM search WHERE source=?", [&source.id])
        .app()?;
    tx.execute("DELETE FROM chunks WHERE source=?", [&source.id])
        .app()?;
    tx.execute(
        "INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?)",
        params![
            source.id,
            source.vault_id,
            source.path,
            source.fingerprint,
            serde_json::to_string(source).app()?
        ],
    )
    .app()?;
    for (page, text) in chunks {
        tx.execute(
            "INSERT INTO chunks(source,page,text) VALUES(?,?,?)",
            params![source.id, page, text],
        )
        .app()?;
        tx.execute(
            "INSERT INTO search(text,source,page) VALUES(?,?,?)",
            params![text, source.id, page],
        )
        .app()?;
    }
    tx.commit().app()
}
#[allow(clippy::too_many_arguments)]
pub(super) fn run(
    root: &Path,
    index: &Path,
    resources: &Path,
    engine: &Mutex<Engine>,
    cancel: &AtomicBool,
    activity: Option<&crate::memory_engine::Activity>,
    progress: impl Fn(serde_json::Value),
) -> Result<serde_json::Value> {
    let vaults = list(root, index)?;
    let mut c = index_db(index)?;
    let mut indexed = 0;
    let mut errors = vec![];
    let mut semantic = true;
    let mut deferred = false;
    let mut forwards = 0;
    for vault in vaults {
        if !vault.available {
            errors.push(format!("{} : dossier introuvable", vault.name));
            continue;
        }
        let mut paths = vec![];
        let mut complete = true;
        for entry in walkdir::WalkDir::new(&vault.path)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                let templates = e.depth() == 1
                    && e.file_type().is_dir()
                    && ["template", "templates", "modele", "modeles"]
                        .contains(&parse::normalize(&name).as_str());
                (e.depth() == 0 || !name.starts_with('.')) && !templates
            })
        {
            if cancel.load(Ordering::Relaxed) {
                return Ok(serde_json::json!({"cancelled":true,"indexed":indexed,"errors":errors}));
            }
            match entry {
                Ok(e) if e.file_type().is_file() => {
                    if e.path().extension().is_some_and(|x| {
                        ["md", "pdf", "png", "jpg", "jpeg", "webp"]
                            .contains(&x.to_string_lossy().to_lowercase().as_str())
                    }) {
                        paths.push(e.into_path());
                    }
                }
                Ok(_) => (),
                Err(e) => {
                    complete = false;
                    errors.push(e.to_string());
                }
            }
        }
        let total = paths.len();
        let mut seen = HashSet::new();
        for path in paths {
            if cancel.load(Ordering::Relaxed) {
                return Ok(serde_json::json!({"cancelled":true,"indexed":indexed,"errors":errors}));
            }
            let rel = path
                .strip_prefix(&vault.path)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            let id = project::hash(&format!("{}/{rel}", vault.id));
            seen.insert(id.clone());
            let result = (|| -> Result<()> {
                let meta = fs::symlink_metadata(&path).app()?;
                if !meta.is_file() || meta.len() > MAX_FILE {
                    return Err("Document inaccessible ou trop volumineux".into());
                }
                let sig = signature(&meta);
                let now = chrono::Utc::now().timestamp();
                let previous: Option<(String, i64)> = c
                    .query_row(
                        "SELECT signature,verified FROM source_file_state WHERE source=?",
                        [&id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()
                    .app()?;
                let unchanged = previous
                    .is_some_and(|(old, t)| old == sig && now >= t && now - t < RECONCILE_SECONDS);
                if !unchanged {
                    // Refuse a replacement symlink at open, and verify metadata again
                    // before publishing the parsed snapshot.
                    let mut file = fs::OpenOptions::new()
                        .read(true)
                        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
                        .open(&path)
                        .app()?;
                    if !file.metadata().app()?.is_file() {
                        return Err("Document non régulier".into());
                    }
                    let hash = fingerprint(&mut file, cancel)?;
                    let old: Option<String> = c
                        .query_row("SELECT hash FROM sources WHERE id=?", [&id], |r| r.get(0))
                        .optional()
                        .app()?;
                    if old.as_deref() != Some(&hash) {
                        let ext = path
                            .extension()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_lowercase();
                        let mut pages = vec![];
                        let mut source = if ext == "md" {
                            use std::io::{Seek, SeekFrom};
                            file.seek(SeekFrom::Start(0)).app()?;
                            let mut bytes = vec![];
                            (&mut file)
                                .take(MAX_FILE + 1)
                                .read_to_end(&mut bytes)
                                .app()?;
                            if bytes.len() as u64 > MAX_FILE {
                                return Err("Document trop volumineux".into());
                            }
                            parse::parse(
                                &vault.id,
                                &rel,
                                &String::from_utf8_lossy(&bytes).replace("\r\n", "\n"),
                            )
                        } else if ext == "pdf" {
                            pages = super::pdf::extract(
                                &resources.join("engine/pdf-text"),
                                &path,
                                cancel,
                            )?;
                            let mut s = parse::parse(&vault.id, &rel, &pages.join("\n\n"));
                            s.kind = "PDF".into();
                            s
                        } else {
                            let mut s = parse::parse(&vault.id, &rel, "");
                            s.kind = "Image".into();
                            s
                        };
                        source.fingerprint = hash;
                        let chunks = if ext == "pdf" {
                            pages
                                .iter()
                                .enumerate()
                                .flat_map(|(i, p)| {
                                    parse::chunks(p)
                                        .into_iter()
                                        .map(move |t| (Some(i as i64 + 1), t))
                                })
                                .collect()
                        } else {
                            parse::chunks(&source.text)
                                .into_iter()
                                .map(|t| (None, t))
                                .collect::<Vec<_>>()
                        };
                        if signature(&fs::symlink_metadata(&path).app()?) != sig {
                            return Err(
                                "Document modifié pendant la lecture ; reprise au prochain passage"
                                    .into(),
                            );
                        }
                        publish(&mut c, &source, &chunks)?;
                        indexed += 1;
                    }
                    if signature(&fs::symlink_metadata(&path).app()?) != sig {
                        return Err("Document modifié pendant la lecture".into());
                    }
                    c.execute("INSERT INTO source_file_state VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET signature=excluded.signature,verified=excluded.verified",params![id,sig,now]).app()?;
                }
                Ok(())
            })();
            if let Err(e) = result {
                errors.push(format!("{rel} : {e}"));
            }
            progress(
                serde_json::json!({"done":seen.len(),"total":total,"file":rel,"semantic":semantic}),
            );
        }
        // A failed directory traversal is never evidence that its files vanished.
        if complete && !cancel.load(Ordering::Relaxed) {
            let ids = {
                let mut q = c.prepare("SELECT id FROM sources WHERE vault=?").app()?;
                let rows = q.query_map([&vault.id], |r| r.get::<_, String>(0)).app()?;
                rows.collect::<std::result::Result<Vec<_>, _>>().app()?
            };
            let tx = c.transaction().app()?;
            for id in ids.into_iter().filter(|id| !seen.contains(id)) {
                for table in ["search", "chunks", "source_file_state"] {
                    tx.execute(&format!("DELETE FROM {table} WHERE source=?"), [&id])
                        .app()?;
                }
                tx.execute("DELETE FROM sources WHERE id=?", [&id]).app()?;
            }
            tx.commit().app()?;
        }
        // All lexical data is durable before any model starts. Pending rows are
        // the resume queue; stale vectors cannot be published after a reindex.
        if semantic {
            let pending = {
                let mut q=c.prepare("SELECT ch.id,ch.source,ch.text,s.hash,s.payload FROM chunks ch JOIN sources s ON s.id=ch.source WHERE s.vault=? AND (ch.vector IS NULL OR ch.model IS NULL OR ch.model<>?) LIMIT 128").app()?;
                let rows = q
                    .query_map(params![vault.id, crate::inference::MODEL_ID], |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, String>(3)?,
                            r.get::<_, String>(4)?,
                        ))
                    })
                    .app()?;
                rows.collect::<std::result::Result<Vec<_>, _>>().app()?
            };
            for (chunk, source, text, hash, payload) in pending {
                let blocked = || {
                    cancel.load(Ordering::Relaxed)
                        || activity.is_some_and(|a| a.blocked())
                        || crate::memory_engine::critical_memory_pressure()
                };
                if blocked() || forwards >= 128 {
                    deferred = true;
                    break;
                }
                let Ok(mut model) = engine.try_lock() else {
                    deferred = true;
                    break;
                };
                let _inference = activity.map(|a| a.inference());
                forwards += 1;
                let title = serde_json::from_str::<Source>(&payload)
                    .ok()
                    .map(|s| s.title);
                match model.embed_titled_idle(resources, &text, title.as_deref(), false, blocked) {
                    Ok(Some(vector)) => {
                        c.execute("UPDATE chunks SET vector=?,model=? WHERE id=? AND source=? AND text=? AND EXISTS(SELECT 1 FROM sources WHERE id=? AND hash=?)",params![crate::vectors::encode(&vector),crate::inference::MODEL_ID,chunk,source,text,source,hash]).app()?;
                    }
                    Ok(None) => {
                        deferred = true;
                        break;
                    }
                    Err(e) => {
                        errors.push(e);
                        semantic = false;
                        break;
                    }
                }
            }
        }
    }
    Ok(
        serde_json::json!({"indexed":indexed,"errors":errors,"semantic":semantic,"deferred":deferred,"cancelled":cancel.load(Ordering::Relaxed)}),
    )
}
use rusqlite::OptionalExtension;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lexical_data_survives_unavailable_model_and_unchanged_files_skip_republication() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        let vault = d.path().join("vault");
        fs::create_dir(&vault).unwrap();
        project::create(&root, "A").unwrap();
        super::super::connect(&root, &vault).unwrap();
        fs::write(vault.join("A.md"), "Texte immédiatement disponible").unwrap();
        let index = d.path().join("index.db");
        let activity = crate::memory_engine::Activity::default();
        activity.writing(true);
        let run_scan = || {
            run(
                &root,
                &index,
                d.path(),
                &Mutex::new(Engine::default()),
                &AtomicBool::new(false),
                Some(&activity),
                |_| {},
            )
            .unwrap()
        };
        assert_eq!(run_scan()["indexed"], 1);
        let c = index_db(&index).unwrap();
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM search WHERE search MATCH 'immédiatement'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert_eq!(run_scan()["indexed"], 0);
        fs::write(vault.join("A.md"), "Texte changé").unwrap();
        assert_eq!(run_scan()["indexed"], 1);
        fs::rename(vault.join("A.md"), vault.join("B.md")).unwrap();
        assert_eq!(run_scan()["indexed"], 1);
        assert_eq!(
            c.query_row("SELECT count(*) FROM sources", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
