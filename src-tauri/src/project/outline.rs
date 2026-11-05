use crate::{error::Result, model::Outline};
use std::collections::HashSet;

/// UTF-16 offsets, just like CodeMirror. Only a cut passage receives a new ID.
pub fn split(
    outline: &Option<Outline>,
    offset: usize,
    tags: &[crate::model::SmartTag],
) -> (Option<Outline>, Option<Outline>) {
    let Some(outline) = outline else {
        return (None, None);
    };
    let left = outline
        .nodes
        .iter()
        .filter(|n| n.start < offset)
        .cloned()
        .collect::<Vec<_>>();
    let mut right = outline
        .nodes
        .iter()
        .filter(|n| n.start >= offset)
        .cloned()
        .collect::<Vec<_>>();
    let mut fragment_parent = None;
    if right.first().is_none_or(|n| n.start != offset) {
        if let Some(owner) = left.last() {
            let mut fragment = owner.clone();
            fragment.id = uuid::Uuid::new_v4().to_string();
            fragment_parent = Some((owner.id.clone(), fragment.id.clone()));
            fragment.start = offset;
            right.insert(0, fragment);
        }
    }
    let ids = right.iter().map(|n| n.id.clone()).collect::<HashSet<_>>();
    for node in &mut right {
        node.start -= offset;
        if let Some((old, new)) = &fragment_parent {
            if node.parent.as_ref() == Some(old) {
                node.parent = Some(new.clone());
            }
        }
        let mut parent = node.parent.clone();
        if parent.as_ref().is_some_and(|id| !ids.contains(id)) {
            let original_parent = parent.clone();
            while let Some(id) = parent {
                let Some(ancestor) = outline.nodes.iter().find(|n| n.id == id) else {
                    break;
                };
                for tag in &ancestor.tag_ids {
                    if !node.tag_ids.contains(tag) {
                        node.tag_ids.push(tag.clone());
                    }
                }
                parent = ancestor.parent.clone();
            }
            // A root cut away from its ancestors keeps the values it inherited.
            // Nearest explicit values win; non-inheritable fields stay on their owner.
            let mut parent = original_parent;
            while let Some(id) = parent {
                let Some(ancestor) = outline.nodes.iter().find(|n| n.id == id) else {
                    break;
                };
                for tag in tags {
                    let mut current = Some(ancestor);
                    let mut applies = false;
                    while let Some(owner) = current {
                        if owner.tag_ids.contains(&tag.id) {
                            applies = true;
                            break;
                        }
                        current = owner
                            .parent
                            .as_ref()
                            .and_then(|id| outline.nodes.iter().find(|n| n.id == *id));
                    }
                    if applies {
                        for field in tag.properties.iter().filter(|f| f.inherit != Some(false)) {
                            if !node.properties.contains_key(&field.id) {
                                if let Some(value) = ancestor.properties.get(&field.id) {
                                    node.properties.insert(field.id.clone(), value.clone());
                                    if let Some(values) = ancestor.property_conflicts.get(&field.id)
                                    {
                                        node.property_conflicts
                                            .insert(field.id.clone(), values.clone());
                                    }
                                }
                            }
                        }
                    }
                }
                parent = ancestor.parent.clone();
            }
            node.parent = None;
        }
    }
    (
        Some(Outline {
            version: 1,
            nodes: left,
        }),
        Some(Outline {
            version: 1,
            nodes: right,
        }),
    )
}

fn merge_properties(owner: &mut crate::model::OutlineNode, other: &crate::model::OutlineNode) {
    for (id, value) in &other.properties {
        if let Some(existing) = owner.properties.get(id) {
            if existing != value {
                let values = owner.property_conflicts.entry(id.clone()).or_default();
                for candidate in [existing, value] {
                    if !values.contains(candidate) {
                        values.push(candidate.clone());
                    }
                }
            }
        } else {
            owner.properties.insert(id.clone(), value.clone());
        }
    }
    for (id, choices) in &other.property_conflicts {
        let values = owner.property_conflicts.entry(id.clone()).or_default();
        for choice in choices {
            if !values.contains(choice) {
                values.push(choice.clone());
            }
        }
    }
}

