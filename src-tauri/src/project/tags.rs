use crate::{
    error::{AppResult, Result},
    model::{Project, SmartTag},
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use std::{collections::HashSet, path::Path};

#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Operation {
    Save {
        tag: SmartTag,
    },
    Assign {
        section: String,
        node: Option<String>,
        tag_ids: Vec<String>,
    },
    Delete {
        id: String,
    },
    Merge {
        id: String,
        target: String,
    },
}
pub fn definitions(c: &Connection) -> Result<Vec<SmartTag>> {
    let value: Option<String> = c
        .query_row("SELECT value FROM meta WHERE key='smart_tags'", [], |r| {
            r.get(0)
        })
        .optional()
        .app()?;
    serde_json::from_str(value.as_deref().unwrap_or("[]")).app()
}
pub fn validate_ids(ids: &[String], tags: &[SmartTag]) -> Result<()> {
    if ids.len() > 512
        || ids.iter().any(|id| !tags.iter().any(|tag| tag.id == *id))
        || ids.iter().collect::<HashSet<_>>().len() != ids.len()
    {
        return Err("Affectation de smart-tags invalide.".into());
    }
    Ok(())
}
pub fn validate_tag(tag: &SmartTag, tags: &[SmartTag]) -> Result<()> {
    let mut ids = HashSet::new();
    if tag.properties.len() > 64 {
        return Err("Trop de propriétés dans ce tag.".into());
    }
    for field in &tag.properties {
        if field.id.is_empty()
            || field.id.len() > 128
            || !ids.insert(&field.id)
            || field.name.trim().is_empty()
            || field.name.chars().count() > 80
            || !["text", "date", "number", "relation", "checkbox"].contains(&field.r#type.as_str())
        {
            return Err("Propriété de tag invalide.".into());
        }
        if let Some(value) = &field.default_value {
            validate_property_value(value)?;
            let valid = value.is_null()
                || match field.r#type.as_str() {
                    "text" => value.is_string(),
                    "number" => value.is_number(),
                    "checkbox" => value.is_boolean(),
                    "date" => value
                        .as_str()
                        .is_some_and(|v| chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").is_ok()),
                    "relation" => value.is_array(),
                    _ => false,
                };
            if !valid {
                return Err("Valeur de propriété incompatible avec son type.".into());
            }
        }
    }
    if tag.id.trim().is_empty()
        || tag.id.len() > 128
        || tag.name.trim().is_empty()
        || tag.name.trim().chars().count() > 80
        || tag.category.trim().chars().count() > 80
        || tag.color.len() != 7
        || !tag.color.starts_with('#')
        || !tag.color[1..].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Smart-tag invalide.".into());
    }
    if tags
        .iter()
        .any(|t| t.id != tag.id && t.name.to_lowercase() == tag.name.trim().to_lowercase())
    {
        return Err("Ce nom de smart-tag existe déjà.".into());
    }
    if tags.len() >= 512 && !tags.iter().any(|t| t.id == tag.id) {
        return Err("Limite de smart-tags atteinte.".into());
    }
    Ok(())
}
pub fn validate_property_value(value: &serde_json::Value) -> Result<()> {
    let valid = match value {
        serde_json::Value::Null | serde_json::Value::Bool(_) | serde_json::Value::Number(_) => true,
        serde_json::Value::String(v) => v.chars().count() <= 10000,
        serde_json::Value::Array(values) => {
            values.len() <= 100
                && values.iter().all(|v| {
                    let text = |key| {
                        v.get(key)
                            .and_then(serde_json::Value::as_str)
                            .is_some_and(|s| !s.is_empty() && s.len() <= 2048)
                    };
                    match v["kind"].as_str() {
                        Some("source") => text("id"),
                        Some("line") => text("section") && text("node"),
                        _ => false,
                    }
                })
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("Valeur de propriété invalide.".into())
    }
}
pub fn apply(root: &Path, operation: Operation) -> Result<Project> {
    super::with_lock(root, || {
        let mut c = super::database(root)?;
        let mut tags = definitions(&c)?;
        match &operation {
            Operation::Save { tag } => validate_tag(tag, &tags)?,
            Operation::Assign {
                section,
                node,
                tag_ids,
            } => {
                validate_ids(tag_ids, &tags)?;
                let selected = super::all_sections(&c)?
                    .into_iter()
                    .find(|s| s.id == *section)
                    .ok_or("Section introuvable.")?;
                if node.as_ref().is_some_and(|id| {
                    !selected
                        .outline
                        .as_ref()
                        .is_some_and(|o| o.nodes.iter().any(|n| n.id == *id))
                }) {
                    return Err("Passage introuvable.".into());
                }
            }
            Operation::Delete { id } | Operation::Merge { id, .. } => {
                if !tags.iter().any(|t| t.id == *id) {
                    return Err("Smart-tag introuvable.".into());
                }
                if let Operation::Merge { target, .. } = &operation {
                    if id == target || !tags.iter().any(|t| t.id == *target) {
                        return Err("Fusion de smart-tags invalide.".into());
                    }
                    let mut merged = tags.iter().find(|tag| tag.id == *target).unwrap().clone();
                    for field in &tags.iter().find(|tag| tag.id == *id).unwrap().properties {
                        if !merged.properties.iter().any(|f| f.id == field.id) {
                            merged.properties.push(field.clone());
                        }
                    }
                    validate_tag(&merged, &tags)?;
                }
            }
        }
        if !matches!(&operation, Operation::Save { tag } if !tags.iter().any(|t| t.id == tag.id)) {
            crate::history::capture(root, "Avant modification des smart-tags", None)?;
        }
        let tx = c.transaction().app()?;
        match operation {
            Operation::Assign {
                section,
                node,
                tag_ids,
            } => {
                if let Some(id) = node {
                    let mut selected = super::all_sections(&tx)?
                        .into_iter()
                        .find(|s| s.id == section)
                        .ok_or("Section introuvable.")?;
                    let outline = selected.outline.as_mut().ok_or("Passage introuvable.")?;
                    outline
                        .nodes
                        .iter_mut()
                        .find(|n| n.id == id)
                        .ok_or("Passage introuvable.")?
                        .tag_ids = tag_ids;
                    tx.execute(
                        "UPDATE sections SET outline=?,revision=revision+1 WHERE id=?",
                        params![serde_json::to_string(&outline).app()?, section],
                    )
                    .app()?;
                } else {
                    tx.execute(
                        "UPDATE sections SET tag_ids=? WHERE id=?",
                        params![serde_json::to_string(&tag_ids).app()?, section],
                    )
                    .app()?;
                }
            }
            Operation::Save { mut tag } => {
                tag.name = tag.name.trim().into();
                tag.category = tag.category.trim().into();
                tags.retain(|t| t.id != tag.id);
                tags.push(tag);
            }
            removal => {
                let (id, target) = match removal {
                    Operation::Delete { id } => (id, None),
                    Operation::Merge { id, target } => (id, Some(target)),
                    Operation::Save { .. } | Operation::Assign { .. } => unreachable!(),
                };
                if let Some(target) = &target {
                    let fields = tags
                        .iter()
                        .find(|tag| tag.id == id)
                        .map(|tag| tag.properties.clone())
                        .unwrap_or_default();
                    if let Some(tag) = tags.iter_mut().find(|tag| tag.id == *target) {
                        for field in fields {
                            if !tag.properties.iter().any(|f| f.id == field.id) {
                                tag.properties.push(field);
                            }
                        }
                    }
                }
                let remap = |ids: &mut Vec<String>| {
                    let mut seen = HashSet::new();
                    *ids = ids
                        .iter()
                        .filter_map(|value| {
                            if *value == id {
                                target.clone()
                            } else {
                                Some(value.clone())
                            }
                        })
                        .filter(|value| seen.insert(value.clone()))
                        .collect();
                };
                for mut section in super::all_sections(&tx)? {
                    remap(&mut section.tag_ids);
                    if let Some(outline) = &mut section.outline {
                        for node in &mut outline.nodes {
                            remap(&mut node.tag_ids);
                        }
                    }
                    tx.execute(
                        "UPDATE sections SET tag_ids=?,outline=? WHERE id=?",
                        params![
                            serde_json::to_string(&section.tag_ids).app()?,
                            section
                                .outline
                                .as_ref()
                                .map(serde_json::to_string)
                                .transpose()
                                .app()?,
                            section.id
                        ],
                    )
                    .app()?;
                }
                tags.retain(|t| t.id != id);
            }
        }
        tx.execute(
            "INSERT OR REPLACE INTO meta(key,value) VALUES('smart_tags',?)",
            [serde_json::to_string(&tags).app()?],
        )
        .app()?;
        tx.commit().app()?;
        super::load_unlocked(root)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        history,
        model::{Outline, OutlineNode, TextPatch},
        project,
    };
    fn tag(id: &str) -> SmartTag {
        SmartTag {
            properties: vec![],
            id: id.into(),
            name: id.into(),
            color: "#72816a".into(),
            category: "Intrigue".into(),
        }
    }
    fn node(id: &str, parent: Option<&str>, start: usize, tags: &[&str]) -> OutlineNode {
        OutlineNode {
            properties: Default::default(),
            property_conflicts: Default::default(),
            id: id.into(),
            parent: parent.map(str::to_owned),
            start,
            tag_ids: tags.iter().map(|v| (*v).into()).collect(),
        }
    }
    #[test]
    fn preserves_typed_fields_relations_and_inherited_values_through_split_merge_and_restore() {
        let d = tempfile::tempdir().unwrap();
        let p = project::create(d.path(), "Propriétés").unwrap();
        let id = p.sections[0].id.clone();
        let mut definition = tag("personne");
        definition.properties = serde_json::from_value(serde_json::json!([
            {"id":"name","name":"Nom","type":"text","defaultValue":"Inconnu"},
            {"id":"date","name":"Date","type":"date","inherit":false},
            {"id":"relation","name":"Initié à","type":"relation"}
        ]))
        .unwrap();
        apply(
            d.path(),
            Operation::Save {
                tag: definition.clone(),
            },
        )
        .unwrap();
        let mut parent = node("parent", None, 0, &["personne"]);
        parent.properties=serde_json::from_value(serde_json::json!({"name":"Hérité","date":"2026-11-05","relation":[{"kind":"source","id":"note-id","title":"Note"}]})).unwrap();
        project::save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "Parent\nEnfant".into(),
                outline: Some(Outline {
                    version: 1,
                    nodes: vec![parent.clone(), node("child", Some("parent"), 7, &[])],
                }),
            }],
        )
        .unwrap();
        let version = history::capture(d.path(), "Champs typés", None).unwrap();
        let split = project::manuscript::apply(
            d.path(),
            project::manuscript::Operation {
                action: "split".into(),
                source_id: id.clone(),
                target_id: None,
                offset: Some(7),
                title: None,
            },
        )
        .unwrap();
        let child = &split.sections[1].outline.as_ref().unwrap().nodes[0];
        assert_eq!(child.properties["name"], serde_json::json!("Hérité"));
        assert_eq!(child.properties["relation"], parent.properties["relation"]);
        assert!(!child.properties.contains_key("date"));
        assert_eq!(child.parent, None);
        assert_eq!(child.tag_ids, ["personne"]);
        apply(d.path(), Operation::Save { tag: tag("target") }).unwrap();
        let merged = apply(
            d.path(),
            Operation::Merge {
                id: "personne".into(),
                target: "target".into(),
            },
        )
        .unwrap();
        assert_eq!(merged.smart_tags[0].properties, definition.properties);
        let restored = history::restore(d.path(), &version.id).unwrap();
        assert_eq!(restored.smart_tags, [definition.clone()]);
        assert_eq!(
            restored.sections[0].outline.as_ref().unwrap().nodes[0].properties,
            parent.properties
        );
        assert_eq!(
            project::load(d.path()).unwrap().sections[0].outline,
            restored.sections[0].outline
        );
        let mut empty = restored.sections[0].clone();
        empty.text.clear();
        let mut alternate = parent.clone();
        alternate
            .properties
            .insert("name".into(), serde_json::json!("Autre"));
        empty.outline = Some(Outline {
            version: 1,
            nodes: vec![alternate],
        });
        let joined = super::super::outline::join(&restored.sections[0], &empty, "").unwrap();
        assert_eq!(
            joined.nodes.last().unwrap().properties["name"],
            serde_json::json!("Autre")
        );
        let mut invalid = definition;
        invalid.properties[1].default_value = Some(serde_json::json!("2026-02-30"));
        assert!(apply(d.path(), Operation::Save { tag: invalid }).is_err());
    }
    #[test]
    fn persists_merges_trash_and_restores_definitions_with_full_and_scoped_versions() {
        let d = tempfile::tempdir().unwrap();
        let p = project::create(d.path(), "Tags").unwrap();
        let id = p.sections[0].id.clone();
        for name in ["a", "b"] {
            apply(d.path(), Operation::Save { tag: tag(name) }).unwrap();
        }
        project::save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "Parent\nEnfant".into(),
                outline: Some(Outline {
                    version: 1,
                    nodes: vec![
                        node("parent", None, 0, &["a"]),
                        node("child", Some("parent"), 7, &["b", "a"]),
                    ],
                }),
            }],
        )
        .unwrap();
        let section = project::load(d.path()).unwrap().sections[0].clone();
        apply(
            d.path(),
            Operation::Assign {
                section: id.clone(),
                node: None,
                tag_ids: vec!["a".into()],
            },
        )
        .unwrap();
        project::update(d.path(), &section).unwrap();
        assert_eq!(project::load(d.path()).unwrap().sections[0].tag_ids, ["a"]);
        let full = history::capture(d.path(), "Complet", None).unwrap();
        let scoped = history::capture(d.path(), "Scène", Some(id.clone())).unwrap();
        let before = project::load(d.path()).unwrap();
        let assigned = apply(
            d.path(),
            Operation::Assign {
                section: id.clone(),
                node: Some("child".into()),
                tag_ids: vec!["a".into()],
            },
        )
        .unwrap();
        assert_eq!(
            assigned.sections[0].outline.as_ref().unwrap().nodes[1].tag_ids,
            ["a"]
        );
        assert_eq!(assigned.sections[0].text, before.sections[0].text);
        let mut renamed = tag("a");
        renamed.name = "Renommé".into();
        let renamed = apply(d.path(), Operation::Save { tag: renamed }).unwrap();
        assert_eq!(renamed.sections[0].tag_ids, ["a"]);
        assert_eq!(
            renamed
                .smart_tags
                .iter()
                .find(|t| t.id == "a")
                .unwrap()
                .name,
            "Renommé"
        );
        project::database(d.path())
            .unwrap()
            .execute("UPDATE sections SET trashed=1 WHERE id=?", [&id])
            .unwrap();
        let merged = apply(
            d.path(),
            Operation::Merge {
                id: "a".into(),
                target: "b".into(),
            },
        )
        .unwrap();
        assert_eq!(merged.trash[0].tag_ids, ["b"]);
        assert_eq!(
            merged.trash[0].outline.as_ref().unwrap().nodes[1].tag_ids,
            ["b"]
        );
        assert_eq!(merged.trash[0].text, before.sections[0].text);
        let restored = history::restore(d.path(), &scoped.id).unwrap();
        assert_eq!(restored.sections[0].tag_ids, ["a"]);
        assert!(restored.smart_tags.iter().any(|t| t.id == "a"));
        apply(d.path(), Operation::Delete { id: "a".into() }).unwrap();
        let restored = history::restore(d.path(), &full.id).unwrap();
        assert_eq!(restored.smart_tags, before.smart_tags);
        assert_eq!(restored.sections[0].outline, before.sections[0].outline);
        assert_eq!(
            std::fs::read_to_string(d.path().join("manuscrit").join(format!("{id}.md"))).unwrap(),
            "Parent\nEnfant"
        );
        assert_eq!(
            project::load(d.path()).unwrap().smart_tags,
            before.smart_tags
        );
    }
    #[test]
    fn splits_utf16_fragments_and_joins_with_stable_nodes_and_direct_tags() {
        let d = tempfile::tempdir().unwrap();
        let p = project::create(d.path(), "Tags").unwrap();
        let id = p.sections[0].id.clone();
        apply(d.path(), Operation::Save { tag: tag("a") }).unwrap();
        let text = "é🙂 début\nEnfant\nFin";
        project::save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: text.into(),
                outline: Some(Outline {
                    version: 1,
                    nodes: vec![
                        node("parent", None, 0, &["a"]),
                        node("child", Some("parent"), 10, &[]),
                        node("end", None, 17, &[]),
                    ],
                }),
            }],
        )
        .unwrap();
        let op = project::manuscript::Operation {
            action: "split".into(),
            source_id: id.clone(),
            target_id: None,
            offset: Some(4),
            title: None,
        };
        let split = project::manuscript::apply(d.path(), op.clone()).unwrap();
        for s in &split.sections {
            project::validate_outline(s.outline.as_ref().unwrap(), &s.text).unwrap();
        }
        let right = split.sections[1].outline.as_ref().unwrap();
        assert_eq!(right.nodes[0].tag_ids, ["a"]);
        assert_eq!(right.nodes[1].id, "child");
        assert_eq!(right.nodes[1].parent.as_ref(), Some(&right.nodes[0].id));
        let joined = project::manuscript::apply(
            d.path(),
            project::manuscript::Operation {
                action: "join".into(),
                target_id: Some(split.sections[1].id.clone()),
                ..op
            },
        )
        .unwrap();
        let s = &joined.sections[0];
        project::validate_outline(s.outline.as_ref().unwrap(), &s.text).unwrap();
        assert_eq!(
            s.outline
                .as_ref()
                .unwrap()
                .nodes
                .iter()
                .filter(|n| n.tag_ids.contains(&"a".into()))
                .count(),
            2
        );
        assert_eq!(s.outline.as_ref().unwrap().nodes.last().unwrap().id, "end");
    }
    #[test]
    fn migrates_schema_two_with_a_consistent_backup_and_isolates_variant_tags() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Ancien").unwrap();
        let c = project::database(d.path()).unwrap();
        c.execute_batch("ALTER TABLE sections DROP COLUMN tag_ids; DELETE FROM meta WHERE key='smart_tags'; PRAGMA user_version=2;").unwrap();
        drop(c);
        let migrated = project::load(d.path()).unwrap();
        assert!(migrated.smart_tags.is_empty());
        assert!(std::fs::read_dir(d.path().join("recuperation"))
            .unwrap()
            .any(|p| p
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("avant-smart-tags-")));
        apply(
            d.path(),
            Operation::Save {
                tag: tag("main-tag"),
            },
        )
        .unwrap();
        history::create_branch(d.path(), "Variante", None).unwrap();
        let active = history::history_state(d.path()).unwrap().active_branch;
        apply(
            d.path(),
            Operation::Save {
                tag: tag("variant-tag"),
            },
        )
        .unwrap();
        let main = history::switch_branch(d.path(), "main").unwrap();
        assert_eq!(
            main.smart_tags
                .iter()
                .map(|t| t.id.as_str())
                .collect::<Vec<_>>(),
            ["main-tag"]
        );
        assert_eq!(
            history::switch_branch(d.path(), &active)
                .unwrap()
                .smart_tags
                .len(),
            2
        );
        assert!(apply(
            d.path(),
            Operation::Save {
                tag: SmartTag {
                    properties: vec![],
                    name: "main-tag".into(),
                    ..tag("duplicate")
                }
            }
        )
        .is_err());
    }
}
