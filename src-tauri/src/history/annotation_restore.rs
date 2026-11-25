use crate::{
    error::{AppResult, Result},
    project::annotations::Annotation,
};
use std::collections::{HashMap, HashSet};

pub(super) fn scoped(
    current: &mut Vec<(String, String)>,
    saved: Vec<(String, String)>,
    scope: &HashSet<String>,
) -> Result<()> {
    let mut prior: HashMap<_, _> = saved.into_iter().collect();
    let mut result = Vec::new();
    for (id, raw) in current.drain(..) {
        let mut item: Annotation = serde_json::from_str(&raw).app()?;
        let origin = scope.contains(&item.passage.section);
        let destination = item
            .peer
            .as_ref()
            .is_some_and(|p| scope.contains(&p.section));
        let previous = prior.remove(&id);
        if item.peer.is_none() || (origin && destination) {
            if let Some(raw) = previous {
                result.push((id, raw))
            } else if !origin {
                result.push((id, raw))
            }
            continue;
        }
        if let Some(raw) = previous {
            let old: Annotation = serde_json::from_str(&raw).app()?;
            if origin || scope.contains(&old.passage.section) {
                item.passage = old.passage;
            }
            if destination
                || old
                    .peer
                    .as_ref()
                    .is_some_and(|p| scope.contains(&p.section))
            {
                item.peer = old.peer;
            }
        } else if origin {
            item.passage.detached = true;
        } else if destination {
            if let Some(peer) = item.peer.as_mut() {
                peer.detached = true
            }
        } else {
            result.push((id, raw));
            continue;
        }
        item.revision += 1;
        result.push((id, serde_json::to_string(&item).app()?));
    }
    result.extend(prior);
    *current = result;
    Ok(())
}
