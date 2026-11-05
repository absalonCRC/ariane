use super::{json, AppState, Request};
use crate::error::Result;
use crate::{export, history};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

pub(super) fn handle(
    _app: &tauri::AppHandle,
    state: &AppState,
    root: PathBuf,
    _index: PathBuf,
    request: Request,
) -> Result<serde_json::Value> {
    match request {
        Request::Versions { offset } => json(history::list_page(&root, offset)?),
        Request::Version { id } => json(history::get(&root, &id)?),
        Request::AutomaticVersion {
            project_path,
            scope,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(history::checkpoint(&root, &scope)?.map(|mut version| {
                version.sections.clear();
                version
            }))
        }
        Request::Capture { name, scope } => json(history::capture(&root, &name, scope)?),
        Request::Restore { id } => json(history::restore(&root, &id)?),
        Request::Export {
            path,
            format,
            scope,
        } => {
            state.grants.require("export", Path::new(&path))?;
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
        _ => Err("Action invalide".into()),
    }
}
