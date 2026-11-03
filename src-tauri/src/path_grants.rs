//! File authority comes from native dialogs (or the existing recent-project catalog).
use crate::{
    api::AppState,
    error::{AppResult, Result},
};
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
#[derive(Default)]
pub struct Grants(Mutex<VecDeque<(String, PathBuf, Instant)>>);
fn normalized(path: &Path) -> Result<PathBuf> {
    if path.exists() {
        return path.canonicalize().app();
    }
    let parent = path
        .parent()
        .ok_or("Destination invalide")?
        .canonicalize()
        .app()?;
    let name = path.file_name().ok_or("Destination invalide")?;
    if name == "." || name == ".." {
        return Err("Destination invalide".into());
    }
    Ok(parent.join(name))
}
impl Grants {
    fn add(&self, purpose: &str, path: &Path) -> Result<()> {
        let path = normalized(path)?;
        let mut grants = self.0.lock().map_err(|e| e.to_string())?;
        while grants.len() >= 32 {
            grants.pop_front();
        }
        grants.push_back((purpose.into(), path, Instant::now()));
        Ok(())
    }
    pub fn require(&self, purpose: &str, path: &Path) -> Result<()> {
        let path = normalized(path)?;
        let mut grants = self.0.lock().map_err(|e| e.to_string())?;
        grants.retain(|(_, _, time)| time.elapsed() < Duration::from_secs(1800));
        if grants.iter().any(|(kind, selected, _)| {
            kind == purpose
                && (selected == &path
                    || (purpose == "create"
                        && path.parent() == Some(selected.as_path())
                        && path != *selected))
        }) {
            Ok(())
        } else {
            Err("Choisissez ce fichier ou dossier dans le dialogue de l’application.".into())
        }
    }
}
#[tauri::command]
pub async fn choose_path(
    window: WebviewWindow,
    purpose: String,
    title: String,
    name: Option<String>,
    format: Option<String>,
    directory: Option<bool>,
) -> Result<Option<String>> {
    static DIALOG: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
        std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(1)));
    let permit = DIALOG
        .clone()
        .try_acquire_owned()
        .map_err(|_| "Un dialogue est déjà ouvert.")?;
    if window.label() != "main" {
        return Err("Fenêtre non autorisée".into());
    }
    if title.len() > 512 || name.as_ref().is_some_and(|n| n.len() > 1024) {
        return Err("Dialogue invalide".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let app = window.app_handle();
        let mut dialog = app.dialog().file().set_title(title);
        let chosen = match purpose.as_str() {
            "create" | "open" | "vault" => dialog.blocking_pick_folder(),
            "import" => {
                if directory == Some(true) {
                    dialog.blocking_pick_folder()
                } else {
                    dialog
                        .add_filter("Textes", &["md", "markdown", "txt", "docx"])
                        .blocking_pick_file()
                }
            }
            "export" => {
                let format = format
                    .as_deref()
                    .filter(|v| ["md", "pdf", "docx", "epub"].contains(v))
                    .ok_or("Format invalide")?;
                if let Some(name) = name {
                    let filename = Path::new(&name)
                        .file_name()
                        .ok_or("Nom invalide")?
                        .to_string_lossy()
                        .to_string();
                    dialog = dialog.set_file_name(filename);
                }
                dialog
                    .add_filter(format.to_uppercase(), &[format])
                    .blocking_save_file()
            }
            _ => return Err("Dialogue inconnu".into()),
        };
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let path = chosen.into_path().map_err(|e| e.to_string())?;
        app.state::<AppState>().grants.add(&purpose, &path)?;
        Ok(Some(path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unselected_paths_and_symlink_redirection() {
        let d = tempfile::tempdir().unwrap();
        let folder = d.path().join("chosen");
        std::fs::create_dir(&folder).unwrap();
        let grants = Grants::default();
        assert!(grants.require("open", &folder).is_err());
        grants.add("create", &folder).unwrap();
        assert!(grants.require("create", &folder.join("book")).is_ok());
        assert!(grants.require("export", &folder.join("book")).is_err());
        let outside = d.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, folder.join("link")).unwrap();
        assert!(grants.require("create", &folder.join("link")).is_err());
    }
}
