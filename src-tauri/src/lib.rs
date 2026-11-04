#[cfg(test)]
mod ai_benchmark;
mod ai_policy;
mod api;
mod enrichment;
mod error;
mod export;
mod history;
mod import;
mod inference;
mod ipc;
mod local_http;
mod memory;
mod memory_engine;
mod memory_evidence;
mod model;
mod path_grants;
#[cfg(feature = "performance-harness")]
mod performance;
mod platform;
mod project;
mod retrieval;
mod revision;
mod source_files;
mod vaults;
mod vectors;
mod voice;
mod worker_output;
mod yaml;
use tauri::{Emitter, Manager};
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("source-file", |context, request, responder| {
            static READS: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> = std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(2)));
            let Ok(permit)=READS.clone().try_acquire_owned() else {responder.respond(tauri::http::Response::builder().status(503).body(Vec::<u8>::new()).unwrap(),
                );return;};
            let app=context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {let _permit=permit;let state=app.state::<api::AppState>();responder.respond(state.source_files.respond(&state,request));});
        })
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
            let resources = if cfg!(debug_assertions) && !cfg!(feature = "performance-harness") {
                dev
            } else {
                app.path().resource_dir()?.join("resources")
            };
            app.manage(api::AppState {
                data,
                resources,
                current: std::sync::Mutex::new(None),
                source_files: Default::default(),
                grants: Default::default(),
                project_guard: Default::default(),
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
                if state.exit_approved.load(std::sync::atomic::Ordering::Relaxed) { break; }
                let _ = api::handle(&handle, &state, api::Request::Scan);
            });
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(15));
                let state = handle.state::<api::AppState>();
                if state.exit_approved.load(std::sync::atomic::Ordering::Relaxed) { break; }
                let _ = api::resume_classification(&handle, &state);
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
    let builder = builder.invoke_handler(tauri::generate_handler![api::dispatch, path_grants::choose_path, performance::performance]);
    #[cfg(not(feature = "performance-harness"))]
    let builder = builder.invoke_handler(tauri::generate_handler![api::dispatch, path_grants::choose_path]);
    let application = builder
        .build(tauri::generate_context!())
        .expect("Impossible de démarrer ariane");
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
