use super::AppState;
use crate::{
    error::{AppResult, Result},
    model::Project,
    project,
};
use serde_json::json;
use std::path::Path;
pub(super) fn activate(state: &AppState, path: &Path) -> Result<Project> {
    if !path.join("ariane.sqlite").is_file() {
        return Err("Ce dossier ne contient pas de projet ariane.".into());
    }
    let path = &path.canonicalize().app()?;
    let mut current = state.current.lock().map_err(|e| e.to_string())?;
    let mut held = state.project_guard.lock().map_err(|e| e.to_string())?;
    let guard = if current.as_ref() == Some(path) {
        held.clone()
    } else {
        None
    }
    .map(Ok)
    .unwrap_or_else(|| project::ProjectGuard::acquire(path).map(std::sync::Arc::new))?;
    let p = project::load(path)?;
    project::catalog::remember(&state.data, path, &p.name)?;
    let mut session = tempfile::NamedTempFile::new_in(&state.data).app()?;
    use std::io::Write;
    session
        .write_all(json!({"path":path}).to_string().as_bytes())
        .app()?;
    session.as_file().sync_all().app()?;
    session
        .persist(state.data.join("session.json"))
        .map_err(|e| e.to_string())?;
    state.memory_activity.writing(true);
    state.memory_activity.cancel_entities();
    *held = Some(guard);
    *current = Some(path.to_owned());
    Ok(p)
}
