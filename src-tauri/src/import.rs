//! Import texts into the active project; retain only assets needed by the imported text.
use crate::{error::{AppResult, Result}, project};
use serde::Serialize;
use std::{collections::BTreeMap, fs, path::{Component, Path, PathBuf}, process::{Command, Stdio}, time::{Duration, Instant}};

const MAX_FILES: usize = 500;
const MAX_BYTES: u64 = 100 * 1024 * 1024;
const MAX_DOCUMENT: u64 = 20 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportItem {
    pub source: String,
    pub title: String,
    pub folder: String,
    pub format: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub source: String,
    pub format: String,
    pub project_name: String,
    pub project_path: Option<String>,
    pub items: Vec<ImportItem>,
    pub copied_files: usize,
    pub warnings: Vec<String>,
}

struct Inventory {
    base: PathBuf,
    files: Vec<PathBuf>,
    docs: Vec<(PathBuf, String)>,
    format: String,
    name: String,
    warnings: Vec<String>,
}

pub fn preview(_resources: &Path, source: &Path) -> Result<ImportReport> {
    let inventory = inspect(source)?;
    Ok(report(source, &inventory, None))
}

pub fn import_into(root: &Path, resources: &Path, source: &Path) -> Result<ImportReport> {
    crate::project::with_lock(root, || {
    if !root.join("ariane.sqlite").is_file() { return Err("Ouvrez un projet avant d’importer des textes.".into()); }
    let inventory = inspect(source)?;
    let stage = tempfile::tempdir().app()?;
    let attachment = stage.path().join("attachments");
    let batch = format!("assets/import-{}", uuid::Uuid::new_v4());
    for relative in &inventory.files {
        if image_asset(relative) {
            let to = attachment.join("source").join(relative);
            fs::create_dir_all(to.parent().ok_or("Chemin de ressource invalide.")?).app()?;
            fs::copy(inventory.base.join(relative), &to).app()?;
        }
    }
    let mut warnings = inventory.warnings.clone();
    let mut folders: BTreeMap<String,String> = BTreeMap::new();
    let mut entries = Vec::new();
    for (relative, kind) in &inventory.docs {
        let mut parent = None;
        let mut cumulative = PathBuf::new();
        for component in relative.parent().unwrap_or(Path::new("")).components() {
            if let Component::Normal(name) = component {
                cumulative.push(name);
                let key = cumulative.to_string_lossy().into_owned();
                if !folders.contains_key(&key) {
                    let id = uuid::Uuid::new_v4().to_string();
                    entries.push((id.clone(),parent.clone(),name.to_string_lossy().into_owned(),"folder",String::new()));
                    folders.insert(key.clone(),id);
                }
                parent = folders.get(&key).cloned();
            }
        }
        let text = if kind == "docx" {
            convert_docx(resources,&inventory.base.join(relative),stage.path(),&mut warnings)?
                .replace("attachments/", &format!("{batch}/"))
        } else {
            let path = if kind == "textbundle" { inventory.base.join(relative).join("text.md") } else { inventory.base.join(relative) };
            let text = fs::read_to_string(&path).map_err(|_|format!("Le texte « {} » n’est pas lisible en UTF-8.",relative.display()))?;
            rewrite_images(&text,relative,&inventory,&format!("{batch}/source"),&mut warnings)
        };
        entries.push((uuid::Uuid::new_v4().to_string(),parent,title(relative,kind),"scene",text));
    }
    let mut c = project::database(root)?;
    let tx = c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).app()?;
    let start: i64 = tx.query_row("SELECT COALESCE(MAX(position),-1)+1 FROM sections",[],|r|r.get(0)).app()?;
    for (index,(id,parent,title,kind,text)) in entries.iter().enumerate() {
        tx.execute("INSERT INTO sections(id,parent,title,kind,position,text) VALUES(?,?,?,?,?,?)",rusqlite::params![id,parent,title,kind,start+index as i64,text]).app()?;
    }
    let destination = root.join(&batch);
    if attachment.exists() {
        fs::create_dir_all(destination.parent().ok_or("Dossier de ressources invalide.")?).app()?;
        // The temporary directory can be on another volume, so copy assets instead of renaming it.
        for entry in walkdir::WalkDir::new(&attachment).min_depth(1) {
            let entry = entry.app()?;
            let target = destination.join(entry.path().strip_prefix(&attachment).app()?);
            if entry.file_type().is_dir() { fs::create_dir_all(&target).app()?; }
            else { fs::create_dir_all(target.parent().ok_or("Ressource invalide.")?).app()?; fs::copy(entry.path(),target).app()?; }
        }
    }
    tx.commit().app()?;
    let mut result = report(source,&inventory,Some(root));
    result.copied_files = inventory.files.iter().filter(|p|image_asset(p)).count();
    warnings.sort(); warnings.dedup(); result.warnings = warnings;
    Ok(result)
    })
}
fn image_asset(path: &Path) -> bool {
    path.extension().is_some_and(|ext|matches!(ext.to_string_lossy().to_ascii_lowercase().as_str(),"png"|"jpg"|"jpeg"|"gif"|"webp"|"svg"|"avif"|"bmp"))
}

