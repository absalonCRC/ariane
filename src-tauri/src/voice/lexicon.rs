//! Rebuilt from the current scoped index. No stale global/project-shared vocabulary.
use crate::{
    error::{AppResult, Result},
    vaults,
};
use std::{collections::BTreeMap, path::Path};
pub fn snapshot(root: &Path, index: &Path) -> Result<Vec<String>> {
    let available: Vec<_> = vaults::list(root, index)?
        .into_iter()
        .filter(|v| v.available)
        .collect();
    let mut names = BTreeMap::<String, Option<String>>::new();
    let c = vaults::index_db(index)?;
    let owner = available
        .iter()
        .find(|v| v.owned)
        .map(|v| v.id.as_str())
        .unwrap_or("");
    let mut q=c.prepare(&format!("SELECT json_extract(payload,'$.title'),json_extract(payload,'$.aliases') FROM sources s WHERE {} AND lower(json_extract(payload,'$.kind'))<>'note' ORDER BY CASE WHEN vault=?2 THEN 0 ELSE 1 END,id LIMIT 8192",vaults::SCOPE_SQL)).app()?;
    let rows = q
        .query_map(
            rusqlite::params![vaults::scope_json(&available)?, owner],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .app()?;
    for row in rows {
        let (title, aliases) = row.app()?;
        let aliases: Vec<String> = aliases
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        for name in std::iter::once(title).chain(aliases) {
            if names.len() >= 8192 {
                break;
            }
            if name.chars().count() > 100 || name.split_whitespace().count() > 5 {
                continue;
            }
            let key = vaults::parse::normalize(&name);
            match names.entry(key) {
                std::collections::btree_map::Entry::Vacant(e) => {
                    e.insert(Some(name));
                }
                std::collections::btree_map::Entry::Occupied(mut e) => {
                    if e.get().as_ref() != Some(&name) {
                        e.insert(None);
                    }
                }
            }
        }
    }
    Ok(names.into_values().flatten().collect())
}
pub fn candidates(raw: &str, names: &[String]) -> Vec<String> {
    let text = vaults::parse::normalize(raw);
    names
        .iter()
        .filter(|n| {
            let target = vaults::parse::normalize(n);
            !text.contains(&target)
                && target
                    .split_whitespace()
                    .any(|w| w.len() > 3 && text.split_whitespace().any(|s| distance(s, w) <= 1))
        })
        .take(12)
        .cloned()
        .collect()
}
fn distance(a: &str, b: &str) -> usize {
    if a.chars().count().abs_diff(b.chars().count()) > 1 {
        return 2;
    }
    let b: Vec<_> = b.chars().collect();
    let mut row: Vec<_> = (0..=b.len()).collect();
    for (i, x) in a.chars().enumerate() {
        let mut next = vec![i + 1];
        for (j, y) in b.iter().enumerate() {
            next.push(
                (next[j] + 1)
                    .min(row[j + 1] + 1)
                    .min(row[j] + usize::from(x != *y)),
            );
        }
        row = next;
    }
    row[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn follows_owned_notes_and_scope_without_a_manual_lexicon_refresh() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        let index = root.join("index");
        crate::project::create(root, "Lexique").unwrap();
        let note = vaults::create_quick_note(root, &index, "Maëlys").unwrap();
        assert!(snapshot(root, &index).unwrap().is_empty());
        vaults::apply_note_type(root, &index, &note, "Personne").unwrap();
        assert_eq!(snapshot(root, &index).unwrap(), vec!["Maëlys"]);
        let vault = vaults::list(root, &index)
            .unwrap()
            .into_iter()
            .find(|v| v.owned)
            .unwrap();
        vaults::set_scope(root, &vault.id, vec!["Autres".into()]).unwrap();
        assert!(snapshot(root, &index).unwrap().is_empty());
    }
}
