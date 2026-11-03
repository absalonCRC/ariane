mod resources;
pub(crate) mod footnotes;
use crate::{
    error::{AppResult, Result},
    history, project,
};
use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
pub fn export_with_cancel(
    root: &Path,
    resources: &Path,
    target: &Path,
    format: &str,
    scope: Option<String>,
    cancel: &AtomicBool,
) -> Result<String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Export annulé.".into());
    }
    if !["md", "pdf", "docx", "epub"].contains(&format) {
        return Err("Format d’export inconnu".into());
    }
    let p = project::load(root)?;
    if let Some(id) = p.conflicts.first() {
        return Err(format!("EXTERNAL:{id}"));
    }
    let sections = if let Some(id) = scope {
        history::descendants(&p.sections, &id)
    } else {
        let by_id: std::collections::HashMap<_, _> = p.sections.iter().map(|s| (s.id.as_str(), s)).collect();
        let mut included = std::collections::HashSet::new();
        for s in p.sections.iter().filter(|s| s.kind == "scene" && s.included) {
            let mut current = Some(s);
            while let Some(node) = current {
                if !included.insert(node.id.as_str()) { break; }
                current = node.parent.as_deref().and_then(|id| by_id.get(id).copied());
            }
        }
        p.sections.iter().filter(|s| included.contains(s.id.as_str())).cloned().collect()
    };
    if !sections.iter().any(|s| s.kind == "scene") {
        return Err("Aucun texte inclus dans cet export.".into());
    }
    let c = project::database(root)?;
    let mut query = c.prepare("SELECT payload FROM citations").app()?;
    let records = query.query_map([], |r| r.get::<_, String>(0)).app()?;
    let mut references = Vec::new();
    for record in records {
        let source: serde_json::Value = serde_json::from_str(&record.app()?).app()?;
        let fields = &source["fields"];
        let id = source["id"].as_str().unwrap_or_default();
        let mut entry = serde_json::json!({"id":format!("source-{}{}",&id[..id.len().min(10)],source["fingerprint"].as_str().filter(|s|!s.is_empty()).map_or(String::new(),|hash|format!("-{}",&hash[..hash.len().min(8)]))),"type":"document","title":source["title"],"note":source["path"]});
        if let Some(author) = fields["author"].as_str().or(fields["auteur"].as_str()) {
            entry["author"] = serde_json::json!([{"literal":author}]);
        }
        if let Some(year) = fields["year"].as_i64().or_else(|| {
            fields["date"]
                .as_str()
                .and_then(|s| s.get(..4))
                .and_then(|s| s.parse().ok())
        }) {
            entry["issued"] = serde_json::json!({"date-parts":[[year]]});
        }
        if let Some(publisher) = fields["publisher"].as_str().or(fields["editeur"].as_str()) {
            entry["publisher"] = publisher.into();
        }
        references.push(entry);
    }
    let mut md = format!(
        "---\ntitle: {}\nlang: {}\nreferences: {}\n---\n\n",
        serde_json::to_string(&p.name).app()?,
        serde_json::to_string(p.settings["language"].as_str().unwrap_or("fr")).app()?,
        serde_json::to_string(&references).app()?
    );
    let citation_style = p.settings["citationStyle"].as_str().unwrap_or("notes");
    fn append(all: &[crate::model::Section], out: &mut String) -> Result<()> {
        let mut children: std::collections::HashMap<Option<&str>,Vec<&crate::model::Section>> = Default::default();
        for section in all { children.entry(section.parent.as_deref()).or_default().push(section); }
        let mut pending: Vec<_> = children.get(&None).into_iter().flatten().rev().map(|s|(*s,1usize)).collect();
        let mut visited = std::collections::HashSet::new();
        while let Some((s,depth)) = pending.pop() {
            if !visited.insert(&s.id) { return Err("Arbre de sections cyclique".into()); }
            let text = if s.kind == "scene" { footnotes::namespace(&s.text, &s.id, &s.title)? } else { s.text.clone() };
            out.push_str(&format!("{} {}\n\n{}\n\n", "#".repeat(depth.min(6)), s.title, text));
            if let Some(next) = children.get(&Some(s.id.as_str())) { pending.extend(next.iter().rev().map(|s|(*s,depth+1))); }
        }
        if visited.len() != all.len() { return Err("Arbre de sections incomplet ou cyclique".into()); }
        Ok(())
    }
    let selected_ids: std::collections::HashSet<_> =
        sections.iter().map(|s| s.id.as_str()).collect();
    let mut top = sections.clone();
    for s in &mut top {
        if s.parent
            .as_ref()
            .is_some_and(|p| !selected_ids.contains(p.as_str()))
        {
            s.parent = None
        }
    }
    append(&top, &mut md)?;
    let parent = target.parent().ok_or("Destination invalide")?;
    if !parent.is_dir() {
        return Err("Le dossier de destination n’est plus accessible".into());
    }
    let temp = parent.join(format!(
        ".ariane-export-{}.{}",
        uuid::Uuid::new_v4(),
        format
    ));
    let result = (|| -> Result<()> {
        if format == "md" {
            fs::write(&temp, &md).app()?
        } else {
            let markdown = tempfile::Builder::new().prefix(".export-").suffix(".md").tempfile_in(root).app()?;
            fs::write(markdown.path(), &md).app()?;
            let input = resources::prepare(root, resources, markdown.path())?;
            let mut cmd = Command::new(resources.join("engine/pandoc"));
            cmd.current_dir(root)
                .arg(input.path())
                .args([
                    "--from",
                    "json",
                    "--standalone",
                    "--citeproc",
                ])
                .arg("--resource-path")
                .arg(root)
                .arg("-o")
                .arg(&temp);
            if ["apa", "chicago"].contains(&citation_style) {
                cmd.arg("--csl").arg(
                    resources
                        .join("styles")
                        .join(format!("{citation_style}.csl")),
                );
            }
            if format == "pdf" {
                cmd.arg("--pdf-engine").arg(resources.join("engine/typst"));
            }
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }
            let log = tempfile::Builder::new().prefix(".export-").suffix(".log").tempfile_in(root).app()?;
            let file = log.as_file().try_clone().app()?;
            let mut child = cmd
                .env("DYLD_LIBRARY_PATH", resources.join("engine"))
                .stdout(Stdio::null())
                .stderr(file)
                .spawn()
                .app()?;
            let status = loop {
                if cancel.load(Ordering::Relaxed) {
                    #[cfg(unix)]
                    unsafe {
                        libc::kill(-(child.id() as i32), libc::SIGTERM);
                    }
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("Export annulé.".into());
                }
                if let Some(status) = child.try_wait().app()? {
                    break status;
                }
                std::thread::sleep(Duration::from_millis(100));
            };
            let errors = fs::read_to_string(log.path()).unwrap_or_default();
            if !status.success() {
                return Err(format!("L’export n’a pas abouti : {errors}"));
            }
        }
        fs::rename(&temp, target).app()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result?;
    Ok(target.to_string_lossy().into())
}
#[cfg(test)]
pub fn export(
    root: &Path,
    resources: &Path,
    target: &Path,
    format: &str,
    scope: Option<String>,
) -> Result<String> {
    export_with_cancel(
        root,
        resources,
        target,
        format,
        scope,
        &AtomicBool::new(false),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_scene_footnote_labels_render_distinct_notes() {
        use std::io::Read;
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("projet");
        let p = project::create(&root, "Notes distinctes").unwrap();
        let first = p.sections[0].id.clone();
        let second = project::add(&root, None, "Deuxième", "scene").unwrap().last().unwrap().id.clone();
        project::save(&root, vec![
            crate::model::TextPatch { id: first, revision: 0, text: "La première[^1].\n\n[^1]: Note du premier chapitre.".into(), outline: None },
            crate::model::TextPatch { id: second, revision: 0, text: "La seconde[^1].\n\n[^1]: Note du second chapitre.".into(), outline: None },
        ]).unwrap();
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let docx = temp.path().join("notes.docx");
        export(&root, &resources, &docx, "docx", None).unwrap();
        let mut archive = zip::ZipArchive::new(fs::File::open(&docx).unwrap()).unwrap();
        let mut footnotes = String::new();
        archive.by_name("word/footnotes.xml").unwrap().read_to_string(&mut footnotes).unwrap();
        assert!(footnotes.contains("Note du premier chapitre"), "{footnotes}");
        assert!(footnotes.contains("Note du second chapitre"), "{footnotes}");
        assert_eq!(footnotes.matches("<w:footnote w:id=").count(), 2, "{footnotes}");
    }
    #[test]
    fn rejects_reference_images_outside_the_project_before_conversion() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        let id = project::create(&root, "Images").unwrap().sections[0].id.clone();
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        project::save(&root, vec![crate::model::TextPatch {
            id, revision: 0, outline: None,
            text: "![image][outside]\n\n[outside]: http://127.0.0.1:9/private.png".into(),
        }]).unwrap();
        let output = d.path().join("document.docx");
        assert!(export(&root, &resources, &output, "docx", None).is_err());
        assert!(!output.exists());
    }
    #[test]
    fn local_images_export_but_symlinks_and_raw_code_do_not() {
        use std::os::unix::fs::symlink;
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        let id = project::create(&root, "Images").unwrap().sections[0].id.clone();
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let image = Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/icon.png");
        fs::copy(&image, root.join("image locale.png")).unwrap();
        let outside = d.path().join("outside.png");
        fs::copy(&image, &outside).unwrap();
        symlink(&outside, root.join("linked.png")).unwrap();
        let mut revision = 0;
        let mut save = |text: &str| {
            revision = project::save(&root, vec![crate::model::TextPatch {
                id: id.clone(), revision, outline: None, text: text.into(),
            }]).unwrap()[0].revision;
        };
        save("![locale](image%20locale.png)");
        let output = d.path().join("local.docx");
        export(&root, &resources, &output, "docx", None).unwrap();
        let archive = zip::ZipArchive::new(fs::File::open(output).unwrap()).unwrap();
        assert!(archive.file_names().any(|name| name.is_ok_and(|name| name.starts_with("word/media/"))));
        for text in [
            "![externe](linked.png)",
            "![externe](%2e%2e/outside.png)",
            "<img src=\"http://127.0.0.1:9/image.png\">",
            "```{=typst}\n#read(\"/etc/passwd\")\n```",
        ] {
            save(text);
            let output = d.path().join("rejected.docx");
            assert!(export(&root, &resources, &output, "docx", None).is_err(), "{text}");
            assert!(!output.exists());
        }
        assert!(fs::read_dir(&root).unwrap().all(|entry| !entry.unwrap().file_name().to_string_lossy().starts_with(".export-")));
    }
    #[test]
    fn exports_all_formats_with_real_engines() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("projet");
        let p = project::create(&root, "Texte vérifié").unwrap();
        project::save(
            &root,
            vec![crate::model::TextPatch {
                id: p.sections[0].id.clone(),
                revision: 0,
                text:
                    "Un texte français avec une note.[^note]\n\n[^note]: Une référence conservée."
                        .into(),
                outline: None,
            }],
        )
        .unwrap();
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        for format in ["md", "pdf", "docx", "epub"] {
            let target = temp.path().join(format!("manuscrit.{format}"));
            export(&root, &resources, &target, format, None).unwrap();
            let bytes = fs::read(target).unwrap();
            assert!(bytes.len() > 50);
            if format == "pdf" {
                assert!(bytes.starts_with(b"%PDF"))
            }
            if ["epub", "docx"].contains(&format) {
                assert!(bytes.starts_with(b"PK"))
            }
        }
    }
    #[test]
    fn exports_versioned_citations_with_bibliography_and_honors_cancel() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("references");
        let p = project::create(&root, "Références").unwrap();
        let key = "source-abcdefghij-12345678";
        project::database(&root)
            .unwrap()
            .execute(
                "INSERT INTO citations VALUES(?,?)",
                rusqlite::params![
                    key,
                    serde_json::json!({
                        "id":"abcdefghijklmnop", "fingerprint":"1234567890abcdef",
                        "title":"La ville et la voix", "path":"Sources/La ville.md",
                        "fields":{"author":"Camille Exemple","year":2020}
                    })
                    .to_string()
                ],
            )
            .unwrap();
        project::save(
            &root,
            vec![crate::model::TextPatch {
                id: p.sections[0].id.clone(),
                revision: 0,
                text: format!("La mémoire des lieux [@{key}, p. 12]."),
                outline: None,
            }],
        )
        .unwrap();
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        for style in ["apa", "chicago"] {
            project::settings(
                &root,
                serde_json::json!({"citationStyle":style,"language":"fr"}),
            )
            .unwrap();
            let target = temp.path().join(format!("{style}.docx"));
            export(&root, &resources, &target, "docx", None).unwrap();
            let plain = Command::new(resources.join("engine/pandoc"))
                .arg(&target)
                .args(["-t", "plain"])
                .output()
                .unwrap();
            assert!(plain.status.success());
            let text = String::from_utf8(plain.stdout).unwrap();
            assert!(text.contains("La ville et la voix"), "{text}");
            assert!(text.contains("2020"), "{text}");
            assert!(!text.contains(key), "Unresolved citation: {text}");
        }
        let cancelled = temp.path().join("cancelled.pdf");
        assert!(export_with_cancel(
            &root,
            &resources,
            &cancelled,
            "pdf",
            None,
            &AtomicBool::new(true)
        )
        .is_err());
        assert!(!cancelled.exists());
    }
}
