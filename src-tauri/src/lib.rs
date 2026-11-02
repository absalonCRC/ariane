mod api;
mod error;
mod enrichment;
mod export;
mod history;
mod import;
mod inference;
mod model;
mod memory;
mod memory_engine;
mod memory_evidence;
mod platform;
#[cfg(feature = "performance-harness")]
mod performance;
mod project;
mod retrieval;
mod revision;
mod vaults;
mod voice;
use tauri::{Emitter, Manager};
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .menu(platform::menu)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit-after-save" {
                let _ = app.emit("app-close-requested", ());
            } else { let _ = app.emit("app-command", event.id().as_ref()); }
        })
        .setup(|app| {
            #[cfg(not(feature = "performance-harness"))]
            let data = app.path().app_data_dir()?;
            #[cfg(feature = "performance-harness")]
            let data = performance::isolated_directory()?;
            std::fs::create_dir_all(&data)?;
            let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
            let resources = if cfg!(debug_assertions) {
                dev
            } else {
                app.path().resource_dir()?.join("resources")
            };
            app.manage(api::AppState {
                data,
                resources,
                current: std::sync::Mutex::new(None),
                engine: Default::default(),
                revision: Default::default(),
                voice: Default::default(),
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
            });
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                let state = handle.state::<api::AppState>();
                let _ = api::handle(&handle, &state, api::Request::Scan);
                retrieval::release_if_idle();
                if let Ok(mut engine) = state.engine.try_lock() {
                    engine.shutdown_if_idle();
                };
                if let Ok(mut entities) = state.entity_engine.try_lock() {
                    entities.shutdown_if_idle(&state.memory_activity);
                };
                if let Ok(mut revision) = state.revision.try_lock() {
                    revision.shutdown_if_idle();
                };
                if let Ok(mut voice) = state.voice.try_lock() {
                    voice.shutdown_if_idle();
                };
            });
            Ok(())
        });
    #[cfg(feature = "performance-harness")]
    let builder = builder.invoke_handler(tauri::generate_handler![api::dispatch, performance::performance]);
    #[cfg(not(feature = "performance-harness"))]
    let builder = builder.invoke_handler(tauri::generate_handler![api::dispatch]);
    let application = builder
        .build(tauri::generate_context!())
        .expect("Impossible de démarrer Ariane");
    application.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = &event {
            // Native ⌘Q follows the same durable save path as the close button.
            if !app
                .state::<api::AppState>()
                .exit_approved
                .load(std::sync::atomic::Ordering::SeqCst)
            {
                api.prevent_exit();
                let _ = app.emit("app-close-requested", ());
            }
        }
        if let tauri::RunEvent::Exit = event {
            let state = app.state::<api::AppState>();
            state
                .cancel
                .store(true, std::sync::atomic::Ordering::Relaxed);
            if let Ok(mut engine) = state.engine.lock() {
                engine.shutdown();
            };
            state.memory_activity.cancel_entities();
            if let Ok(mut entities) = state.entity_engine.lock() {
                entities.shutdown(&state.memory_activity);
            };
            if let Ok(mut revision) = state.revision.lock() {
                revision.shutdown();
            };
            if let Ok(mut voice) = state.voice.lock() {
                voice.shutdown();
            };

        }
    });
}