fn report(source: &Path, inventory: &Inventory, root: Option<&Path>) -> ImportReport {
    ImportReport {
        source: source.to_string_lossy().into_owned(),
        format: inventory.format.clone(),
        project_name: inventory.name.clone(),
        project_path: root.map(|p| p.to_string_lossy().into_owned()),
        items: inventory.docs.iter().map(|(path, kind)| ImportItem {
            source: path.to_string_lossy().into_owned(),
            title: title(path, kind),
            folder: path.parent().unwrap_or(Path::new("")).to_string_lossy().into_owned(),
            format: kind.clone(),
        }).collect(),
        copied_files: inventory.files.iter().filter(|p|image_asset(p)).count(),
        warnings: inventory.warnings.clone(),
    }
}

fn title(path: &Path, _kind: &str) -> String {
    let source = path.file_stem().map(Path::new).unwrap_or(path);
    source.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Sans titre".into())
}

fn inspect(source: &Path) -> Result<Inventory> {
    let meta = fs::symlink_metadata(source).app()?;
    if meta.file_type().is_symlink() { return Err("Les liens symboliques ne sont pas acceptés à l’import.".into()); }
    let source = source.canonicalize().app()?;
    let single = source.is_file() || source.extension().is_some_and(|e| e.eq_ignore_ascii_case("textbundle"));
    let base = if single { source.parent().ok_or("Source invalide.")?.to_path_buf() } else { source.clone() };
    let name = if single { title(&source, if source.is_dir() { "textbundle" } else { "file" }) } else {
        source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Manuscrit importé".into())
    };
    let mut files = Vec::new();
    let mut docs: Vec<(PathBuf, String)> = Vec::new();
    let mut bytes = 0u64;
    let mut warnings = Vec::new();
    let walker = walkdir::WalkDir::new(&source).follow_links(false).max_depth(17);
    for entry in walker {
        let entry = entry.app()?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(path).app()?;
        if metadata.file_type().is_symlink() { return Err(format!("Lien symbolique refusé : {}", path.display())); }
        if entry.depth() == 17 && metadata.is_dir() { return Err("L’arborescence source est trop profonde.".into()); }
        if metadata.is_dir() { continue; }
        if !metadata.is_file() { return Err(format!("Fichier spécial refusé : {}", path.display())); }
        let relative = path.strip_prefix(&base).app()?.to_path_buf();
        bytes = bytes.checked_add(metadata.len()).ok_or("Source trop volumineuse.")?;
        if bytes > MAX_BYTES || files.len() >= MAX_FILES { return Err("L’import dépasse 500 fichiers ou 100 Mio.".into()); }
        if metadata.len() > MAX_DOCUMENT && document_kind(path).is_some() { return Err(format!("Document trop volumineux : {}", path.display())); }
        files.push(relative.clone());
        if let Some(kind) = document_kind(path) {
            if kind == "textbundle" { continue; }
            if relative.components().any(|c| matches!(c, Component::Normal(n) if n.to_string_lossy().to_ascii_lowercase().ends_with(".textbundle"))) { continue; }
            docs.push((relative, kind.into()));
        }
    }
    if source.is_dir() {
        let bundles: Vec<PathBuf> = walkdir::WalkDir::new(&source).follow_links(false).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_dir() && e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("textbundle"))).map(|e| e.path().strip_prefix(&base).unwrap().to_path_buf()).collect();
        for bundle in bundles {
            if !base.join(&bundle).join("text.md").is_file() { return Err(format!("TextBundle sans text.md : {}", bundle.display())); }
            docs.push((bundle, "textbundle".into()));
        }
    }
    docs.sort_by(|a, b| a.0.cmp(&b.0));
    if docs.is_empty() { return Err("Aucun Markdown, DOCX ou TextBundle importable dans la source.".into()); }
    let format = if docs.len() == 1 { docs[0].1.clone() } else { "directory".into() };
    if docs.iter().any(|(_, kind)| kind == "docx") { warnings.push("Les DOCX sont convertis en Markdown par Pandoc : mise en page, commentaires, révisions et champs peuvent être perdus. Les fichiers source restent à leur emplacement.".into()); }
    warnings.push("Chaque fichier devient une scène ; les titres Markdown restent dans le texte. Vérifiez la structure après import.".into());
    Ok(Inventory { base, files, docs, format, name, warnings })
}

