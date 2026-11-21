mod dispatch;
mod memory_commands;
mod project_commands;
mod request;
mod session;
mod source_commands;
mod state;
mod vault_commands;
mod version_commands;
use crate::{
    error::{AppResult, Result},
    inference::Engine,
    memory,
    memory_engine::EntityEngine,
    project, vaults, voice,
};
pub use dispatch::dispatch;
pub(crate) use dispatch::{__cmd__dispatch, __tauri_command_name_dispatch};
pub use request::Request;
use serde::Serialize;
use session::activate;
pub use state::AppState;
use std::{
    path::{Path, PathBuf},
    sync::atomic::Ordering,
};
use tauri::Emitter;

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
fn prediction_root(state: &AppState, path: Option<&str>) -> Result<Option<PathBuf>> {
    let Some(path) = path else { return Ok(None) };
    let active = root(state)?;
    if Path::new(path) != active {
        return Err("Le projet actif a changé.".into());
    }
    Ok(Some(active))
}
use serde_json::json;
pub fn handle(
    app: &tauri::AppHandle,
    state: &AppState,
    request: Request,
) -> Result<serde_json::Value> {
    match request {
        Request::CaptureWindow { action } => {
            crate::capture_window::command(app, &action)?;
            Ok(json!(true))
        }
        Request::AppClose { action } => json(crate::app_lifecycle::begin(app, &action, None)?),
        Request::InboxRestore { path } => {
            state.grants.require("inbox-restore", Path::new(&path))?;
            json(crate::app_lifecycle::begin(
                app,
                "restore",
                Some(path.into()),
            )?)
        }
        Request::ProjectRestoreCopy { path, destination } => {
            let destination = Path::new(&destination);
            let path = Path::new(&path);
            state.grants.require("project-backup-open", path)?;
            state.grants.require("project-restore-destination", destination)?;
            json(project::backup::restore(path, destination)?)
        }
        Request::PredictionPreferences { project_path, value } => {
            let project = prediction_root(state, project_path.as_deref())?;
            if let Some(value) = value {
                state.prediction.configure(&state.data, value)?;
                if let Ok(root) = root(state) {
                    state.prediction.activate(&state.data, &root);
                }
                let _ = app.emit("prediction-changed", ());
            }
            json(state.prediction.status(&state.data, project.as_deref())?)
        }
        Request::PredictWord { project_path, language, context } => {
            let project = prediction_root(state, project_path.as_deref())?;
            json(state.prediction.suggestion(&state.data, project.as_deref(), &language, &context)?)
        }
        Request::PredictionFeedback { project_path, token, epoch, accepted } => {
            let project = prediction_root(state, project_path.as_deref())?;
            state.prediction.feedback(&state.data, project.as_deref(), &token, epoch, accepted)?;
            Ok(json!(true))
        }
        Request::ResetPrediction => {
            state.prediction.reset(&state.data)?;
            let _ = app.emit("prediction-changed", ());
            Ok(json!(true))
        }
        Request::ForgetPredictionProject { project_path, forget } => {
            let project = prediction_root(state, Some(&project_path))?.ok_or("Ouvrez un projet pour continuer.")?;
            state.prediction.forget(&state.data, &project, forget)?;
            let _ = app.emit("prediction-changed", ());
            Ok(json!(true))
        }
        Request::RuntimeModules => json(state.runtime_install.status(&state.data, &state.resources)?),
        Request::InstallRuntime { module } => {
            state.runtime_install.install(&state.data, &state.resources, module)?;
            Ok(json!(true))
        }
        Request::CancelRuntimeInstall => {
            state.runtime_install.cancel();
            Ok(json!(true))
        }
        Request::AppReady | Request::AppFlushed { .. } => {
            Err("Acquittement sans fenêtre d’origine.".into())
        }
        Request::GlobalShortcutRecording { active } => {
            let _guard = state.inbox.gate.lock().map_err(|e| e.to_string())?;
            crate::capture_window::recording(app, active)?;
            Ok(json!(true))
        }
        other @ (Request::InboxDraft
        | Request::InboxList { .. }
        | Request::InboxSave { .. }
        | Request::InboxFinish { .. }
        | Request::InboxPreferences { .. }
        | Request::InboxTarget { .. }
        | Request::InboxTransfer { .. }
        | Request::InboxBackup { .. }) => crate::inbox::commands::handle(app, state, other),
        Request::AppShortcuts { bindings } => {
            crate::platform::update_shortcuts(app, &bindings)?;
            Ok(json!(true))
        }
        Request::AppLanguage { value } => {
            if !["fr", "en", "es"].contains(&value.as_str()) {
                return Err("Unsupported application language".into());
            }
            app.set_menu(crate::platform::menu_for_language(app, &value).app()?)
                .app()?;
            Ok(json!(true))
        }
        Request::ImportPreview { source } => {
            state.grants.require("import", Path::new(&source))?;
            json(crate::import::preview(
                &state.resources,
                Path::new(&source),
            )?)
        }
        Request::Projects => json(project::catalog::list(&state.data)?),
        Request::ProjectCatalog {
            path,
            pinned,
            archived,
        } => json(project::catalog::update(
            &state.data,
            &path,
            pinned,
            archived,
        )?),
        Request::MemoryActivity { active } => {
            state.memory_activity.writing(active);
            Ok(json!(true))
        }
        Request::MemoryStatus => Ok(
            json!({"available":Engine::available(&state.resources), "entitiesAvailable":EntityEngine::available(&state.data, &state.resources)}),
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
        Request::Create {
            path,
            name,
            vault_path,
            initial_title,
        } => {
            state.grants.require("create", Path::new(&path))?;
            let folder = vault_path.as_deref()
                .map(|path| state.grants.take_vault(Path::new(path)))
                .transpose()?;
            let root = Path::new(&path);
            vaults::create_project(root, &name, folder.as_ref().map(|folder| folder.path.as_path()))?;
            if let Some(folder) = folder {
                vaults::connect(root, &state.data, folder, None)?;
            }
            if let Some(title) = initial_title.filter(|title| !title.trim().is_empty()) {
                if let Some(mut first) = project::load(root)?
                    .sections
                    .into_iter()
                    .find(|s| s.kind == "scene")
                {
                    first.title = title;
                    project::update(root, &first)?;
                }
            }
            json(activate(state, root)?)
        }
        Request::Open { path } => {
            let target = Path::new(&path).canonicalize().app()?;
            let known = project::catalog::list(&state.data)?
                .iter()
                .any(|p| Path::new(&p.path) == target);
            if !known {
                state.grants.require("open", &target)?;
            }
            json(activate(state, &target)?)
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
        Request::RevisionCheck {
            text,
            language,
            stage,
            before,
            after,
        } => {
            let _priority = state.memory_activity.foreground();
            let mut engine = state.revision.lock().map_err(|e| e.to_string())?;
            json(engine.check_context(
                &state.data,
                &state.resources,
                &text,
                &language,
                &stage,
                &before,
                &after,
            )?)
        }
        Request::VoiceTranscribe {
            audio,
            language,
            live,
            before,
            after,
            project_path,
        } => {
            let _priority = state.memory_activity.foreground();
            let mut engine = state.voice.lock().map_err(|e| e.to_string())?;
            let root = root(state)?;
            if project_path
                .as_deref()
                .is_some_and(|p| Path::new(p) != root)
            {
                return Err("Le projet actif a changé.".into());
            }
            let names = voice::lexicon::snapshot(&root, &project::backup::source_index(&state.data, &root))?;
            json(engine.transcribe_context(
                &state.data,
                &state.resources,
                &audio,
                &language,
                live,
                &before,
                &after,
                &names,
            )?)
        }
        Request::CancelExport => {
            state.export_cancel.store(true, Ordering::Relaxed);
            Ok(json!(true))
        }
        Request::Quit => json(crate::app_lifecycle::begin(app, "quit", None)?),
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
                let held = state
                    .project_guard
                    .lock()
                    .map_err(|e| e.to_string())?
                    .clone();
                (
                    current.clone().ok_or("Ouvrez un projet pour continuer.")?,
                    held,
                )
            };
            let aliases_changed = matches!(&other,
                Request::Scan | Request::Index | Request::ConnectVault { .. } |
                Request::RemoveVault { .. } | Request::VaultScope { .. } |
                Request::UpdateSourceAliases { .. } | Request::UpdateSourceCard { .. } |
                Request::CreateVaultEntity { .. } | Request::CreateOwnedVault);
            let prediction_invalidated = matches!(&other,
                Request::LibraryOperation { .. } | Request::CreateBranch { .. } |
                Request::SwitchBranch { .. } | Request::PromoteVersion { .. } |
                Request::MergeBranch { .. } | Request::Restore { .. } |
                Request::ManuscriptOperation { .. } |
                Request::ResolveExternal { keep_local: false, .. });
            let prediction_refresh = prediction_invalidated || aliases_changed || matches!(&other,
                Request::Save { .. } | Request::ImportIntoProject { .. } |
                Request::Update { .. }) || matches!(&other, Request::Settings { value } if value.get("language").is_some());
            let index = project::backup::source_index(&state.data, &root);
            let result = match other {
                request @ (Request::EntityMentions { .. }
                | Request::EntityCatalog { .. }
                | Request::EntityOperation { .. }
                | Request::EntityMergePreview { .. }
                | Request::EntityMergeHistory { .. }
                | Request::SavedViews { .. }
                | Request::SaveView { .. }
                | Request::UpdateSourceCard { .. }
                | Request::SmartTagOperation { .. }
                | Request::NoteActivity { .. }
                | Request::RecordNoteActivity { .. }
                | Request::Annotations { .. }
                | Request::AddAnnotation { .. }
                | Request::UpdateAnnotation { .. }
                | Request::ManuscriptOperation { .. }
                | Request::ImportIntoProject { .. }
                | Request::LibraryOperation { .. }
                | Request::ProjectBackup { .. }
                | Request::Save { .. }
                | Request::Add { .. }
                | Request::Update { .. }
                | Request::Reorder { .. }
                | Request::Settings { .. }
                | Request::ResolveExternal { .. }) => {
                    project_commands::handle(app, state, root.clone(), index, request)
                }
                request @ (Request::MemoryQueue { .. }
                | Request::MemoryEntities { .. }
                | Request::MemoryContext { .. }
                | Request::InlineEntities { .. }
                | Request::UpdateSourceAliases { .. }
                | Request::ResolveDetectedEntity { .. }
                | Request::CreateDetectedEntity { .. }
                | Request::MemoryEntity { .. }
                | Request::MemoryList { .. }
                | Request::MemoryDismiss { .. }
                | Request::MemorySession { .. }
                | Request::MemorySource { .. }
                | Request::Enrich { .. }
                | Request::IgnoreEnrichment { .. }) => {
                    memory_commands::handle(app, state, root.clone(), index, request)
                }
                request @ (Request::BrowseSources { .. }
                | Request::Vaults
                | Request::ConnectVault { .. }
                | Request::NoteSuggestions { .. }
                | Request::NoteReferences { .. }
                | Request::ClassifyCreatedNote { .. }
                | Request::CreateQuickNote { .. }
                | Request::CreateOwnedVault
                | Request::CreateVaultEntity { .. }
                | Request::VaultScope { .. }
                | Request::RemoveVault { .. }
                | Request::Index
                | Request::Scan) => vault_commands::handle(app, state, root.clone(), index, request),
                request @ (Request::Suggest { .. }
                | Request::Search { .. }
                | Request::Source { .. }
                | Request::SourceFile { .. }
                | Request::MarginPins { .. }
                | Request::PinSource { .. }
                | Request::UnpinSource { .. }
                | Request::Associate { .. }
                | Request::Links { .. }
                | Request::Cite { .. }) => {
                    source_commands::handle(app, state, root.clone(), index, request)
                }
                request @ (Request::Versions { .. }
                | Request::Version { .. }
                | Request::AutomaticVersion { .. }
                | Request::HistoryState { .. }
                | Request::CreateBranch { .. }
                | Request::SwitchBranch { .. }
                | Request::PromoteVersion { .. }
                | Request::MergePreview { .. }
                | Request::MergeBranch { .. }
                | Request::Capture { .. }
                | Request::Restore { .. }
                | Request::Export { .. }) => {
                    version_commands::handle(app, state, root.clone(), index, request)
                }
                _ => Err("Action invalide".into()),
            };
            if prediction_refresh && result.is_ok() {
                state.prediction.schedule(&state.data, &root, aliases_changed, prediction_invalidated);
            }
            result
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
    let index = project::backup::source_index(&state.data, &root);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

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
            inbox: crate::inbox::Service::new(&data).unwrap(),
            capture_window: Default::default(),
            lifecycle: Default::default(),
            data,
            resources: temp.path().join("resources"),
            current: Mutex::new(Some(old.clone())),
            source_files: Default::default(),
            grants: Default::default(),
            project_guard: Default::default(),
            engine: Default::default(),
            revision: Default::default(),
            voice: Default::default(),
            runtime_install: Default::default(),
            prediction: Default::default(),
            enriching: Default::default(),
            memory_activity: Default::default(),
            memory_job: Default::default(),
            entity_engine: Default::default(),
            indexing: false.into(),
            cancel: false.into(),
            paused: false.into(),
            export_cancel: false.into(),
            exporting: false.into(),
            exit_approved: false.into(),
        };
        assert!(activate(&state, &next).is_err());
        assert_eq!(*state.current.lock().unwrap(), Some(old));
        std::fs::remove_dir(state.data.join("session.json")).unwrap();
        assert_eq!(activate(&state, &next).unwrap().name, "Next");
        assert_eq!(
            *state.current.lock().unwrap(),
            Some(next.canonicalize().unwrap())
        );
        let session: serde_json::Value =
            serde_json::from_slice(&std::fs::read(state.data.join("session.json")).unwrap())
                .unwrap();
        assert_eq!(
            session["path"],
            next.canonicalize().unwrap().to_string_lossy().as_ref()
        );
    }
}