pub fn join(
    first: &crate::model::Section,
    second: &crate::model::Section,
    separator: &str,
) -> Option<Outline> {
    if first.outline.is_none() && second.outline.is_none() {
        return None;
    }
    let nodes_for = |section: &crate::model::Section| {
        section.outline.clone().unwrap_or_else(|| Outline {
            version: 1,
            nodes: vec![crate::model::OutlineNode {
                properties: Default::default(),
                property_conflicts: Default::default(),
                id: uuid::Uuid::new_v4().to_string(),
                parent: None,
                start: 0,
                tag_ids: vec![],
            }],
        })
    };
    let mut first_nodes = nodes_for(first).nodes;
    let mut second_nodes = nodes_for(second).nodes;
    if second.text.is_empty() && !first.text.is_empty() {
        if let Some(last) = first_nodes.last_mut() {
            for node in second_nodes {
                merge_properties(last, &node);
                for tag in node.tag_ids {
                    if !last.tag_ids.contains(&tag) {
                        last.tag_ids.push(tag);
                    }
                }
            }
        }
        return Some(Outline {
            version: 1,
            nodes: first_nodes,
        });
    }
    let offset = first.text.encode_utf16().count() + separator.encode_utf16().count();
    // Empty leading texts have no distinct passage to keep at the same offset.
    if offset == 0 {
        if let Some(node) = second_nodes.first_mut() {
            for previous in &first_nodes {
                merge_properties(node, previous);
                for tag in &previous.tag_ids {
                    if !node.tag_ids.contains(tag) {
                        node.tag_ids.push(tag.clone());
                    }
                }
            }
        }
        first_nodes.clear();
    }
    let mut ids = first_nodes
        .iter()
        .map(|n| n.id.clone())
        .collect::<HashSet<_>>();
    let mut remapped = std::collections::HashMap::new();
    for node in &mut second_nodes {
        if !ids.insert(node.id.clone()) {
            let old = node.id.clone();
            node.id = uuid::Uuid::new_v4().to_string();
            remapped.insert(old, node.id.clone());
            ids.insert(node.id.clone());
        }
        if let Some(parent) = node.parent.as_ref().and_then(|id| remapped.get(id)) {
            node.parent = Some(parent.clone());
        }
        node.start += offset;
    }
    first_nodes.extend(second_nodes);
    Some(Outline {
        version: 1,
        nodes: first_nodes,
    })
}

pub fn validate(outline: &Outline, text: &str) -> Result<()> {
    if outline.version != 1 || outline.nodes.is_empty() {
        return Err("Plan invalide : version ou nœuds manquants.".into());
    }
    let mut chars = text.chars();
    let mut offset = 0usize;
    let mut after_newline = false;
    let mut ids = HashSet::new();
    let mut ancestors: Vec<&str> = Vec::new();
    let mut previous = None;
    for node in &outline.nodes {
        if node.properties.len() > 256 || node.property_conflicts.len() > 256 {
            return Err("Trop de propriétés dans ce passage.".into());
        }
        for (id, value) in &node.properties {
            if id.is_empty() || id.len() > 128 {
                return Err("Propriété de passage invalide.".into());
            }
            super::tags::validate_property_value(value)?;
        }
        for values in node.property_conflicts.values() {
            if values.len() > 100 {
                return Err("Trop de valeurs en conflit.".into());
            }
            for value in values {
                super::tags::validate_property_value(value)?;
            }
        }
        if node.id.trim().is_empty() || !ids.insert(node.id.as_str()) {
            return Err("Plan invalide : identifiant vide ou répété.".into());
        }
        while offset < node.start {
            let Some(ch) = chars.next() else {
                break;
            };
            offset += ch.len_utf16();
            after_newline = ch == '\n';
        }
        if node.start != offset
            || (previous.is_none() && node.start != 0)
            || previous.is_some_and(|start| node.start <= start || !after_newline)
        {
            return Err("Plan invalide : position de nœud hors d'une ligne du texte.".into());
        }
        if let Some(parent) = node.parent.as_deref() {
            let Some(index) = ancestors.iter().position(|id| *id == parent) else {
                return Err("Plan invalide : parent absent ou hors de la branche.".into());
            };
            ancestors.truncate(index + 1);
        } else {
            ancestors.clear();
        }
        ancestors.push(&node.id);
        previous = Some(node.start);
    }
    Ok(())
}
