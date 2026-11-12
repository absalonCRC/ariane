use super::*;
use sha2::{Digest, Sha256};
use std::io::Write;

/// Aliases are user-owned metadata. External vaults and concurrent edits are preserved.
#[allow(clippy::too_many_arguments)]
pub fn update_card(
    root: &Path,
    index: &Path,
    id: &str,
    fingerprint: &str,
    title: &str,
    kind: &str,
    aliases: &[String],
    body: &str,
) -> Result<Source> {
    project::with_lock(root, || {
        if title.trim().is_empty()
            || title.chars().count() > 200
            || kind.trim().is_empty()
            || kind.len() > 200
            || body.len() > 4_000_000
        {
            return Err("Fiche invalide.".into());
        }
        recover_card_edits(root, index)?;
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
        let (yaml, _) = raw
            .strip_prefix("---\n")
            .and_then(|s| s.split_once("\n---"))
            .ok_or("Métadonnées de fiche introuvables.")?;
        let mut fields: serde_json::Map<String, serde_json::Value> =
            crate::yaml::from_str(yaml).app()?;
        fields.retain(|key, _| {
            !matches!(
                key.to_lowercase().as_str(),
                "alias" | "aliases" | "title" | "titre" | "type"
            )
        });
        fields.insert("Alias".into(), serde_json::json!(names));
        fields.insert("title".into(), serde_json::json!(title.trim()));
        fields.insert("Nom".into(), serde_json::json!(title.trim()));
        fields.insert("type".into(), serde_json::json!(kind.trim()));
        let updated = format!(
            "---\n{}---\n{}",
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
        let c = project::database(root)?;
        c.execute_batch("CREATE TABLE IF NOT EXISTS card_edits(id TEXT PRIMARY KEY,path TEXT NOT NULL,before_payload TEXT NOT NULL,after_payload TEXT NOT NULL);").app()?;
        let operation = uuid::Uuid::new_v4().to_string();
        c.execute(
            "INSERT INTO card_edits VALUES(?,?,?,?)",
            params![operation, path.to_string_lossy(), raw, updated],
        )
        .app()?;
        temporary.persist(&path).map_err(|e| e.to_string())?;
        let source = index_created_entity(root, index, &path)?;
        c.execute("DELETE FROM card_edits WHERE id=?", [operation])
            .app()?;
        Ok(source)
    })
}

pub fn recover_card_edits(root: &Path, index: &Path) -> Result<()> {
    project::with_lock(root, || recover_unlocked(root, index))
}
fn recover_unlocked(root: &Path, index: &Path) -> Result<()> {
    let c = project::database(root)?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS card_edits(id TEXT PRIMARY KEY,path TEXT NOT NULL,before_payload TEXT NOT NULL,after_payload TEXT NOT NULL);").app()?;
    let mut q = c
        .prepare("SELECT id,path,before_payload,after_payload FROM card_edits")
        .app()?;
    let entries = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    for (id, path, before, after) in entries {
        let path = Path::new(&path);
        let base = root.canonicalize().app()?.join("Vault");
        let relative = path
            .strip_prefix(&base)
            .map_err(|_| "Fiche hors du vault.")?;
        let mut checked = base.clone();
        for part in relative.components() {
            if !matches!(part, std::path::Component::Normal(_)) {
                return Err("Chemin de fiche invalide.".into());
            }
            checked.push(part);
            if fs::symlink_metadata(&checked)
                .app()?
                .file_type()
                .is_symlink()
            {
                return Err("Lien symbolique refusé.".into());
            }
        }
        if !super::owned::is_owned(root, &base) {
            return Err("Fiche non modifiable.".into());
        }
        let actual = fs::read_to_string(path).app()?;
        if actual == after {
            index_created_entity(root, index, path)?;
        } else if actual != before {
            return Err(
                "La fiche a changé pendant la récupération ; les deux états ont été conservés."
                    .into(),
            );
        }
        c.execute("DELETE FROM card_edits WHERE id=?", [id]).app()?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn edits_owned_card_without_renaming_and_recovers_index_after_interruption() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        create_project(&root, "Fiches", None).unwrap();
        let index = d.path().join("index.sqlite");
        let file = create_entity(&root, "personne", "Nom initial", "").unwrap();
        let original = index_created_entity(&root, &index, &file).unwrap();
        let edited = update_card(
            &root,
            &index,
            &original.id,
            &original.fingerprint,
            "Nouveau nom",
            "Lieu",
            &["Alias".into()],
            "Texte conservé.",
        )
        .unwrap();
        assert_eq!(edited.id, original.id);
        assert_eq!(edited.title, "Nouveau nom");
        assert!(file.exists());
        assert!(edited.text.contains("Texte conservé"));
        assert!(update_card(
            &root,
            &index,
            &original.id,
            &original.fingerprint,
            "Périmé",
            "Lieu",
            &[],
            ""
        )
        .is_err());
        let content = fs::read_to_string(&file).unwrap();
        let c = project::database(&root).unwrap();
        c.execute(
            "INSERT INTO card_edits VALUES('retry',?,?,?)",
            params![file.to_string_lossy(), "old", content],
        )
        .unwrap();
        recover_card_edits(&root, &index).unwrap();
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM card_edits", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn external_card_is_preserved() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        project::create(&root, "Externe").unwrap();
        let external = d.path().join("vault");
        fs::create_dir(&external).unwrap();
        let file = external.join("Note.md");
        fs::write(&file, "# Important\n\nIntact").unwrap();
        connect(&root, &external).unwrap();
        let index = d.path().join("index.sqlite");
        super::super::index(
            &root,
            &index,
            &d.path().join("missing"),
            &Mutex::new(Engine::default()),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let source = all(&index, &list(&root, &index).unwrap())
            .unwrap()
            .remove(0);
        assert!(update_card(
            &root,
            &index,
            &source.id,
            &source.fingerprint,
            "Autre",
            "Note",
            &[],
            "Écrasé"
        )
        .is_err());
        assert_eq!(fs::read_to_string(file).unwrap(), "# Important\n\nIntact");
    }
}
