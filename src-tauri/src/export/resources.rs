use crate::error::{AppResult, Result};
use serde_json::Value;
use std::{path::Path, process::Command};

pub(super) fn prepare(root: &Path, resources: &Path, input: &Path) -> Result<tempfile::NamedTempFile> {
    // Parse under Pandoc's sandbox before any writer can fetch an image.
    let parsed = Command::new(resources.join("engine/pandoc"))
        .current_dir(root)
        .arg(input)
        .args(["--from", "markdown+footnotes+citations", "--to", "json", "--sandbox"])
        .env("DYLD_LIBRARY_PATH", resources.join("engine"))
        .output()
        .app()?;
    if !parsed.status.success() {
        return Err(format!("Lecture du manuscrit impossible : {}", String::from_utf8_lossy(&parsed.stderr)));
    }
    let mut document: Value = serde_json::from_slice(&parsed.stdout).app()?;
    let canonical = root.canonicalize().app()?;
    validate(&mut document, &canonical)?;
    let mut output = tempfile::Builder::new().prefix(".export-").suffix(".json").tempfile_in(root).app()?;
    serde_json::to_writer(output.as_file_mut(), &document).app()?;
    Ok(output)
}

fn validate(node: &mut Value, root: &Path) -> Result<()> {
    match node.get("t").and_then(Value::as_str) {
        Some("Image") => {
            let target = node["c"][2][0].as_str().ok_or("Image invalide.")?;
            let invalid = "L’export contient une image distante, absente ou hors du projet. Importez-la localement avant d’exporter.";
            if Path::new(target).is_absolute() || target.contains(':') {
                return Err(invalid.into());
            }
            let base = reqwest::Url::from_directory_path(root).map_err(|_| invalid)?;
            let path = base.join(target).map_err(|_| invalid)?.to_file_path().map_err(|_| invalid)?;
            let path = path.canonicalize().map_err(|_| invalid)?;
            if !path.starts_with(root) || !path.is_file() {
                return Err(invalid.into());
            }
            node["c"][2][0] = path.to_string_lossy().into_owned().into();
        }
        Some("RawInline" | "RawBlock") => {
            return Err("L’export PDF, Word ou EPUB n’accepte pas le code HTML, TeX ou Typst brut. Utilisez la syntaxe Markdown.".into());
        }
        _ => {}
    }
    match node {
        Value::Array(items) => {
            for value in items { validate(value, root)?; }
        }
        Value::Object(items) => {
            for value in items.values_mut() { validate(value, root)?; }
        }
        _ => {}
    }
    Ok(())
}
