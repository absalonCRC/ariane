use super::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EntityType {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub examples: Vec<String>,
    #[serde(default = "enabled")]
    pub enabled: bool,
}
fn enabled() -> bool {
    true
}
pub fn classification_types(root: &Path, index: &Path) -> Result<Vec<EntityType>> {
    let c = project::database(root)?;
    let raw: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .app()?;
    let settings: serde_json::Value = serde_json::from_str(&raw).app()?;
    if settings["classifyNewNotes"].as_bool() == Some(false) {
        return Ok(vec![]);
    }
    let mut types: Vec<EntityType> = if let Some(config) = settings.get("entityTypes") {
        serde_json::from_value(config.clone()).app()?
    } else {
        serde_json::from_str(include_str!(
            "../../../src/enrichment/defaultEntityTypes.json"
        ))
        .app()?
    };
    // Existing vault types remain available, unless explicitly disabled in settings.
    for note in super::notes::catalog(root, index)? {
        if parse::normalize(&note.kind) != "note"
            && !types
                .iter()
                .any(|t| parse::normalize(&t.name) == parse::normalize(&note.kind))
        {
            types.push(EntityType {
                name: note.kind,
                description: String::new(),
                examples: vec![],
                enabled: true,
            });
        }
    }
    if types.len() > 64 {
        return Err("Limitez la classification à 64 types d’entités.".into());
    }
    let mut seen = HashSet::new();
    for t in &types {
        if t.name.trim().is_empty()
            || t.name.chars().count() > 60
            || t.name.chars().any(char::is_control)
            || t.description.chars().count() > 500
            || t.examples.len() > 30
            || t.examples.iter().any(|e| e.chars().count() > 120)
            || !seen.insert(parse::normalize(t.name.trim()))
        {
            return Err("Définition de type d’entité invalide.".into());
        }
    }
    types.retain(|t| t.enabled && parse::normalize(&t.name) != "note");
    Ok(types)
}
pub fn example_type<'a>(name: &str, types: &'a [EntityType]) -> Option<&'a str> {
    let key = parse::normalize(name.trim());
    let matches: Vec<_> = types
        .iter()
        .filter(|t| t.examples.iter().any(|e| parse::normalize(e.trim()) == key))
        .collect();
    (matches.len() == 1).then(|| matches[0].name.as_str())
}
pub fn predicted_type<'a>(output: &serde_json::Value, types: &'a [EntityType]) -> Option<&'a str> {
    let choices = output["classification"]["type"].as_array()?;
    let first = choices.first()?;
    let score = first["confidence"].as_f64()?;
    let next = choices
        .get(1)
        .and_then(|v| v["confidence"].as_f64())
        .unwrap_or(0.);
    if !score.is_finite() || score < 0.55 || score - next < 0.20 {
        return None;
    }
    let name = first["label"].as_str()?;
    types
        .iter()
        .find(|t| t.name == name)
        .map(|t| t.name.as_str())
}
/// Set only the type of an unchanged owned note; never move it or change its ID.
pub fn apply_note_type(
    root: &Path,
    index: &Path,
    source: &Source,
    kind: &str,
) -> Result<Option<Source>> {
    let Some(vault) = list(root, index)?
        .into_iter()
        .find(|v| v.id == source.vault_id && v.owned && v.available)
    else {
        return Ok(None);
    };
    let path = Path::new(&vault.path).join(&source.path);
    if source.kind.to_lowercase() != "note"
        || fs::symlink_metadata(&path).is_err()
        || fs::symlink_metadata(&path).app()?.file_type().is_symlink()
        || path.canonicalize().app()?.parent()
            != Some(Path::new(&vault.path).join("Notes").as_path())
    {
        return Ok(None);
    }
    let bytes = fs::read(&path).app()?;
    let fingerprint = project::hash(&format!(
        "{}:{:x}",
        bytes.len(),
        <sha2::Sha256 as sha2::Digest>::digest(&bytes)
    ));
    if fingerprint != source.fingerprint {
        return Ok(None);
    }
    let raw = String::from_utf8(bytes).app()?;
    let Some((yaml, body)) = raw
        .strip_prefix("---\n")
        .and_then(|s| s.split_once("\n---"))
    else {
        return Ok(None);
    };
    let mut fields: serde_yaml::Mapping = serde_yaml::from_str(yaml).app()?;
    fields.insert(
        serde_yaml::Value::String("type".into()),
        serde_yaml::Value::String(kind.into()),
    );
    let updated = format!(
        "---\n{}---{}",
        serde_yaml::to_string(&fields)
            .app()?
            .trim_start_matches("---\n"),
        body
    );
    let mut temp =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Dossier de note invalide")?).app()?;
    use std::io::Write;
    temp.write_all(updated.as_bytes()).app()?;
    temp.as_file().sync_all().app()?;
    // Recheck after serialization, before replacing the file.
    if fs::read(&path).app()? != raw.as_bytes() {
        return Ok(None);
    }
    temp.persist(&path).map_err(|e| e.to_string())?;
    Ok(Some(index_created_entity(root, index, &path)?))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn custom_types_disabled_types_and_uncertainty_are_respected() {
        let d = tempfile::tempdir().unwrap();
        let index = d.path().join("index.sqlite");
        create_project(d.path(), "Test", None).unwrap();
        project::settings(d.path(),serde_json::json!({"entityTypes":[{"name":"Dynastie","description":"Famille régnante","examples":["Capétiens"],"enabled":true},{"name":"Pays","enabled":false}]})).unwrap();
        let types = classification_types(d.path(), &index).unwrap();
        assert_eq!(types.len(), 1);
        assert_eq!(example_type("capetiens", &types), Some("Dynastie"));
        assert_eq!(
            predicted_type(
                &serde_json::json!({"classification":{"type":[{"label":"Dynastie","confidence":0.8},{"label":"Note","confidence":0.7}]}}),
                &types
            ),
            None
        );
        let note = create_quick_note(d.path(), &index, "Capétiens").unwrap();
        let typed = apply_note_type(d.path(), &index, &note, "Dynastie")
            .unwrap()
            .unwrap();
        assert_eq!(typed.kind, "Dynastie");
        assert_eq!(typed.id, note.id);
        assert!(apply_note_type(d.path(), &index, &note, "Pays")
            .unwrap()
            .is_none());
    }
}