fn document_kind(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() { "md" | "markdown" => Some("markdown"), "txt" => Some("text"), "docx" => Some("docx"), "textbundle" => Some("textbundle"), _ => None }
}

fn rewrite_images(text: &str, relative: &Path, inventory: &Inventory, prefix: &str, warnings: &mut Vec<String>) -> String {
    // Copying the entire bounded source tree preserves every asset. Rewrite simple inline images
    // to root-relative archive paths; unsupported syntax stays intact and is reported.
    let pattern = regex::Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").expect("static pattern");
    let doc_dir = if relative.extension().is_some_and(|e| e.eq_ignore_ascii_case("textbundle")) { relative } else { relative.parent().unwrap_or(Path::new("")) };
    pattern.replace_all(text, |capture: &regex::Captures<'_>| {
        let raw = capture.get(2).unwrap().as_str();
        let destination = if raw.starts_with('<') { raw.split('>').next().unwrap_or(raw).trim_start_matches('<') }
            else { raw.split_whitespace().next().unwrap_or(raw) };
        if destination.contains(':') || destination.starts_with('/') || destination.starts_with('#') {
            warnings.push(format!("Image non locale conservée telle quelle : {destination}"));
            return capture[0].to_owned();
        }
        let decoded = destination.replace("%20", " ");
        let Some(path) = normalize_relative(&doc_dir.join(decoded)) else {
            warnings.push(format!("Image hors de la source : {destination}"));
            return capture[0].to_owned();
        };
        if !inventory.files.contains(&path) || !image_asset(&path) {
            warnings.push(format!("Image introuvable ou hors de la source : {destination}"));
            return capture[0].to_owned();
        }
        format!("![{}]({}/{})", &capture[1], prefix, path.to_string_lossy().replace(' ', "%20"))
    }).into_owned()
}

fn normalize_relative(path: &Path) -> Option<PathBuf> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_os_string()),
            Component::CurDir => {},
            Component::ParentDir => { parts.pop()?; },
            _ => return None,
        }
    }
    let mut result = PathBuf::new();
    for part in parts { result.push(part); }
    Some(result)
}

