use std::{collections::BTreeMap, env, fs, path::Path};

// The native menu reads the same translations as the webview, including offline.
fn build_catalog() {
    let directory = Path::new("../src/i18n/messages");
    println!("cargo:rerun-if-changed={}", directory.display());
    let mut catalog = BTreeMap::new();
    for entry in fs::read_dir(directory).expect("read translation catalogs") {
        let path = entry.expect("translation file").path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let file = fs::File::open(&path).expect("open translation catalog");
        let messages: BTreeMap<String, [String; 2]> =
            serde_json::from_reader(file).expect("valid translation catalog");
        for (key, translations) in messages {
            assert!(!catalog.contains_key(&key), "duplicate translation: {key}");
            catalog.insert(key, translations);
        }
    }
    let target = Path::new(&env::var_os("OUT_DIR").unwrap()).join("messages.json");
    fs::write(target, serde_json::to_vec(&catalog).unwrap()).expect("write native catalog");
}

fn main() {
    build_catalog();
    let commands: &'static [&'static str] =
        if std::env::var_os("CARGO_FEATURE_PERFORMANCE_HARNESS").is_some() {
            &["dispatch", "choose_path", "performance"]
        } else {
            &["dispatch", "choose_path"]
        };
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("Tauri build failed");
}
