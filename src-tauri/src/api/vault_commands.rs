use super::{json, AppState, Request};
use crate::error::Result;
use crate::{memory, vaults};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::Emitter;

pub(super) fn handle(
    app: &tauri::AppHandle,
    state: &AppState,
    root: PathBuf,
    index: PathBuf,
    request: Request,
) -> Result<serde_json::Value> {
    match request {
        Request::BrowseSources {
            query,
            vault,
            kind,
            folder,
            offset,
        } => json(vaults::browse(
            &root,
            &index,
            &query,
            vault.as_deref(),
            kind.as_deref(),
            folder.as_deref(),
            offset,
        )?),
        Request::Vaults => json(vaults::list(&root, &index)?),
        Request::ConnectVault { path } => {
            state.grants.require("vault", Path::new(&path))?;
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
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            if ids.len() > 200 {
                return Err("Trop de références demandées.".into());
            }
            json(vaults::note_references(&root, &index, &ids)?)
        }
        Request::ClassifyCreatedNote {
            project_path,
            id,
            context,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let available = vaults::list(&root, &index)?;
            let source = vaults::source(&index, &id, &available)?;
            memory::classification_queue::enqueue(&root, &index, &source, &context)?;
            let Ok(mut worker) = state.entity_engine.try_lock() else {
                return Ok(json!({"pending":true}));
            };
            memory::classification_queue::run(
                &root,
                &index,
                &state.data,
                &state.resources,
                &mut worker,
                &state.memory_activity,
                &id,
                || super::root(state).ok().as_deref() == Some(root.as_path()),
            )
        }
        Request::CreateQuickNote {
            project_path,
            name,
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
        Request::CreateVaultEntity {
            kind,
            name,
            description,
        } => {
            let path = vaults::create_entity(&root, &kind, &name, &description)?;
            vaults::index_created_entity(&root, &index, &path)?;
            Ok(json!({"path":path}))
        }
        Request::VaultScope { id, scope } => json(vaults::set_scope(&root, &id, scope)?),
        Request::RemoveVault { id } => {
            vaults::remove(&root, &id)?;
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
        _ => Err("Action invalide".into()),
    }
}
