use super::{json, AppState, Request};
use crate::error::Result;
use crate::{enrichment, memory, project, retrieval, vaults};
use std::path::{Path, PathBuf};
fn visible_margin_pins(
    root: &std::path::Path,
    index: &std::path::Path,
    section: &str,
) -> crate::error::Result<Vec<crate::model::Source>> {
    let available = crate::vaults::list(root, index)?;
    Ok(crate::project::links::margin_pins(root, section)?
        .into_iter()
        .filter_map(|s| crate::vaults::source(index, &s.id, &available).ok())
        .collect())
}

pub(super) fn handle(
    _app: &tauri::AppHandle,
    state: &AppState,
    root: PathBuf,
    index: PathBuf,
    request: Request,
) -> Result<serde_json::Value> {
    match request {
        Request::Suggest {
            text,
            depth,
            allow_end,
            anchor,
        } => {
            let _priority = state.memory_activity.foreground();
            memory::results::reconcile(&root, &index)?;
            let generation = memory::results::source_generation(&root, &index)?;
            let identity = anchor
                .filter(|a| a.len() <= 512)
                .unwrap_or_else(|| project::hash(&text));
            let key = format!(
                "sources:{}:{}:{}:{}",
                crate::inference::MODEL_ID,
                depth.min(5),
                allow_end,
                identity
            );
            let hash = project::hash(&text);
            let mut sources =
                if let Some(cached) = memory::results::source_hits(&root, &index, &key, &hash)? {
                    cached
                } else {
                    let sources = retrieval::suggest(
                        &root,
                        &index,
                        &state.resources,
                        &state.engine,
                        &text,
                        depth.min(5),
                        allow_end,
                    )?;
                    memory::results::put_source_hits(
                        &root,
                        &index,
                        &key,
                        &hash,
                        &text,
                        &sources,
                        &generation,
                    )?;
                    sources
                };
            if memory::results::catalog(&root, &index)? != generation.catalog
                || (sources.is_empty()
                    && memory::results::vector_generation(&index)? != generation.vectors)
            {
                return Err("Les sources ont changé. Relancez la recherche.".into());
            }
            enrichment::decorate(&root, &index, &mut sources)?;
            json(sources)
        }
        Request::Search { query } => {
            let _priority = state.memory_activity.foreground();
            let mut sources =
                retrieval::search(&root, &index, &state.resources, &state.engine, &query, true)?;
            enrichment::decorate(&root, &index, &mut sources)?;
            json(sources)
        }
        Request::Source { id } => {
            let mut sources = vec![vaults::source(&index, &id, &vaults::list(&root, &index)?)?];
            enrichment::decorate(&root, &index, &mut sources)?;
            json(sources.remove(0))
        }
        Request::SourceFile { id } => state.source_files.grant(state, &root, &id),
        Request::MarginPins {
            project_path,
            section,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(visible_margin_pins(&root, &index, &section)?)
        }
        Request::PinSource {
            project_path,
            section,
            id,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let source = vaults::source(&index, &id, &vaults::list(&root, &index)?)?;
            project::links::pin(&root, &section, &source)?;
            json(visible_margin_pins(&root, &index, &section)?)
        }
        Request::UnpinSource {
            project_path,
            section,
            id,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            project::links::unpin(&root, &section, &id)?;
            json(visible_margin_pins(&root, &index, &section)?)
        }
        Request::Associate {
            section,
            id,
            payload,
        } => json(project::links::associate(&root, &section, &id, payload)?),
        Request::Links { section } => json(project::links::links(&root, &section)?),
        Request::Cite { id, payload } => {
            project::links::cite(&root, &id, payload)?;
            Ok(json!(true))
        }
        _ => Err("Action invalide".into()),
    }
}
