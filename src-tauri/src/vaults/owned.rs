use crate::{
    error::{AppResult, Result},
    project,
};
use serde_yaml::{Mapping, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

struct Category {
    id: &'static str,
    label: &'static str,
    folder: &'static str,
    fields: &'static [&'static str],
}
const CATEGORIES: &[Category] = &[
    Category {
        id: "note",
        label: "Note",
        folder: "Notes",
        fields: &[],
    },
    Category {
        id: "personne",
        label: "Personne",
        folder: "Personnes",
        fields: &[
            "Prénom",
            "Date de naissance",
            "Lieu de naissance",
            "Date de décès",
            "Lieu de décès",
            "Contexte",
            "Relations",
            "Affiliations",
            "Œuvres",
            "Influences",
            "Légende",
            "Mythologie",
        ],
    },
    Category {
        id: "lieu",
        label: "Lieu",
        folder: "Lieux",
        fields: &[
            "Nature",
            "Adresse",
            "Ville",
            "Région",
            "Pays",
            "Lieu parent",
            "Coordonnées",
            "Période",
            "Date de fondation",
            "Histoire",
            "Culture",
        ],
    },
    Category {
        id: "organisation",
        label: "Organisation",
        folder: "Organisations",
        fields: &[
            "Nature",
            "Fondateur",
            "Date de fondation",
            "Lieu de fondation",
            "Organisation parente",
            "Membres",
            "Affiliations",
            "Histoire",
            "Croyances",
            "Symboles",
            "Œuvres",
        ],
    },
    Category {
        id: "evenement",
        label: "Événement",
        folder: "Événements",
        fields: &[
            "Date",
            "Période",
            "Lieu",
            "Participants",
            "Sujets",
            "Décisions",
            "Résultat",
            "Contexte",
        ],
    },
    Category {
        id: "concept",
        label: "Concept",
        folder: "Concepts",
        fields: &[
            "Catégorie",
            "Origine",
            "Période",
            "Concepts liés",
            "Symboles",
            "Sujets",
            "Personnes liées",
        ],
    },
    Category {
        id: "croyance",
        label: "Croyance ou tradition",
        folder: "Croyances",
        fields: &[
            "Nature",
            "Origine",
            "Fondateur",
            "Date d'apparition",
            "Lieu d'apparition",
            "Tradition parente",
            "Branches",
            "Communautés",
            "Pratiquants",
            "Croyances",
            "Rites",
            "Symboles",
            "Concepts",
            "Écrits",
            "Mythologie",
        ],
    },
    Category {
        id: "oeuvre",
        label: "Œuvre",
        folder: "Œuvres",
        fields: &[
            "Nature",
            "Auteur",
            "Date",
            "Date de publication",
            "Éditeur",
            "ISBN",
            "Support",
            "Sujets",
            "Contenu",
            "Provenance",
        ],
    },
    Category {
        id: "document",
        label: "Document ou source",
        folder: "Documents",
        fields: &[
            "Nature",
            "Auteur",
            "Date",
            "Date de publication",
            "Éditeur",
            "Cote",
            "Dépositaire",
            "Support",
            "Sujets",
            "Contenu",
            "Transcription",
            "Provenance",
            "Conclusion",
        ],
    },
    Category {
        id: "objet",
        label: "Objet",
        folder: "Objets",
        fields: &[
            "Nature",
            "Auteur",
            "Date",
            "Lieu",
            "Support",
            "Provenance",
            "Histoire",
            "Personnes liées",
        ],
    },
];
fn template(category: &Category, name: Option<&str>, description: &str) -> Result<String> {
    let mut fields = Mapping::new();
    fields.insert(
        Value::String("type".into()),
        Value::String(category.id.into()),
    );
    fields.insert(
        Value::String("Nom".into()),
        name.map(|x| Value::String(x.into())).unwrap_or(Value::Null),
    );
    fields.insert(Value::String("Fictif".into()), Value::Null);
    fields.insert(Value::String("Alias".into()), Value::Sequence(vec![]));
    for field in category.fields {
        fields.insert(Value::String((*field).into()), Value::Null);
    }
    fields.insert(
        Value::String("Description".into()),
        if description.is_empty() {
            Value::Null
        } else {
            Value::String(description.into())
        },
    );
    fields.insert(Value::String("Sources".into()), Value::Sequence(vec![]));
    fields.insert(Value::String("Fiabilité".into()), Value::Null);
    let yaml = serde_yaml::to_string(&fields).app()?;
    let body = name
        .map(|title| format!("# {title}\n\n{description}\n"))
        .unwrap_or_default();
    Ok(format!(
        "---\n{}---\n{}",
        yaml.trim_start_matches("---\n"),
        body
    ))
}
fn write_new(path: &Path, text: &str) -> Result<()> {
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .app()?;
    f.write_all(text.as_bytes()).app()?;
    f.sync_all().app()
}
pub fn is_owned(root: &Path, path: &Path) -> bool {
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    let expected = root.join("Vault");
    if !fs::symlink_metadata(&expected).is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink()) {
        return false;
    }
    let Ok(actual) = path.canonicalize() else {
        return false;
    };
    if actual != expected {
        return false;
    }
    project::database(&root)
        .ok()
        .and_then(|c| {
            c.query_row("SELECT value FROM meta WHERE key='owned_vault'", [], |r| {
                r.get::<_, String>(0)
            })
            .ok()
        })
        .is_some_and(|v| v == project::hash(&actual.to_string_lossy()))
}
pub fn create_owned(root: &Path) -> Result<PathBuf> {
    let root = root.canonicalize().app()?;
    let vault = root.join("Vault");
    fs::create_dir(&vault).map_err(|_| {
        "Le dossier Vault existe déjà ou ne peut pas être créé ; son contenu a été conservé."
            .to_string()
    })?;
    fs::create_dir(vault.join("Modèles")).app()?;
    for category in CATEGORIES {
        fs::create_dir(vault.join(category.folder)).app()?;
        write_new(
            &vault.join("Modèles").join(format!("{}.md", category.label)),
            &template(category, None, "")?,
        )?;
    }
    super::connect(&root, &vault)?;
    project::database(&root)?
        .execute(
            "INSERT OR REPLACE INTO meta(key,value) VALUES('owned_vault',?)",
            [project::hash(&vault.to_string_lossy())],
        )
        .app()?;
    Ok(vault)
}
pub fn create_entity(root: &Path, kind: &str, name: &str, description: &str) -> Result<PathBuf> {
    let name = name.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.chars().count() > 120
        || name
            .chars()
            .any(|c| c.is_control() || c == '/' || c == '\\' || c == ':')
        || description.chars().count() > 8000
    {
        return Err("Nom ou description de fiche invalide.".into());
    }
    let category = CATEGORIES
        .iter()
        .find(|c| c.id == kind)
        .ok_or("Type de fiche inconnu.")?;
    let vault = root.join("Vault");
    if !is_owned(root, &vault) {
        return Err("Ce projet ne possède pas de vault Ariane accessible en écriture.".into());
    }
    let canonical = vault.canonicalize().app()?;
    let folder = canonical.join(category.folder);
    // Older owned vaults predate generic notes. Never follow a supplied symlink.
    if kind == "note"
        && fs::symlink_metadata(&folder).is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound)
    {
        fs::create_dir(&folder).app()?;
    }
    if !fs::symlink_metadata(&folder).is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink())
        || !folder.canonicalize().app()?.starts_with(&canonical)
    {
        return Err("Le dossier de fiches n’est pas accessible en sécurité.".into());
    }
    let path = folder.join(format!("{name}.md"));
    write_new(&path, &template(category, Some(name), description)?).map_err(|_| "La fiche existe déjà ou ne peut pas être créée ; aucun fichier existant n’a été remplacé.".to_string())?;
    Ok(path)
}
pub fn create_project(root: &Path, name: &str, source: Option<&Path>) -> Result<()> {
    if root.exists() && fs::read_dir(root).app()?.next().is_some() {
        return Err("Le dossier du projet n’est pas vide. Choisissez un autre nom.".into());
    }
    if let Some(source) = source {
        let source = source.canonicalize().app()?;
        if !source.is_dir() {
            return Err("Choisissez un dossier de vault existant.".into());
        }
        let parent = root
            .parent()
            .ok_or("Dossier parent du projet invalide.")?
            .canonicalize()
            .app()?;
        if parent.starts_with(&source) || root.canonicalize().ok().is_some_and(|p| p == source) {
            return Err("Le projet doit être créé hors du vault en lecture seule.".into());
        }
    }
    project::create(root, name)?;
    if let Some(source) = source {
        super::connect(root, source)?;
    } else {
        create_owned(root)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{project, vaults};
    use std::fs;

    #[test]
    fn owned_vault_creates_templates_and_real_entity_without_overwriting() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("projet");
        project::create(&root, "Livre").unwrap();
        let vault = create_owned(&root).unwrap();
        assert!(vault.join("Modèles/Personne.md").is_file());
        assert!(vault.join("Modèles/Lieu.md").is_file());
        let path = create_entity(&root, "personne", "Émile Zola", "Écrivain français.").unwrap();
        let content = fs::read_to_string(&path).unwrap();
        let source = vaults::parse::parse("v", "Personnes/Émile Zola.md", &content);
        assert_eq!(source.title, "Émile Zola");
        assert_eq!(source.kind, "Personne");
        assert!(source.text.contains("Écrivain français"));
        assert!(create_entity(&root, "personne", "Émile Zola", "différent").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), content);
        assert!(create_entity(&root, "personne", "../ailleurs", "").is_err());
        assert!(create_owned(&root).is_err());
    }

    #[test]
    fn rejects_writes_when_project_only_connects_an_external_vault() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("projet");
        let external = temp.path().join("obsidian");
        project::create(&root, "Livre").unwrap();
        fs::create_dir(&external).unwrap();
        fs::write(external.join("source.md"), "note intacte").unwrap();
        vaults::connect(&root, &external).unwrap();
        assert!(create_entity(&root, "lieu", "Paris", "").is_err());
        assert_eq!(
            fs::read_to_string(external.join("source.md")).unwrap(),
            "note intacte"
        );
    }
    #[test]
    fn new_projects_choose_owned_vault_or_read_only_existing_vault() {
        let temp = tempfile::tempdir().unwrap();
        let external = temp.path().join("obsidian");
        fs::create_dir(&external).unwrap();
        fs::write(external.join("note.md"), "intact").unwrap();
        let external_project = temp.path().join("externe");
        create_project(&external_project, "Projet", Some(&external)).unwrap();
        assert!(!external_project.join("Vault").exists());
        assert_eq!(
            fs::read_to_string(external.join("note.md")).unwrap(),
            "intact"
        );
        assert!(create_project(&external.join("nouveau"), "Projet", Some(&external)).is_err());
        assert!(!external.join("nouveau").exists());
        let nonempty = temp.path().join("existant");
        fs::create_dir(&nonempty).unwrap();
        fs::write(nonempty.join("important.md"), "conservé").unwrap();
        assert!(create_project(&nonempty, "Projet", None).is_err());
        assert_eq!(
            fs::read_to_string(nonempty.join("important.md")).unwrap(),
            "conservé"
        );
        let owned = temp.path().join("propre");
        create_project(&owned, "Projet", None).unwrap();
        assert!(owned.join("Vault/Modèles/Personne.md").exists());
    }
    #[test]
    fn created_entity_is_detected_without_indexing_templates() {
        use std::sync::{atomic::AtomicBool, Mutex};
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("projet");
        create_project(&root, "Projet", None).unwrap();
        create_entity(&root, "personne", "Marie Curie", "Scientifique.").unwrap();
        let index = temp.path().join("index.sqlite");
        let engine = Mutex::new(crate::inference::Engine::default());
        super::super::index(
            &root,
            &index,
            &temp.path().join("no-resources"),
            &engine,
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let vaults = super::super::list(&root, &index).unwrap();
        assert_eq!(vaults.len(), 1);
        assert!(vaults[0].owned);
        assert_eq!(vaults[0].count, 1);
        let sources = super::super::all(&index, &vaults).unwrap();
        assert_eq!(sources[0].title, "Marie Curie");
        let suggestions = crate::retrieval::suggest(
            &root,
            &index,
            &temp.path().join("no-resources"),
            &engine,
            "Marie Curie écrit.",
            0,
            true,
        )
        .unwrap();
        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].title, "Marie Curie");
    }
}
