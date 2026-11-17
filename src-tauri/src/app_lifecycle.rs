use crate::{
    api::AppState,
    error::{AppResult, Result},
    inbox::{backup, storage},
};
use std::{
    collections::BTreeSet,
    path::PathBuf,
    sync::{atomic::Ordering, Mutex},
};
use tauri::{Emitter, Manager};
#[derive(Clone, serde::Serialize)]
pub struct Flush {
    pub id: String,
    pub action: String,
}
#[derive(Clone)]
struct Pending {
    flush: Flush,
    waiting: BTreeSet<String>,
    path: Option<PathBuf>,
}
#[derive(Default)]
pub struct Coordinator(Mutex<Option<Pending>>);
pub fn busy(app: &tauri::AppHandle) -> bool {
    app.state::<AppState>()
        .lifecycle
        .0
        .lock()
        .map(|slot| slot.is_some())
        .unwrap_or(true)
}
pub fn begin(app: &tauri::AppHandle, action: &str, path: Option<PathBuf>) -> Result<String> {
    if !["quit", "hide-main", "hide-capture", "restore"].contains(&action) {
        return Err("Action de fenêtre invalide.".into());
    }
    let state = app.state::<AppState>();
    let mut slot = state.lifecycle.0.lock().map_err(|e| e.to_string())?;
    if slot.is_some() {
        return Err("Une sauvegarde de fenêtre est déjà en cours.".into());
    }
    let waiting = app
        .webview_windows()
        .into_keys()
        .filter(|label| {
            action == "quit" || action == "restore" || action == format!("hide-{label}")
        })
        .collect::<BTreeSet<_>>();
    let flush = Flush {
        id: uuid::Uuid::new_v4().to_string(),
        action: action.into(),
    };
    let id = flush.id.clone();
    *slot = Some(Pending {
        flush: flush.clone(),
        waiting: waiting.clone(),
        path,
    });
    drop(slot);
    for label in waiting {
        app.emit_to(&label, "app-flush-requested", &flush).app()?;
    }
    let handle = app.clone();
    let timeout = id.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let state = handle.state::<AppState>();
        let mut slot = state.lifecycle.0.lock().unwrap_or_else(|e| e.into_inner());
        if slot
            .as_ref()
            .is_some_and(|p| p.flush.id == timeout && !p.waiting.is_empty())
        {
            *slot = None;
            drop(slot);
            let _ = crate::capture_window::show_main(&handle);
            let _ = handle.emit(
                "app-lifecycle-error",
                "La sauvegarde n’a pas été confirmée. Réessayez.",
            );
        }
    });
    Ok(id)
}
pub fn ready(app: &tauri::AppHandle, label: &str) -> Result<()> {
    if let Some(pending) = app
        .state::<AppState>()
        .lifecycle
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
    {
        if pending.waiting.contains(label) {
            app.emit_to(label, "app-flush-requested", &pending.flush)
                .app()?;
        }
    }
    Ok(())
}
pub fn acknowledge(
    app: &tauri::AppHandle,
    label: &str,
    id: &str,
    error: Option<String>,
) -> Result<bool> {
    let state = app.state::<AppState>();
    let mut slot = state.lifecycle.0.lock().map_err(|e| e.to_string())?;
    let Some(pending) = slot.as_mut() else {
        return Ok(false);
    };
    if pending.flush.id != id || !pending.waiting.contains(label) {
        return Ok(false);
    }
    if let Some(error) = error {
        *slot = None;
        drop(slot);
        crate::capture_window::show_main(app)?;
        app.emit("app-lifecycle-error", error).app()?;
        return Ok(false);
    }
    pending.waiting.remove(label);
    if !pending.waiting.is_empty() {
        return Ok(false);
    }
    let pending = slot.as_ref().unwrap().clone();
    drop(slot);
    let result = (|| -> Result<()> {
        match pending.flush.action.as_str() {
            "quit" => {
                state.exit_approved.store(true, Ordering::SeqCst);
                app.exit(0);
                Ok(())
            }
            "hide-main" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide().app()?;
                }
                Ok(())
            }
            "hide-capture" => {
                let handle = app.clone();
                let (send, receive) = std::sync::mpsc::channel();
                app.run_on_main_thread(move || {
                    let _ = send.send(crate::capture_window::hide(&handle));
                })
                .app()?;
                receive
                    .recv_timeout(std::time::Duration::from_secs(10))
                    .app()?
            }
            "restore" => {
                let _guard = state.inbox.gate.lock().map_err(|e| e.to_string())?;
                let mut c = storage::db(&state.data)?;
                backup::restore(
                    &mut c,
                    &state.data,
                    pending.path.as_deref().ok_or("Sauvegarde introuvable.")?,
                )
                .and_then(|count| {
                    let value = storage::preferences(&c)?;
                    if let Err(error) = crate::capture_window::configure(app, &value) {
                        *state
                            .capture_window
                            .error
                            .lock()
                            .map_err(|e| e.to_string())? = Some(error);
                    }
                    app.emit("inbox-restored", count).app()?;
                    app.emit("inbox-changed", serde_json::json!({"kind":"restore"}))
                        .app()
                })
            }
            _ => Err("Action invalide.".into()),
        }
    })();
    *state.lifecycle.0.lock().map_err(|e| e.to_string())? = None;
    match result {
        Ok(()) => {
            app.emit("app-flush-complete", id).app()?;
            Ok(true)
        }
        Err(error) => {
            app.emit("app-lifecycle-error", error.clone()).app()?;
            Err(error)
        }
    }
}
