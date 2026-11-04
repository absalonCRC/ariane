use super::{json, AppState, Request};
use crate::error::{AppResult, Result};
use crate::memory_engine::EntityEngine;
use crate::{enrichment, memory, memory_evidence, project, vaults};
use std::path::{Path, PathBuf};

pub(super) fn handle(
    _app: &tauri::AppHandle,
    state: &AppState,
    root: PathBuf,
    index: PathBuf,
    request: Request,
) -> Result<serde_json::Value> {
    match request {
        Request::MemoryQueue {
            project_path,
            section,
            node,
            revision,
            depth,
            semantic,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let Ok(_job) = state.memory_job.try_lock() else {
                return Ok(json!({"busy":true}));
            };
            let queue = memory::Queue {
                root: &root,
                index: &index,
                resources: &state.resources,
                engine: &state.engine,
                activity: &state.memory_activity,
                critical_pressure: crate::memory_engine::critical_memory_pressure(),
            };
            let result = queue.run(&section, node.as_deref(), revision, depth, semantic)?;
            if root != super::root(state)? {
                return Ok(json!({"stale":true}));
            }
            Ok(result)
        }
        Request::MemoryEntities {
            project_path,
            section,
            node,
            revision,
        } => {
            if Path::new(&project_path) != root {
                return Ok(json!({"stale":true}));
            }
            if !EntityEngine::available(&state.data, &state.resources) {
                return Ok(json!({"available":false,"pending":false}));
            }
            if crate::memory_engine::critical_memory_pressure() {
                return Ok(json!({"deferred":true,"pending":true,"retryMs":5000}));
            }
            if state.memory_activity.ner_blocked() {
                return Ok(json!({"deferred":true,"pending":true,"retryMs":500}));
            }
            let enabled = || -> Result<bool> {
                let c = project::database(&root)?;
                let settings: String = c
                    .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
                        r.get(0)
                    })
                    .app()?;
                Ok(
                    serde_json::from_str::<serde_json::Value>(&settings).app()?["enrichment"]
                        .as_bool()
                        != Some(false)
                        && project::section(&c, &section)?.is_some_and(|s| s.revision == revision),
                )
            };
            if !enabled()? {
                return Ok(json!({"stale":true}));
            }
            let Ok(mut worker) = state.entity_engine.try_lock() else {
                return Ok(json!({"busy":true,"pending":true}));
            };
            {
                let Ok(_job) = state.memory_job.try_lock() else {
                    return Ok(json!({"busy":true,"pending":true}));
                };
                memory::sync_idle(&root, Some(&section), || state.memory_activity.is_writing())?;
            }
            let types = serde_json::to_value(vaults::classification_types(&root, &index)?).app()?;
            memory::prepare_types(&root, &types)?;
            let mut analyzed = false;
            let mut deferred = false;
            if let Some(passage) = memory::pending_entities_at(&root, &section, node.as_deref())? {
                let output = worker.request(
                    &state.data,
                    &state.resources,
                    &state.memory_activity,
                    &passage.text,
                    types.clone(),
                )?;
                if root != super::root(state)?
                    || !enabled()?
                    || types
                        != serde_json::to_value(vaults::classification_types(&root, &index)?)
                            .app()?
                {
                    return Ok(json!({"stale":true}));
                }
                if let Some(output) = output {
                    analyzed = memory::apply_entities(&root, &passage, &output)?;
                } else {
                    deferred = true;
                }
            }
            let context = memory::context(&root, &section, node.as_deref(), 0)?;
            Ok(
                json!({"available":true,"analyzed":analyzed,"deferred":deferred,"retryMs":5000,
                        "pending":memory::pending_entities_at(&root,&section,node.as_deref())?.is_some(),
                        "entities":context["entities"],"anchorHash":context["anchorHash"]}),
            )
        }
        Request::MemoryContext {
            project_path,
            section,
            node,
            depth,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            memory::context(&root, &section, node.as_deref(), depth)
        }
        Request::InlineEntities {
            project_path,
            section,
            revision,
            auto_create,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            if auto_create {
                let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
                json(memory::resolve_inline_entities(
                    &root, &index, &section, revision,
                )?)
            } else {
                json(memory::inline_entities(&root, &index, &section, revision)?)
            }
        }
        Request::UpdateSourceAliases {
            project_path,
            source,
            fingerprint,
            aliases,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
            json(vaults::update_aliases(
                &root,
                &index,
                &source,
                &fingerprint,
                &aliases,
            )?)
        }
        Request::ResolveDetectedEntity {
            project_path,
            section,
            revision,
            from,
            to,
            source,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
            json(memory::resolve_detected_entity(
                &root, &index, &section, revision, from, to, &source,
            )?)
        }
        Request::CreateDetectedEntity {
            project_path,
            section,
            revision,
            from,
            to,
            kind,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
            let source =
                memory::create_detected_entity(&root, &index, &section, revision, from, to, &kind)?;
            enrichment::run(&root, &index)?;
            let mut decorated = vec![source];
            enrichment::decorate(&root, &index, &mut decorated)?;
            json(decorated.remove(0))
        }
        Request::MemoryEntity { project_path, id } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            memory::sync(&root)?;
            memory::entity(&root, &id)
        }
        Request::MemoryList { project_path } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            memory::sync(&root)?;
            memory::list(&root)
        }
        Request::MemoryDismiss {
            project_path,
            id,
            hash,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            memory::dismiss(&root, &id, &hash)?;
            Ok(json!(true))
        }
        Request::MemorySession {
            project_path,
            value,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            memory::session(&root, value)
        }
        Request::MemorySource { id, fingerprint } => {
            let available = vaults::list(&root, &index)?;
            let source = vaults::source(&index, &id, &available)?;
            if fingerprint.is_some_and(|f| f != source.fingerprint)
                || !memory_evidence::fresh(&index, &source, &available)
            {
                return Err(
                    "Cette source a changé ou n’est plus disponible. Actualisez son index.".into(),
                );
            }
            Ok(json!(source))
        }
        Request::Enrich { project_path } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let _guard = state.enriching.lock().map_err(|e| e.to_string())?;
            enrichment::run(&root, &index)
        }
        Request::IgnoreEnrichment {
            project_path,
            source,
            evidence,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            enrichment::ignore(&root, &index, &source, evidence.as_deref())?;
            let mut sources = vec![vaults::source(
                &index,
                &source,
                &vaults::list(&root, &index)?,
            )?];
            enrichment::decorate(&root, &index, &mut sources)?;
            json(sources.remove(0))
        }
        _ => Err("Action invalide".into()),
    }
}
