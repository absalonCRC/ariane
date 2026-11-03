use crate::model::Section;
use std::collections::{HashMap, HashSet};
/// Iterative adjacency traversal also terminates on a malformed cyclic tree.
pub(crate) fn descendant_ids<'a>(
    all: &'a [Section],
    roots: impl IntoIterator<Item = &'a str>,
) -> HashSet<String> {
    let mut children: HashMap<&str, Vec<&str>> = HashMap::new();
    for s in all {
        if let Some(parent) = &s.parent {
            children.entry(parent).or_default().push(&s.id);
        }
    }
    let mut pending: Vec<_> = roots.into_iter().collect();
    let mut ids = HashSet::new();
    while let Some(id) = pending.pop() {
        if ids.insert(id.to_owned()) {
            if let Some(next) = children.get(id) {
                pending.extend(next);
            }
        }
    }
    ids
}
