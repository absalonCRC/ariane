use super::{backup, storage, transfer};
use crate::{
    api::{AppState, Request},
    error::{AppResult, Result},
    project,
};
use serde_json::json;
use tauri::Emitter;
pub fn handle(
    app: &tauri::AppHandle,
    state: &AppState,
    request: Request,
) -> Result<serde_json::Value> {
    let _guard = state.inbox.gate.lock().map_err(|e| e.to_string())?;
    let mut c = storage::db(&state.data)?;
    let change = match &request {
        Request::InboxSave { .. } => Some("draft"),
        Request::InboxFinish { .. } => Some("finish"),
        Request::InboxTransfer { .. } => Some("transfer"),
        Request::InboxPreferences { value: Some(_) } => Some("preferences"),
        _ => None,
    };
    let value = match request {
        Request::InboxDraft => serde_json::to_value(storage::draft(&mut c)?).app()?,
        Request::InboxList {
            query,
            filed,
            offset,
        } => serde_json::to_value(storage::list(&c, &query, filed, offset)?).app()?,
        Request::InboxSave {
            id,
            expected_revision,
            operation_id,
            text,
            selection,
        } => serde_json::to_value(storage::save(
            &mut c,
            &id,
            expected_revision,
            &operation_id,
            &text,
            selection,
        )?)
        .app()?,
        Request::InboxFinish {
            id,
            expected_revision,
            operation_id,
        } => serde_json::to_value(storage::finish(
            &mut c,
            &id,
            expected_revision,
            &operation_id,
        )?)
        .app()?,
        Request::InboxPreferences { value } => {
            if let Some(value) = value {
                storage::validate_preferences(&value)?;
                let old = storage::preferences(&c)?;
                crate::capture_window::configure(app, &value)?;
                if let Err(error) = storage::set_preferences(&c, &value) {
                    let _ = crate::capture_window::configure(app, &old);
                    return Err(error);
                }
            }
            json!({"value":storage::preferences(&c)?,"activeShortcut":crate::capture_window::active_shortcut(app)?,"shortcutError":state.capture_window.error.lock().map_err(|e|e.to_string())?.clone()})
        }
        Request::InboxTarget { project_path } => {
            let current = state.current.lock().map_err(|e| e.to_string())?;
            let root = current
                .as_ref()
                .filter(|root| root.to_string_lossy() == project_path)
                .ok_or("Le projet actif a changé.")?;
            let database = project::database(root)?;
            json!({"projectId":project::capture_import::identity(root)?,"branchId":crate::history::active_id(&database)?})
        }
        Request::InboxTransfer { operation } => {
            let current = state.current.lock().map_err(|e| e.to_string())?;
            let root = current
                .as_ref()
                .ok_or("Ouvrez un projet pour ranger la capture.")?;
            let _held = state
                .project_guard
                .lock()
                .map_err(|e| e.to_string())?
                .clone();
            serde_json::to_value(transfer::apply(&c, root, &operation)?).app()?
        }
        Request::InboxBackup { path } => {
            state
                .grants
                .require("inbox-backup", std::path::Path::new(&path))?;
            backup::snapshot(&c, std::path::Path::new(&path))?;
            json!(true)
        }
        _ => return Err("Commande de réception inconnue.".into()),
    };
    if let Some(kind) = change {
        app.emit(
            "inbox-changed",
            json!({"kind":kind,"id":value.get("id"),"revision":value.get("revision")}),
        )
        .app()?;
    }
    Ok(value)
}
