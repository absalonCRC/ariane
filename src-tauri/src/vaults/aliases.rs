use super::*;
use sha2::{Digest, Sha256};
use std::io::Write;

/// Aliases are user-owned metadata. External vaults and concurrent edits are preserved.
pub fn update_aliases(
    root: &Path,
    index: &Path,
    id: &str,
    fingerprint: &str,
    aliases: &[String],
) -> Result<Source> {
    project::with_lock(root,|| {
    let available = list(root, index)?;
    let source = source(index, id, &available)?;
    let vault = available
        .iter()
        .find(|v| v.id == source.vault_id && v.owned && v.available)
        .ok_or("Les alias de ce vault se modifient dans son application d’origine.")?;
    let base = Path::new(&vault.path).canonicalize().app()?;
    let relative = Path::new(&source.path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
        || !source.path.to_lowercase().ends_with(".md")
    {
        return Err("Chemin de fiche invalide.".into());
    }
    let mut path = base.clone();
    for component in relative.components() {
        path.push(component);
        if fs::symlink_metadata(&path).app()?.file_type().is_symlink() {
            return Err("Lien symbolique refusé.".into());
        }
    }
    if !path.canonicalize().app()?.starts_with(&base) {
        return Err("Fiche hors du vault.".into());
    }
    let bytes = fs::read(&path).app()?;
    let actual = project::hash(&format!("{}:{:x}", bytes.len(), Sha256::digest(&bytes)));
    if fingerprint != source.fingerprint || actual != fingerprint {
        return Err("La fiche a changé. Rouvrez-la avant de modifier ses alias.".into());
    }
    if aliases.len() > 100 {
        return Err("Cent alias au maximum.".into());
    }
    let mut names = Vec::new();
    let mut keys = std::collections::HashSet::new();
    keys.insert(parse::normalize(&source.title));
    for alias in aliases {
        let alias = alias.trim();
        if alias.chars().count() > 120 || alias.chars().any(char::is_control) {
            return Err("Alias invalide.".into());
        }
        if !alias.is_empty() && keys.insert(parse::normalize(alias)) {
            names.push(alias.to_string());
        }
    }
    let raw = String::from_utf8(bytes).app()?;
    let (yaml, body) = raw
        .strip_prefix("---\n")
        .and_then(|s| s.split_once("\n---"))
        .ok_or("Métadonnées de fiche introuvables.")?;
    let mut fields: serde_json::Map<String, serde_json::Value> =
        crate::yaml::from_str(yaml).app()?;
    fields.retain(|key, _| !matches!(key.to_lowercase().as_str(), "alias" | "aliases"));
    fields.insert("Alias".into(), serde_json::json!(names));
    let updated = format!(
        "---\n{}---{}",
        serde_saphyr::to_string(&fields)
            .app()?
            .trim_start_matches("---\n"),
        body
    );
    let mut temporary =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Dossier invalide.")?).app()?;
    temporary.write_all(updated.as_bytes()).app()?;
    temporary.as_file().sync_all().app()?;
    if fs::read(&path).app()? != raw.as_bytes() {
        return Err("La fiche a changé pendant la modification.".into());
    }
    temporary.persist(&path).map_err(|e| e.to_string())?;
    index_created_entity(root, index, &path)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn edits_only_owned_unchanged_aliases_preserving_body_and_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let index = temp.path().join("index.sqlite");
        create_project(temp.path(), "Test", None).unwrap();
        let file = create_entity(
            temp.path(),
            "personne",
            "Axel de Saint-Germain",
            "Un parcours artistique.",
        )
        .unwrap();
        let source = index_created_entity(temp.path(), &index, &file).unwrap();
        let names = vec![
            "Rosen Kreuz".into(),
            "Cult of Rosen".into(),
            "Rosen Kreuz".into(),
        ];
        let updated =
            update_aliases(temp.path(), &index, &source.id, &source.fingerprint, &names).unwrap();
        assert_eq!(updated.aliases, vec!["Rosen Kreuz", "Cult of Rosen"]);
        assert!(updated.text.contains("Un parcours artistique."));
        assert_eq!(updated.kind, "Personne");
        assert_eq!(updated.id, source.id);
        assert!(update_aliases(temp.path(), &index, &source.id, &source.fingerprint, &[]).is_err());
        let external = tempfile::tempdir().unwrap();
        let external_file = external.path().join("Lieu.md");
        let raw = "---\ntype: lieu\n---\nUn lieu.";
        fs::write(&external_file, raw).unwrap();
        connect(temp.path(), external.path()).unwrap();
        super::super::index(
            temp.path(),
            &index,
            &temp.path().join("missing"),
            &Mutex::new(Engine::default()),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let ext = all(&index, &list(temp.path(), &index).unwrap())
            .unwrap()
            .into_iter()
            .find(|s| s.path == "Lieu.md")
            .unwrap();
        assert!(update_aliases(temp.path(), &index, &ext.id, &ext.fingerprint, &names).is_err());
        assert_eq!(fs::read_to_string(external_file).unwrap(), raw);
    }
}
