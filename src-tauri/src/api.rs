use crate::{
    error::{AppResult, Result},
    enrichment, export, history, memory, memory_evidence,
    memory_engine::{Activity, EntityEngine},
    inference::Engine,
    model::*,
    project, retrieval, revision::RevisionEngine, vaults, voice,
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
pub struct AppState {
    pub data: PathBuf,
    pub resources: PathBuf,
    pub current: Mutex<Option<PathBuf>>,
    pub engine: Mutex<Engine>,
    pub revision: Mutex<RevisionEngine>,
    pub voice: Mutex<voice::VoiceEngine>,
    pub enriching: Mutex<()>,
    pub memory_activity: Activity,
    pub memory_job: Mutex<()>,
    pub entity_engine: Mutex<EntityEngine>,
    pub indexing: AtomicBool,
    pub cancel: AtomicBool,
    pub paused: AtomicBool,
    pub export_cancel: AtomicBool,
    pub exporting: AtomicBool,
    pub exit_approved: AtomicBool,
}
#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Request {
    Bootstrap,
    AppLanguage { value: String },
    Annotations { project_path: String },
    AddAnnotation { project_path: String, section: String, revision: i64, from: usize, to: usize, note: String },
    UpdateAnnotation { project_path: String, id: String, revision: i64, note: String, done: bool },
    ImportPreview { source: String },
    ImportIntoProject { source: String, project_path: String },
    ManuscriptOperation { project_path: String, operation: project::manuscript::Operation },
    Projects,
    ProjectCatalog { path: String, pinned: bool, archived: bool },
    LibraryOperation { operation: project::library::Operation },
    BrowseSources { query: String, vault: Option<String>, kind: Option<String>, folder: Option<String>, offset: usize },
    Create {
        path: String,
        name: String,
        vault_path: Option<String>,
        initial_title: Option<String>,
    },
    Open {
        path: String,
    },
    Save {
        patches: Vec<TextPatch>,
    },
    Add {
        parent: Option<String>,
        title: String,
        kind: String,
        role: Option<String>,
    },
    Update {
        section: Section,
    },
    Reorder {
        ids: Vec<String>,
        id: String,
        parent: Option<String>,
    },
    Settings {
        value: serde_json::Value,
    },
    ResolveExternal {
        id: String,
        keep_local: bool,
        pending: Option<String>,
    },
    Vaults,
    ConnectVault {
        path: String,
    },
    CreateOwnedVault,
    CreateVaultEntity {
        kind: String,
        name: String,
        description: String,
    },
    VaultScope {
        id: String,
        scope: Vec<String>,
    },
    RemoveVault {
        id: String,
    },
    Index,
    Scan,
    CancelIndex,
    Suggest {
        text: String,
        depth: u8,
        allow_end: bool,
    },
    Search {
        query: String,
    },
    Source {
        id: String,
    },
    SourceFile {
        id: String,
    },
    Versions,
    Version {
        id: String,
    },
    Capture {
        name: String,
        scope: Option<String>,
    },
    Restore {
        id: String,
    },
    Export {
        path: String,
        format: String,
        scope: Option<String>,
    },
    Cite {
        id: String,
        payload: serde_json::Value,
    },
    Enrich { project_path: String },
    IgnoreEnrichment { project_path: String, source: String, evidence: Option<String> },
    MemoryActivity { active: bool },
    MemoryStatus,
    MemoryQueue { project_path: String, section: String, node: Option<String>, revision: i64, depth: u8, #[serde(default)] semantic: bool },
    MemoryEntities { project_path: String, section: String, node: Option<String>, revision: i64 },
    MemoryContext { project_path: String, section: String, node: Option<String>, depth: u8 },
    MemoryEntity { project_path: String, id: String },
    MemoryList { project_path: String },
    MemoryDismiss { project_path: String, id: String, hash: String },
    MemorySession { project_path: String, value: Option<serde_json::Value> },
    MemorySource { id: String, fingerprint: Option<String> },
    EngineStatus,
    VoiceStatus,
    RevisionStatus,
    RevisionCheck {
        text: String,
        language: String,
    },
    VoiceTranscribe {
        audio: String,
        language: String,
        #[serde(default)]
        live: bool,
    },
    Quit,
    CancelExport,
    Associate {
        section: String,
        id: String,
        payload: serde_json::Value,
    },
    Links {
        section: String,
    },
}
fn json<T: Serialize>(value: T) -> Result<serde_json::Value> {
    serde_json::to_value(value).app()
}
fn root(state: &AppState) -> Result<PathBuf> {
    state
        .current
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Ouvrez un projet pour continuer.".into())
}
fn activate(state: &AppState, path: &Path) -> Result<Project> {
    if !path.join("ariane.sqlite").is_file() {
        return Err("Ce dossier ne contient pas de projet Ariane.".into());
    }
    let path = &path.canonicalize().app()?;
    let p = project::load(path)?;
    project::catalog::remember(&state.data, path, &p.name)?;
    let mut current = state.current.lock().map_err(|e| e.to_string())?;
    let mut session = tempfile::NamedTempFile::new_in(&state.data).app()?;
    use std::io::Write;
    session.write_all(json!({"path":path}).to_string().as_bytes()).app()?;
    session.as_file().sync_all().app()?;
    session.persist(state.data.join("session.json")).map_err(|e| e.to_string())?;
    state.memory_activity.writing(true);
    state.memory_activity.cancel_entities();
    *current = Some(path.to_owned());
    Ok(p)
}
use serde_json::json;
pub fn handle(
    app: &tauri::AppHandle,
    state: &AppState,
    request: Request,
) -> Result<serde_json::Value> {
    let index = state.data.join("sources.sqlite");
    match request {
        Request::AppLanguage { value } => {
            if !["fr", "en", "es"].contains(&value.as_str()) { return Err("Unsupported application language".into()); }
            app.set_menu(crate::platform::menu_for_language(app, &value).app()?).app()?;
            Ok(json!(true))
        }
        Request::ImportPreview { source } => json(crate::import::preview(&state.resources, Path::new(&source))?),
        Request::Projects => json(project::catalog::list(&state.data)?),
        Request::ProjectCatalog { path, pinned, archived } => json(project::catalog::update(&state.data, &path, pinned, archived)?),
        Request::MemoryActivity { active } => { state.memory_activity.writing(active); Ok(json!(true)) }
        Request::MemoryStatus => Ok(json!({"available":Engine::available(&state.resources), "entitiesAvailable":EntityEngine::available(&state.data, &state.resources)})),
        Request::Bootstrap => {
            let path = state.data.join("session.json");
            if let Ok(text) = std::fs::read_to_string(path) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(path) = v["path"].as_str() {
                        let path = Path::new(path).canonicalize().app()?;
                        let project = project::load(&path)?;
                        project::catalog::remember(&state.data, &path, &project.name)?;
                        *state.current.lock().map_err(|e| e.to_string())? = Some(path.to_owned());
                        return json(project);
                    }
                }
            }
            Ok(serde_json::Value::Null)
        }
        Request::Create { path, name, vault_path, initial_title } => {
            let root = Path::new(&path);
            vaults::create_project(root, &name, vault_path.as_deref().map(Path::new))?;
            if let Some(title) = initial_title.filter(|title| !title.trim().is_empty()) {
                if let Some(mut first) = project::load(root)?.sections.into_iter().find(|s| s.kind == "scene") {
                    first.title = title;
                    project::update(root, &first)?;
                }
            }
            json(activate(state, root)?)
        }
        Request::Open { path } => json(activate(state, Path::new(&path))?),
        Request::EngineStatus => Ok(
            json!({"available":state.resources.join("models/embeddinggemma-300M-Q8_0.gguf").exists()&&state.resources.join("engine/llama-server").exists(),"model":"EmbeddingGemma 300M · Q8","local":true}),
        ),
        Request::VoiceStatus => {
            Ok(json!({"available": voice::available(&state.data, &state.resources)}))
        }
        Request::RevisionStatus => {
            let root = state.data.join("revision");
            Ok(json!({"available": root.join("java/Contents/Home/bin/java").is_file()
                && root.join("languagetool/languagetool-server.jar").is_file()
                && root.join("salamandra-q8.gguf").is_file()
                && state.resources.join("engine/llama-server").is_file()}))
        }
        Request::RevisionCheck { text, language } => {
            let _priority = state.memory_activity.foreground();
            let mut engine = state.revision.lock().map_err(|e| e.to_string())?;
            json(engine.check(&state.data, &state.resources, &text, &language)?)
        }
        Request::VoiceTranscribe { audio, language, live } => {
            let _priority = state.memory_activity.foreground();
            let mut engine = state.voice.lock().map_err(|e|e.to_string())?;
            json(engine.transcribe(&state.data, &state.resources, &audio, &language, live)?)
        },
        Request::CancelExport => {
            state.export_cancel.store(true, Ordering::Relaxed);
            Ok(json!(true))
        }
        Request::Quit => {
            state.exit_approved.store(true, Ordering::SeqCst);
            app.exit(0);
            Ok(json!(true))
        }
        Request::CancelIndex => {
            state.cancel.store(true, Ordering::Relaxed);
            state.paused.store(true, Ordering::Relaxed);
            Ok(json!(true))
        }
        other => {
            let root = root(state)?;
            match other {
                Request::Annotations { project_path } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::annotations::list(&root)?)
                }
                Request::AddAnnotation { project_path, section, revision, from, to, note } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::annotations::create(&root, &section, revision, from, to, &note)?)
                }
                Request::UpdateAnnotation { project_path, id, revision, note, done } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::annotations::update(&root, &id, revision, &note, done)?)
                }
                Request::ManuscriptOperation { project_path, operation } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::manuscript::apply(&root, operation)?)
                }
                Request::ImportIntoProject { source, project_path } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    let report = crate::import::import_into(&root, &state.resources, Path::new(&source))?;
                    Ok(json!({"project":project::load(&root)?,"report":report}))
                }
                Request::LibraryOperation { operation } => json(project::library::apply(&root, operation)?),
                Request::BrowseSources { query, vault, kind, folder, offset } => json(vaults::browse(&root, &index, &query, vault.as_deref(), kind.as_deref(), folder.as_deref(), offset)?),
                Request::MemoryQueue { project_path, section, node, revision, depth, semantic } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    let Ok(_job) = state.memory_job.try_lock() else { return Ok(json!({"busy":true})); };
                    let queue = memory::Queue { root: &root, index: &index, resources: &state.resources,
                        engine: &state.engine, activity: &state.memory_activity,
                        critical_pressure: crate::memory_engine::critical_memory_pressure() };
                    let result = queue.run(&section, node.as_deref(), revision, depth, semantic)?;
                    if root != super::api::root(state)? { return Ok(json!({"stale":true})); }
                    Ok(result)
                }
                Request::MemoryEntities { project_path, section, node, revision } => {
                    if Path::new(&project_path) != root { return Ok(json!({"stale":true})); }
                    if !EntityEngine::available(&state.data, &state.resources) {
                        return Ok(json!({"available":false,"pending":false}));
                    }
                    if crate::memory_engine::critical_memory_pressure() {
                        return Ok(json!({"deferred":true,"pending":true,"retryMs":5000}));
                    }
                    if state.memory_activity.ner_blocked() {
                        return Ok(json!({"deferred":true,"pending":true,"retryMs":500}));
                    }
                    let enabled = || -> Result<bool> {
                        let c = project::database(&root)?;
                        let settings: String = c.query_row("SELECT value FROM meta WHERE key='settings'", [], |r|r.get(0)).app()?;
                        Ok(serde_json::from_str::<serde_json::Value>(&settings).app()?["enrichment"].as_bool() != Some(false)
                            && project::section(&c,&section)?.is_some_and(|s|s.revision == revision))
                    };
                    if !enabled()? { return Ok(json!({"stale":true})); }
                    let Ok(mut worker) = state.entity_engine.try_lock() else { return Ok(json!({"busy":true,"pending":true})); };
                    {
                        let Ok(_job) = state.memory_job.try_lock() else { return Ok(json!({"busy":true,"pending":true})); };
                        memory::sync_idle(&root,Some(&section),||state.memory_activity.is_writing())?;
                    }
                    let mut analyzed = false;
                    let mut deferred = false;
                    if let Some(passage) = memory::pending_entities_at(&root,&section,node.as_deref())? {
                        let output = worker.request(&state.data,&state.resources,&state.memory_activity,&passage.text)?;
                        if root != super::api::root(state)? || !enabled()? { return Ok(json!({"stale":true})); }
                        if let Some(output) = output {
                            analyzed = memory::apply_entities(&root,&passage,&output)?;
                        } else { deferred = true; }
                    }
                    let context = memory::context(&root,&section,node.as_deref(),0)?;
                    Ok(json!({"available":true,"analyzed":analyzed,"deferred":deferred,"retryMs":5000,
                        "pending":memory::pending_entities_at(&root,&section,node.as_deref())?.is_some(),
                        "entities":context["entities"],"anchorHash":context["anchorHash"]}))
                }
                Request::MemoryContext { project_path, section, node, depth } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::context(&root,&section,node.as_deref(),depth)
                }
                Request::MemoryEntity { project_path, id } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::sync(&root)?;
                    memory::entity(&root,&id)
                }
                Request::MemoryList { project_path } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::sync(&root)?;
                    memory::list(&root)
                }
                Request::MemoryDismiss { project_path, id, hash } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::dismiss(&root,&id,&hash)?; Ok(json!(true))
                }
                Request::MemorySession { project_path, value } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::session(&root,value)
                }
                Request::MemorySource { id, fingerprint } => {
                    let available=vaults::list(&root,&index)?;
                    let source=vaults::source(&index,&id,&available)?;
                    if fingerprint.is_some_and(|f| f!=source.fingerprint) || !memory_evidence::fresh(&index,&source,&available) {
                        return Err("Cette source a changé ou n’est plus disponible. Actualisez son index.".into());
                    }
                    Ok(json!(source))
                }

                Request::Enrich { project_path } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
                    enrichment::run(&root, &index)
                }
                Request::IgnoreEnrichment { project_path, source, evidence } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    enrichment::ignore(&root, &index, &source, evidence.as_deref())?;
                    let mut sources = vec![vaults::source(&index, &source, &vaults::list(&root, &index)?)?];
                    enrichment::decorate(&root, &index, &mut sources)?;
                    json(sources.remove(0))
                }
                Request::Save { patches } => {
                    state.memory_activity.writing(true);
                    let ids: Vec<_> = patches.iter().map(|p| p.id.clone()).collect();
                    let saved = project::save(&root, patches)?;
                    Ok(json!(saved
                        .iter()
                        .filter(|s| ids.contains(&s.id))
                        .map(|s| json!({"id":s.id,"revision":s.revision}))
                        .collect::<Vec<_>>()))
                }
                Request::Add { parent, title, kind, role } => json(project::library::apply(&root, project::library::Operation { action: "add".into(), ids: vec![], target: parent, placement: None, role, title: Some(title), kind: Some(kind), included: None })?.sections),
                Request::Update { section } => json(project::update(&root, &section)?),
                Request::Reorder { ids, id, parent } => {
                    json(project::reorder(&root, &ids, &id, parent)?)
                }
                Request::Settings { value } => {
                    let enabled = value["enrichment"].as_bool();
                    project::settings(&root, value)?;
                    if enabled == Some(false) { state.memory_activity.cancel_entities(); }
                    json(())
                },
                Request::ResolveExternal {
                    id,
                    keep_local,
                    pending,
                } => json(project::resolve_external(&root, &id, keep_local, pending)?),
                Request::Vaults => json(vaults::list(&root, &index)?),
                Request::ConnectVault { path } => {
                    vaults::connect(&root, Path::new(&path))?;
                    json(vaults::list(&root, &index)?)
                }
                Request::CreateOwnedVault => {
                    vaults::create_owned(&root)?;
                    json(vaults::list(&root, &index)?)
                }
                Request::CreateVaultEntity { kind, name, description } => {
                    let path = vaults::create_entity(&root, &kind, &name, &description)?;
                    Ok(json!({"path":path}))
                }
                Request::VaultScope { id, scope } => json(vaults::set_scope(&root, &id, scope)?),
                Request::RemoveVault { id } => {
                    project::database(&root)?
                        .execute("DELETE FROM vaults WHERE id=?", [id])
                        .app()?;
                    json(vaults::list(&root, &index)?)
                }
                operation @ (Request::Index | Request::Scan) => {
                    let automatic = matches!(operation, Request::Scan);
                    if automatic && state.paused.load(Ordering::Relaxed) {
                        return Ok(json!({"paused":true}));
                    }
                    if !automatic {
                        state.paused.store(false, Ordering::Relaxed);
                    }
                    if state.indexing.swap(true, Ordering::SeqCst) {
                        return Err("Une indexation est déjà en cours.".into());
                    }
                    state.cancel.store(false, Ordering::Relaxed);
                    let result = vaults::index(
                        &root,
                        &index,
                        &state.resources,
                        &state.engine,
                        &state.cancel,
                        |p| {
                            let _ = app.emit("index-progress", p);
                        },
                    );
                    state.indexing.store(false, Ordering::SeqCst);
                    let _ = app.emit(
                        "index-finished",
                        json!({"project":root,"error":result.as_ref().err()}),
                    );
                    result
                }
                Request::Suggest {
                    text,
                    depth,
                    allow_end,
                } => {
                    let _priority = state.memory_activity.foreground();
                    let mut sources = retrieval::suggest(
                    &root,
                    &index,
                    &state.resources,
                    &state.engine,
                    &text,
                    depth.min(5),
                    allow_end,
                    )?;
                    enrichment::decorate(&root, &index, &mut sources)?;
                    json(sources)
                }
                Request::Search { query } => {
                    let _priority = state.memory_activity.foreground();
                    let mut sources = retrieval::search(
                    &root,
                    &index,
                    &state.resources,
                    &state.engine,
                    &query,
                    true,
                    )?;
                    enrichment::decorate(&root, &index, &mut sources)?;
                    json(sources)
                }
                Request::Source { id } => {
                    let mut sources = vec![vaults::source(&index, &id, &vaults::list(&root, &index)?)?];
                    enrichment::decorate(&root, &index, &mut sources)?;
                    json(sources.remove(0))
                }
                Request::SourceFile { id } => {
                    use base64::Engine;
                    let path = vaults::file(&index, &id, &vaults::list(&root, &index)?)?;
                    let bytes = std::fs::read(&path).app()?;
                    if bytes.len() > 100_000_000 {
                        return Err("Le fichier dépasse 100 Mo".into());
                    }
                    let ext = path
                        .extension()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase();
                    let mime = match ext.as_str() {
                        "pdf" => "application/pdf",
                        "png" => "image/png",
                        "jpg" | "jpeg" => "image/jpeg",
                        "webp" => "image/webp",
                        _ => "text/plain",
                    };
                    Ok(
                        json!({"mime":mime,"data":base64::engine::general_purpose::STANDARD.encode(bytes)}),
                    )
                }
                Request::Associate {
                    section,
                    id,
                    payload,
                } => json(project::links::associate(&root, &section, &id, payload)?),
                Request::Links { section } => json(project::links::links(&root, &section)?),
                Request::Versions => json(history::list(&root)?),
                Request::Version { id } => json(history::get(&root, &id)?),
                Request::Capture { name, scope } => json(history::capture(&root, &name, scope)?),
                Request::Restore { id } => json(history::restore(&root, &id)?),
                Request::Export {
                    path,
                    format,
                    scope,
                } => {
                    if state.exporting.swap(true, Ordering::SeqCst) {
                        return Err("Un export est déjà en cours.".into());
                    }
                    state.export_cancel.store(false, Ordering::Relaxed);
                    let result = export::export_with_cancel(
                        &root,
                        &state.resources,
                        Path::new(&path),
                        &format,
                        scope,
                        &state.export_cancel,
                    );
                    state.exporting.store(false, Ordering::SeqCst);
                    json(result?)
                }
                Request::Cite { id, payload } => {
                    project::database(&root)?
                        .execute(
                            "INSERT OR REPLACE INTO citations VALUES(?,?)",
                            rusqlite::params![id, payload.to_string()],
                        )
                        .app()?;
                    Ok(json!(true))
                }
                _ => Err("Action invalide".into()),
            }
        }
    }
}
#[tauri::command]
pub async fn dispatch(app: tauri::AppHandle, request: Request) -> Result<serde_json::Value> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        handle(&app2, &state, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn withdrawn_requests_are_not_dispatched() {
        for kind in ["replaceTexts", "importProject"] {
            assert!(serde_json::from_value::<Request>(json!({"type":kind,"source":"/tmp/a","path":"/tmp/b","projectPath":"/tmp/b","patches":[]})).is_err());
        }
    }
    #[test]
    fn failed_session_write_does_not_switch_the_active_project() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        let next = temp.path().join("next");
        project::create(&old, "Old").unwrap();
        project::create(&next, "Next").unwrap();
        let data = temp.path().join("data");
        std::fs::create_dir_all(data.join("session.json")).unwrap();
        let state = AppState {
            data, resources: temp.path().join("resources"), current: Mutex::new(Some(old.clone())),
            engine: Default::default(), revision: Default::default(), voice: Default::default(),
            enriching: Default::default(), memory_activity: Default::default(),
            memory_job: Default::default(), entity_engine: Default::default(),
            indexing: false.into(), cancel: false.into(), paused: false.into(),
            export_cancel: false.into(), exporting: false.into(), exit_approved: false.into(),
        };
        assert!(activate(&state, &next).is_err());
        assert_eq!(*state.current.lock().unwrap(), Some(old));
        std::fs::remove_dir(state.data.join("session.json")).unwrap();
        assert_eq!(activate(&state, &next).unwrap().name, "Next");
        assert_eq!(*state.current.lock().unwrap(), Some(next.canonicalize().unwrap()));
        let session: serde_json::Value = serde_json::from_slice(&std::fs::read(state.data.join("session.json")).unwrap()).unwrap();
        assert_eq!(session["path"], next.canonicalize().unwrap().to_string_lossy().as_ref());
    }
}
