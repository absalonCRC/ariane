use crate::{
    api::AppState,
    error::{AppResult, Result},
    inbox::{model::Preferences, storage},
};
use std::sync::{
    atomic::{AtomicBool, AtomicI32, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
#[derive(Default)]
pub struct CaptureWindow {
    previous: AtomicI32,
    registered: Mutex<Option<String>>,
    pub recording: AtomicBool,
    pub error: Mutex<Option<String>>,
}
fn native_key(value: &str) -> String {
    value.replace("Mod+", "CommandOrControl+")
}
pub fn configure(app: &tauri::AppHandle, value: &Preferences) -> Result<()> {
    if app
        .state::<AppState>()
        .capture_window
        .recording
        .load(Ordering::SeqCst)
    {
        return Ok(());
    }
    configure_registered(app, value)
}
fn configure_registered(app: &tauri::AppHandle, value: &Preferences) -> Result<()> {
    let state = app.state::<AppState>();
    let mut registered = state
        .capture_window
        .registered
        .lock()
        .map_err(|e| e.to_string())?;
    if *registered == value.shortcut {
        return Ok(());
    }
    if let Some(key) = &value.shortcut {
        let _: Shortcut = native_key(key)
            .parse()
            .map_err(|_| "Raccourci global invalide.")?;
        app.global_shortcut()
            .register(native_key(key).as_str())
            .app()?;
    }
    if let Some(old) = registered.as_ref() {
        if let Err(error) = app.global_shortcut().unregister(native_key(old).as_str()) {
            if let Some(new) = &value.shortcut {
                let _ = app.global_shortcut().unregister(native_key(new).as_str());
            }
            return Err(error.to_string());
        }
    }
    *registered = value.shortcut.clone();
    *state
        .capture_window
        .error
        .lock()
        .map_err(|e| e.to_string())? = None;
    Ok(())
}
pub fn recording(app: &tauri::AppHandle, active: bool) -> Result<()> {
    let value = if active {
        Preferences {
            shortcut: None,
            ..Preferences::default()
        }
    } else {
        storage::preferences(&storage::db(&app.state::<AppState>().data)?)?
    };
    configure_registered(app, &value)?;
    app.state::<AppState>()
        .capture_window
        .recording
        .store(active, Ordering::SeqCst);
    Ok(())
}
pub fn setup(app: &tauri::AppHandle) -> Result<()> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        if let Err(error) = toggle(&handle) {
                            let _ = handle.emit_to("main", "app-lifecycle-error", error);
                        }
                    });
                }
            })
            .build(),
    )
    .app()?;
    let capture = tauri::WebviewWindowBuilder::new(
        app,
        "capture",
        tauri::WebviewUrl::App("index.html?capture".into()),
    )
    .title("ariane")
    .inner_size(660., 350.)
    .min_inner_size(420., 240.)
    .visible(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true)
    .build()
    .app()?;
    #[cfg(target_os = "macos")]
    unsafe {
        let window = capture.ns_window().app()? as *mut objc2::runtime::AnyObject;
        let _: () = objc2::msg_send![window,setCollectionBehavior: (1usize | (1usize<<8))];
    }
    let value = storage::preferences(&storage::db(&app.state::<AppState>().data)?)?;
    if let Err(error) = configure(app, &value) {
        *app.state::<AppState>()
            .capture_window
            .error
            .lock()
            .map_err(|e| e.to_string())? = Some(error);
    }
    Ok(())
}
pub fn toggle(app: &tauri::AppHandle) -> Result<()> {
    if crate::app_lifecycle::busy(app) {
        return Ok(());
    }
    let window = app
        .get_webview_window("capture")
        .ok_or("Fenêtre de capture indisponible.")?;
    if window.is_visible().app()? && window.is_focused().app()? {
        return crate::app_lifecycle::begin(app, "hide-capture", None).map(|_| ());
    }
    #[cfg(target_os = "macos")]
    unsafe {
        let workspace: *mut objc2::runtime::AnyObject =
            objc2::msg_send![objc2::class!(NSWorkspace), sharedWorkspace];
        let front: *mut objc2::runtime::AnyObject =
            objc2::msg_send![workspace, frontmostApplication];
        if !front.is_null() {
            let pid: i32 = objc2::msg_send![front, processIdentifier];
            app.state::<AppState>()
                .capture_window
                .previous
                .store(pid, Ordering::SeqCst);
        }
    }
    let pointer = app.cursor_position().app()?;
    if let Some(monitor) = app
        .monitor_from_point(pointer.x, pointer.y)
        .app()?
        .or(app.primary_monitor().app()?)
    {
        let rect = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = (660. * scale).min(rect.size.width as f64 - 24.);
        let height = (350. * scale).min(rect.size.height as f64 - 24.);
        window
            .set_size(tauri::PhysicalSize::new(width as u32, height as u32))
            .app()?;
        window
            .set_position(tauri::PhysicalPosition::new(
                rect.position.x + (rect.size.width as i32 - width as i32) / 2,
                rect.position.y + rect.size.height as i32 - height as i32 - (24. * scale) as i32,
            ))
            .app()?;
    }
    window.show().app()?;
    window.set_focus().app()?;
    window.emit("capture-shown", ()).app()?;
    Ok(())
}
pub fn hide(app: &tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("capture") {
        window.hide().app()?;
    }
    #[cfg(target_os = "macos")]
    unsafe {
        let pid = app
            .state::<AppState>()
            .capture_window
            .previous
            .swap(0, Ordering::SeqCst);
        if pid != 0 {
            let previous: *mut objc2::runtime::AnyObject = objc2::msg_send![objc2::class!(NSRunningApplication),runningApplicationWithProcessIdentifier:pid];
            if !previous.is_null() {
                let _: bool = objc2::msg_send![previous,activateWithOptions:2usize];
            }
        }
    }
    Ok(())
}
pub fn show_main(app: &tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().app()?;
        window.unminimize().app()?;
        window.set_focus().app()?;
    }
    Ok(())
}

pub fn command(app: &tauri::AppHandle, action: &str) -> Result<()> {
    let app2 = app.clone();
    let action = action.to_owned();
    let (send, receive) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = match action.as_str() {
            "toggle" => toggle(&app2),
            "main" | "inbox" => show_main(&app2).and_then(|()| {
                if action == "inbox" {
                    app2.emit_to("main", "app-command", "inbox-open").app()
                } else {
                    Ok(())
                }
            }),
            _ => Err("Action de capture invalide.".into()),
        };
        let _ = send.send(result);
    })
    .app()?;
    receive
        .recv_timeout(std::time::Duration::from_secs(10))
        .app()?
}

pub fn active_shortcut(app: &tauri::AppHandle) -> Result<Option<String>> {
    app.state::<AppState>()
        .capture_window
        .registered
        .lock()
        .map(|value| value.clone())
        .map_err(|e| e.to_string())
}
