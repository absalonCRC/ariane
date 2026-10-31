use crate::{error::Result, model::Outline};
use std::collections::HashSet;

pub fn validate(outline: &Outline, text: &str) -> Result<()> {
    if outline.version != 1 || outline.nodes.is_empty() {
        return Err("Plan invalide : version ou nœuds manquants.".into());
    }
    let mut boundaries = HashSet::from([0usize]);
    let mut after_newline = HashSet::new();
    let mut offset = 0usize;
    for ch in text.chars() {
        offset += ch.len_utf16();
        boundaries.insert(offset);
        if ch == '\n' {
            after_newline.insert(offset);
        }
    }
    let mut ids = HashSet::new();
    let mut ancestors: Vec<&str> = Vec::new();
    let mut previous = None;
    for node in &outline.nodes {
        if node.id.trim().is_empty() || !ids.insert(node.id.as_str()) {
            return Err("Plan invalide : identifiant vide ou répété.".into());
        }
        if !boundaries.contains(&node.start)
            || node.start > offset
            || (previous.is_none() && node.start != 0)
            || previous.is_some_and(|start| node.start <= start || !after_newline.contains(&node.start))
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
