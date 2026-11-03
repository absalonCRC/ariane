use crate::{error::Result, model::Outline};
use std::collections::HashSet;

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
        if node.id.trim().is_empty() || !ids.insert(node.id.as_str()) {
            return Err("Plan invalide : identifiant vide ou répété.".into());
        }
        while offset < node.start {
            let Some(ch) = chars.next() else { break; };
            offset += ch.len_utf16(); after_newline = ch == '\n';
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
