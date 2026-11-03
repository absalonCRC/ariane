fn main() {
    let commands: &'static [&'static str] = if std::env::var_os("CARGO_FEATURE_PERFORMANCE_HARNESS").is_some() { &["dispatch", "choose_path", "performance"] } else { &["dispatch", "choose_path"] };
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(commands))).expect("Tauri build failed");
}