fn convert_docx(resources: &Path, input: &Path, stage: &Path, warnings: &mut Vec<String>) -> Result<String> {
    let mut archive = zip::ZipArchive::new(fs::File::open(input).app()?).app()?;
    if archive.len() > 500 { return Err("DOCX trop complexe : plus de 500 éléments.".into()); }
    let mut sum = 0u64;
    for file in archive.file_names() {
        let file = file.app()?;
        let path = Path::new(file.as_ref());
        if path.is_absolute() || path.components().any(|c| !matches!(c, Component::Normal(_))) {
            return Err("DOCX contient un chemin d’archive dangereux.".into());
        }
    }
    for index in 0..archive.len() {
        let file = archive.by_index(index).app()?;
        sum = sum.checked_add(file.size()).ok_or("DOCX trop volumineux.")?;
        if sum > MAX_BYTES { return Err("DOCX décompressé trop volumineux.".into()); }
    }
    let media = stage.join("attachments/docx").join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&media).app()?;
    let output = tempfile::Builder::new().prefix(".import-").suffix(".md").tempfile_in(stage).app()?;
    let log = tempfile::NamedTempFile::new_in(stage).app()?;
    let mut child = Command::new(resources.join("engine/pandoc"))
        .arg(input).args(["--from", "docx", "--to", "markdown+footnotes", "--wrap=none"])
        .arg(format!("--extract-media={}", media.display()))
        .arg("-o").arg(output.path())
        .env("DYLD_LIBRARY_PATH", resources.join("engine"))
        .stdout(Stdio::null()).stderr(Stdio::from(log.reopen().app()?)).spawn().app()?;
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().app()? { break status; }
        if started.elapsed() > Duration::from_secs(30) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Conversion DOCX interrompue après 30 secondes.".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let stderr = fs::read_to_string(log.path()).app()?;
    if !status.success() { return Err(format!("Conversion DOCX impossible : {stderr}")); }
    if fs::metadata(output.path()).app()?.len() > MAX_DOCUMENT { return Err("Texte DOCX converti trop volumineux.".into()); }
    if !stderr.is_empty() { warnings.push(format!("Pandoc : {}", stderr.trim())); }
    let text = fs::read_to_string(output.path()).app()?;
    let media_path = media.strip_prefix(stage).app()?.to_string_lossy().into_owned();
    Ok(text.replace(&media.to_string_lossy().to_string(), &media_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imports_into_existing_project_without_archiving_sources() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("Livre");
        fs::create_dir_all(source.join("Partie/Récit.textbundle/assets")).unwrap();
        fs::write(source.join("Partie/Récit.textbundle/text.md"), "Élise[^1].\n\n[^1]: Note.\n\n![Vue](assets/vue.png)").unwrap();
        fs::write(source.join("Partie/Récit.textbundle/assets/vue.png"), b"image").unwrap();
        fs::write(source.join("Prologue.md"), "André").unwrap();
        let root = temp.path().join("Nouveau");
        let existing = project::create(&root,"Existant").unwrap();
        project::save(&root,vec![crate::model::TextPatch{id:existing.sections[0].id.clone(),revision:0,text:"Texte déjà écrit".into(),outline:None}]).unwrap();
        let report = import_into(&root, temp.path(), &source).unwrap();
        assert_eq!(report.items.len(), 2);
        assert_eq!(project::load(&root).unwrap().sections[0].text,"Texte déjà écrit");
        let p = project::load(&root).unwrap();
        assert_eq!(p.sections.iter().filter(|s| s.kind == "scene").count(), 3);
        let scene = p.sections.iter().find(|s| s.title == "Récit").unwrap();
        assert!(scene.parent.is_some());
        assert!(scene.text.contains("/source/Partie/Récit.textbundle/assets/vue.png"));
        assert!(scene.text.contains("[^1]: Note."));
        assert!(!root.join("imports/original").exists());
        assert!(!root.join("imports/report.json").exists());
        assert!(!root.join("imports/originals.sha256.json").exists());
        assert_eq!(fs::read_to_string(source.join("Prologue.md")).unwrap(),"André");
    }
    #[test]
    fn docx_import_keeps_text_and_notes_without_archiving_file() {
        let temp = tempfile::tempdir().unwrap();
        let original = temp.path().join("Original");
        let p = project::create(&original, "Texte").unwrap();
        project::save(&original,vec![crate::model::TextPatch { id:p.sections[0].id.clone(), revision:0,
            text:"Élise revient[^note].\n\n[^note]: Référence conservée.".into(), outline:None }]).unwrap();
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let docx = temp.path().join("Texte.docx");
        crate::export::export(&original,&resources,&docx,"docx",None).unwrap();
        let root = temp.path().join("Import");
        project::create(&root,"Existant").unwrap();
        let report = import_into(&root,&resources,&docx).unwrap();
        let text = project::load(&root).unwrap().sections.last().unwrap().text.clone();
        assert!(text.contains("Élise revient"),"{text}");
        assert!(text.contains("Référence conservée"),"{text}");
        assert!(!root.join("imports/original/Texte.docx").exists());
        assert!(docx.exists());
        assert!(report.warnings.iter().any(|w|w.contains("commentaires")));
    }
    #[test]
    fn rejects_symlinks_and_leaves_no_project_on_failure() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("bad.md");
        fs::write(&source, [255, 254]).unwrap();
        let root = temp.path().join("Nouveau");
        project::create(&root,"Existant").unwrap();
        assert!(import_into(&root, temp.path(), &source).is_err());
        assert_eq!(project::load(&root).unwrap().sections.len(),1);
        let link = temp.path().join("link.md");
        std::os::unix::fs::symlink(source, &link).unwrap();
        assert!(preview(temp.path(), &link).is_err());
        assert!(normalize_relative(Path::new("../../secret")).is_none());
    }
}
