fn all_revision_stages() -> String {
    "all".into()
}
use crate::{
    enrichment,
    error::{AppResult, Result},
    export, history,
    inference::Engine,
    memory,
    memory_engine::{Activity, EntityEngine},
    memory_evidence,
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
    pub source_files: crate::source_files::Files,
    pub grants: crate::path_grants::Grants,
    pub project_guard: Mutex<Option<std::sync::Arc<project::ProjectGuard>>>,
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
    AppLanguage { value: String,
    },
    Annotations { project_path: String,
    },
    AddAnnotation { project_path: String, section: String, revision: i64, from: usize, to: usize, note: String,
    },
    UpdateAnnotation { project_path: String, id: String, revision: i64, note: String, done: bool,
    },
    ImportPreview { source: String,
    },
    ImportIntoProject { source: String, project_path: String,
    },
    ManuscriptOperation { project_path: String, operation: project::manuscript::Operation,
    },
    Projects,
    ProjectCatalog { path: String, pinned: bool, archived: bool,
    },
    LibraryOperation { operation: project::library::Operation,
    },
    BrowseSources { query: String, vault: Option<String>, kind: Option<String>, folder: Option<String>, offset: usize,
    },
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
    NoteSuggestions {
        project_path: String,
        query: String,
    },
    ClassifyCreatedNote { project_path: String, id: String, #[serde(default)] context: String,
    },
    NoteReferences { project_path: String, ids: Vec<String>,
    },
    CreateQuickNote {
        project_path: String,
        name: String,
        #[serde(default)]
        context: String,
    },
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
    Versions { #[serde(default)] offset: usize,
    },
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
    Enrich { project_path: String,
    },
    IgnoreEnrichment { project_path: String, source: String, evidence: Option<String>,
    },
    MemoryActivity { active: bool,
    },
    MemoryStatus,
    MemoryQueue { project_path: String, section: String, node: Option<String>, revision: i64, depth: u8, #[serde(default)] semantic: bool,
    },
    MemoryEntities { project_path: String, section: String, node: Option<String>, revision: i64,
    },
    MemoryContext { project_path: String, section: String, node: Option<String>, depth: u8,
    },
    InlineEntities {
        project_path: String,
        section: String,
        revision: i64,
    },
    CreateDetectedEntity {
        project_path: String,
        section: String,
        revision: i64,
        from: usize,
        to: usize,
        kind: String,
    },
    MemoryEntity { project_path: String, id: String,
    },
    MemoryList { project_path: String,
    },
    MemoryDismiss { project_path: String, id: String, hash: String,
    },
    MemorySession { project_path: String, value: Option<serde_json::Value>,
    },
    MemorySource { id: String, fingerprint: Option<String>,
    },
    EngineStatus,
    VoiceStatus,
    VoicePermission,
    VoicePrepare,
    RevisionStatus,
    RevisionCheck {
        text: String,
        language: String,
        #[serde(default = "all_revision_stages")]
        stage: String,
        #[serde(default)]
        before: String,
        #[serde(default)]
        after: String,
    },
    VoiceTranscribe {
        audio: String,
        language: String,
        #[serde(default)]
        live: bool,
        #[serde(default)]
        before: String,
        #[serde(default)]
        after: String,
        #[serde(default)]
        project_path: Option<String>,
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
        return Err("Ce dossier ne contient pas de projet ariane.".into());
    }
    let path = &path.canonicalize().app()?;
    let mut current = state.current.lock().map_err(|e| e.to_string())?;
    let mut held = state.project_guard.lock().map_err(|e| e.to_string())?;
    let guard = if current.as_ref() == Some(path) { held.clone() } else { None }
        .map(Ok).unwrap_or_else(|| project::ProjectGuard::acquire(path).map(std::sync::Arc::new))?;
    let p = project::load(path)?;
    project::catalog::remember(&state.data, path, &p.name)?;
    let mut session = tempfile::NamedTempFile::new_in(&state.data).app()?;
    use std::io::Write;
    session.write_all(json!({"path":path}).to_string().as_bytes()).app()?;
    session.as_file().sync_all().app()?;
    session.persist(state.data.join("session.json")).map_err(|e| e.to_string())?;
    state.memory_activity.writing(true);
    state.memory_activity.cancel_entities();
    *held = Some(guard);
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
        Request::ImportPreview { source } => { state.grants.require("import",Path::new(&source))?; json(crate::import::preview(&state.resources, Path::new(&source),
            )?) }
        Request::Projects => json(project::catalog::list(&state.data)?),
        Request::ProjectCatalog { path, pinned, archived,
        } => json(project::catalog::update(&state.data, &path, pinned, archived,
        )?),
        Request::MemoryActivity { active } => { state.memory_activity.writing(active); Ok(json!(true)) }
        Request::MemoryStatus => Ok(json!({"available":Engine::available(&state.resources), "entitiesAvailable":EntityEngine::available(&state.data, &state.resources)}),
        ),
        Request::Bootstrap => {
            let path = state.data.join("session.json");
            if let Ok(text) = std::fs::read_to_string(path) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(path) = v["path"].as_str() {
                        let path = Path::new(path).canonicalize().app()?;
                        let project = activate(state, &path)?;
                        return json(project);
                    }
                }
            }
            Ok(serde_json::Value::Null)
        }
        Request::Create { path, name, vault_path, initial_title,
        } => {
            state.grants.require("create",Path::new(&path))?;
            if let Some(vault) = &vault_path { state.grants.require("vault",Path::new(vault))?; }
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
        Request::Open { path } => {
            let target=Path::new(&path).canonicalize().app()?;
            let known=project::catalog::list(&state.data)?.iter().any(|p|Path::new(&p.path)==target);
            if !known {state.grants.require("open",&target)?;}
            json(activate(state,&target)?)
        }
        Request::EngineStatus => Ok(
            json!({"available":state.resources.join("models/embeddinggemma-300M-Q8_0.gguf").exists()&&state.resources.join("engine/llama-server").exists(),"model":"EmbeddingGemma 300M · Q8","local":true}),
        ),
        Request::VoicePrepare => {
            let mut engine = state.voice.lock().map_err(|e| e.to_string())?;
            engine.prepare(&state.data, &state.resources)?;
            Ok(json!(true))
        }
        Request::VoicePermission => {
            voice::request_permission()?;
            Ok(json!(true))
        }
        Request::VoiceStatus => {
            Ok(json!({"available": voice::available(&state.data, &state.resources)}))
        }
        Request::RevisionStatus => {
            let root = state.data.join("revision");
            let language = root.join("java/Contents/Home/bin/java").is_file()
                && root.join("languagetool/languagetool-server.jar").is_file();
            let model = root.join("salamandra-q8.gguf").is_file()
                && state.resources.join("engine/llama-server").is_file();
            Ok(json!({"available":language || model,"language":language,"model":model}))
        }
        Request::RevisionCheck { text, language,
            stage,
            before,
            after,
        } => {
            let _priority = state.memory_activity.foreground();
            let mut engine = state.revision.lock().map_err(|e| e.to_string())?;
            json(engine.check_context(&state.data, &state.resources, &text, &language,
                &stage,
                &before,
                &after,
            )?)
        }
        Request::VoiceTranscribe { audio, language, live,
            before,
            after,
            project_path,
        } => {
            let _priority = state.memory_activity.foreground();
            let mut engine = state.voice.lock().map_err(|e|e.to_string())?;
            let root = root(state)?;
            if project_path
                .as_deref()
                .is_some_and(|p| Path::new(p) != root)
            {
                return Err("Le projet actif a changé.".into());
            }
            let names = voice::lexicon::snapshot(&root, &state.data.join("sources.sqlite"))?;
            json(engine.transcribe_context(&state.data, &state.resources, &audio, &language, live,
                &before,
                &after,
                &names,
            )?)
        }
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
            // Retain the OS lock for the entire operation, even when another
            // request switches the active project during background work.
            let (root, _held) = {
                let current = state.current.lock().map_err(|e| e.to_string())?;
                let held = state.project_guard.lock().map_err(|e| e.to_string())?.clone();
                (current.clone().ok_or("Ouvrez un projet pour continuer.")?, held,
                )
            };
            match other {
                Request::Annotations { project_path } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::annotations::list(&root)?)
                }
                Request::AddAnnotation { project_path, section, revision, from, to, note,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::annotations::create(&root, &section, revision, from, to, &note,
                    )?)
                }
                Request::UpdateAnnotation { project_path, id, revision, note, done,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::annotations::update(&root, &id, revision, &note, done,
                    )?)
                }
                Request::ManuscriptOperation { project_path, operation,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    json(project::manuscript::apply(&root, operation)?)
                }
                Request::ImportIntoProject { source, project_path,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    state.grants.require("import",Path::new(&source))?;
                    let report = crate::import::import_into(&root, &state.resources, Path::new(&source))?;
                    Ok(json!({"project":project::load(&root)?,"report":report}))
                }
                Request::LibraryOperation { operation } => {
                    json(project::library::apply(&root, operation)?)
                }
                Request::BrowseSources { query, vault, kind, folder, offset,
                } => json(vaults::browse(&root, &index, &query, vault.as_deref(), kind.as_deref(), folder.as_deref(), offset,
                )?),
                Request::MemoryQueue { project_path, section, node, revision, depth, semantic,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    let Ok(_job) = state.memory_job.try_lock() else { return Ok(json!({"busy":true})); };
                    let queue = memory::Queue { root: &root, index: &index, resources: &state.resources,
                        engine: &state.engine, activity: &state.memory_activity,
                        critical_pressure: crate::memory_engine::critical_memory_pressure(),
                    };
                    let result = queue.run(&section, node.as_deref(), revision, depth, semantic)?;
                    if root != super::api::root(state)? { return Ok(json!({"stale":true})); }
                    Ok(result)
                }
                Request::MemoryEntities { project_path, section, node, revision,
                } => {
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
                        let settings: String = c.query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
                                r.get(0)
                            }).app()?;
                        Ok(serde_json::from_str::<serde_json::Value>(&settings).app()?["enrichment"].as_bool() != Some(false)
                            && project::section(&c,&section)?.is_some_and(|s|s.revision == revision))
                    };
                    if !enabled()? { return Ok(json!({"stale":true})); }
                    let Ok(mut worker) = state.entity_engine.try_lock() else { return Ok(json!({"busy":true,"pending":true})); };
                    {
                        let Ok(_job) = state.memory_job.try_lock() else { return Ok(json!({"busy":true,"pending":true})); };
                        memory::sync_idle(&root,Some(&section),|| {
                            state.memory_activity.is_writing()
                        })?;
                    }
                    let types =
                        serde_json::to_value(vaults::classification_types(&root, &index)?).app()?;
                    memory::prepare_types(&root, &types)?;
                    let mut analyzed = false;
                    let mut deferred = false;
                    if let Some(passage) = memory::pending_entities_at(&root,&section,node.as_deref())? {
                        let output = worker.request(&state.data,&state.resources,&state.memory_activity,&passage.text,
                            types.clone(),
                        )?;
                        if root != super::api::root(state)? || !enabled()?
                            || types
                                != serde_json::to_value(vaults::classification_types(
                                    &root, &index,
                                )?)
                                .app()? { return Ok(json!({"stale":true})); }
                        if let Some(output) = output {
                            analyzed = memory::apply_entities(&root,&passage,&output)?;
                        } else { deferred = true; }
                    }
                    let context = memory::context(&root,&section,node.as_deref(),0)?;
                    Ok(json!({"available":true,"analyzed":analyzed,"deferred":deferred,"retryMs":5000,
                        "pending":memory::pending_entities_at(&root,&section,node.as_deref())?.is_some(),
                        "entities":context["entities"],"anchorHash":context["anchorHash"]}),
                    )
                }
                Request::MemoryContext { project_path, section, node, depth,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::context(&root,&section,node.as_deref(),depth)
                }
                Request::InlineEntities {
                    project_path,
                    section,
                    revision,
                } => {
                    if Path::new(&project_path) != root {
                        return Err("Le projet actif a changé.".into());
                    }
                    json(memory::inline_entities(&root, &index, &section, revision)?)
                }
                Request::CreateDetectedEntity {
                    project_path,
                    section,
                    revision,
                    from,
                    to,
                    kind,
                } => {
                    if Path::new(&project_path) != root {
                        return Err("Le projet actif a changé.".into());
                    }
                    let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
                    let source = memory::create_detected_entity(
                        &root, &index, &section, revision, from, to, &kind,
                    )?;
                    enrichment::run(&root, &index)?;
                    let mut decorated = vec![source];
                    enrichment::decorate(&root, &index, &mut decorated)?;
                    json(decorated.remove(0))
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
                Request::MemoryDismiss { project_path, id, hash,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::dismiss(&root,&id,&hash)?; Ok(json!(true))
                }
                Request::MemorySession { project_path, value,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    memory::session(&root,value)
                }
                Request::MemorySource { id, fingerprint } => {
                    let available=vaults::list(&root,&index)?;
                    let source=vaults::source(&index,&id,&available)?;
                    if fingerprint.is_some_and(|f| f!=source.fingerprint) || !memory_evidence::fresh(&index,&source,&available) {
                        return Err("Cette source a changé ou n’est plus disponible. Actualisez son index.".into(),
                        );
                    }
                    Ok(json!(source))
                }

                Request::Enrich { project_path } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
                    enrichment::run(&root, &index)
                }
                Request::IgnoreEnrichment { project_path, source, evidence,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    enrichment::ignore(&root, &index, &source, evidence.as_deref())?;
                    let mut sources = vec![vaults::source(&index, &source, &vaults::list(&root, &index)?,
                    )?];
                    enrichment::decorate(&root, &index, &mut sources)?;
                    json(sources.remove(0))
                }
                Request::Save { patches } => {
                    state.memory_activity.writing(true);
                    let report = project::save_report(&root, patches)?;
                    Ok(json!({"sections":report.sections.iter().map(|s| json!({"id":s.id,"revision":s.revision})).collect::<Vec<_>>(),"mirrorErrors":report.mirror_errors}),
                    )
                }
                Request::Add { parent, title, kind, role,
                } => json(project::library::apply(&root, project::library::Operation { action: "add".into(), ids: vec![], target: parent, placement: None, role, title: Some(title), kind: Some(kind), included: None,
                        },
                    )?.sections,
                ),
                Request::Update { section } => json(project::update(&root, &section)?),
                Request::Reorder { ids, id, parent } => {
                    json(project::reorder(&root, &ids, &id, parent)?)
                }
                Request::Settings { value } => {
                    let enabled = value["enrichment"].as_bool();
                    project::settings(&root, value)?;
                    if enabled == Some(false) { state.memory_activity.cancel_entities(); }
                    json(())
                }
                Request::ResolveExternal {
                    id,
                    keep_local,
                    pending,
                } => json(project::resolve_external(&root, &id, keep_local, pending)?),
                Request::Vaults => json(vaults::list(&root, &index)?),
                Request::ConnectVault { path } => {
                    state.grants.require("vault",Path::new(&path))?;
                    vaults::connect(&root, Path::new(&path))?;
                    json(vaults::list(&root, &index)?)
                }
                Request::NoteSuggestions {
                    project_path,
                    query,
                } => {
                    if Path::new(&project_path) != root {
                        return Err("Le projet actif a changé.".into());
                    }
                    json(vaults::suggest_notes(&root, &index, &query)?)
                }
                Request::NoteReferences { project_path, ids } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    if ids.len()>200 { return Err("Trop de références demandées.".into()); }
                    json(vaults::note_references(&root,&index,&ids)?)
                }
                Request::ClassifyCreatedNote { project_path, id, context,
                } => {
                    if Path::new(&project_path) != root { return Err("Le projet actif a changé.".into()); }
                    let available=vaults::list(&root,&index)?;
                    let source=vaults::source(&index,&id,&available)?;
                    memory::classification_queue::enqueue(&root,&index,&source, &context)?;
                    let Ok(mut worker)=state.entity_engine.try_lock() else { return Ok(json!({"pending":true})); };
                    memory::classification_queue::run(
                        &root,
                        &index,
                        &state.data,&state.resources,&mut worker,
                        &state.memory_activity,&id,
                        || super::api::root(state).ok().as_deref() == Some(root.as_path()),
                    )
                }
                Request::CreateQuickNote { project_path, name,
                    context,
                } => {
                    if Path::new(&project_path) != root {
                        return Err("Le projet actif a changé.".into());
                    }
                    let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
                    let source = vaults::create_quick_note(&root, &index, &name)?;
                    memory::classification_queue::enqueue(&root, &index, &source, &context)?;
                    json(source)
                }
                Request::CreateOwnedVault => {
                    vaults::create_owned(&root)?;
                    json(vaults::list(&root, &index)?)
                }
                Request::CreateVaultEntity { kind, name, description,
                } => {
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
                    let result = vaults::index_with_activity(
                        &root,
                        &index,
                        &state.resources,
                        &state.engine,
                        &state.cancel,
                        &state.memory_activity,
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
                Request::SourceFile { id } => state.source_files.grant(state,&root,&id),
                Request::Associate {
                    section,
                    id,
                    payload,
                } => json(project::links::associate(&root, &section, &id, payload)?),
                Request::Links { section } => json(project::links::links(&root, &section)?),
                Request::Versions { offset } => json(history::list_page(&root, offset)?),
                Request::Version { id } => json(history::get(&root, &id)?),
                Request::Capture { name, scope } => json(history::capture(&root, &name, scope)?),
                Request::Restore { id } => json(history::restore(&root, &id)?),
                Request::Export {
                    path,
                    format,
                    scope,
                } => {
                    state.grants.require("export",Path::new(&path))?;
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
pub fn resume_classification(app: &tauri::AppHandle, state: &AppState) -> Result<()> {
    if state.memory_activity.ner_blocked() {
        return Ok(());
    }
    let Ok(root) = root(state) else {
        return Ok(());
    };
    let index = state.data.join("sources.sqlite");
    if let Some(id) = memory::classification_queue::next(&root)? {
        let Ok(mut worker) = state.entity_engine.try_lock() else {
            return Ok(());
        };
        let result = memory::classification_queue::run(
            &root,
            &index,
            &state.data,
            &state.resources,
            &mut worker,
            &state.memory_activity,
            &id,
            || self::root(state).ok().as_deref() == Some(root.as_path()),
        )?;
        if !result["source"].is_null() {
            let _ = app.emit("index-finished", json!({"projectPath":root}));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn dispatch(app: tauri::AppHandle, request: serde_json::Value,
) -> Result<serde_json::Value> {
    crate::ipc::validate(&request)?;
    let permit=crate::ipc::admit(request["type"].as_str().ok_or("Commande invalide")?).await?;
    let request: Request=serde_json::from_value(request).app()?;
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit=permit;
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
            source_files: Default::default(), grants: Default::default(), project_guard: Default::default(), engine: Default::default(), revision: Default::default(), voice: Default::default(),
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
