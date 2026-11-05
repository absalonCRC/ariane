use super::{json, AppState, Request};
use crate::error::Result;
use crate::project;
use std::path::{Path, PathBuf};

pub(super) fn handle(
    _app: &tauri::AppHandle,
    state: &AppState,
    root: PathBuf,
    _index: PathBuf,
    request: Request,
) -> Result<serde_json::Value> {
    match request {
        Request::NoteActivity {
            project_path,
            before,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            project::activity::list(&root, before)
        }
        Request::RecordNoteActivity {
            project_path,
            value,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            project::activity::record(&root, value)
        }
        Request::Annotations { project_path } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(project::annotations::list(&root)?)
        }
        Request::AddAnnotation {
            project_path,
            section,
            revision,
            from,
            to,
            note,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(project::annotations::create(
                &root, &section, revision, from, to, &note,
            )?)
        }
        Request::UpdateAnnotation {
            project_path,
            id,
            revision,
            note,
            done,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(project::annotations::update(
                &root, &id, revision, &note, done,
            )?)
        }
        Request::ManuscriptOperation {
            project_path,
            operation,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(project::manuscript::apply(&root, operation)?)
        }
        Request::ImportIntoProject {
            source,
            project_path,
        } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            state.grants.require("import", Path::new(&source))?;
            let report = crate::import::import_into(&root, &state.resources, Path::new(&source))?;
            Ok(json!({"project":project::load(&root)?,"report":report}))
        }
        Request::LibraryOperation { operation } => json(project::library::apply(&root, operation)?),
        Request::Save { patches } => {
            state.memory_activity.writing(true);
            let report = project::save_report(&root, patches)?;
            Ok(
                json!({"sections":report.sections.iter().map(|s| json!({"id":s.id,"revision":s.revision})).collect::<Vec<_>>(),"mirrorErrors":report.mirror_errors}),
            )
        }
        Request::Add {
            parent,
            title,
            kind,
            role,
        } => json(
            project::library::apply(
                &root,
                project::library::Operation {
                    action: "add".into(),
                    ids: vec![],
                    target: parent,
                    placement: None,
                    role,
                    title: Some(title),
                    kind: Some(kind),
                    included: None,
                },
            )?
            .sections,
        ),
        Request::Update { section } => json(project::update(&root, &section)?),
        Request::Reorder { ids, id, parent } => json(project::reorder(&root, &ids, &id, parent)?),
        Request::Settings { value } => {
            let enabled = value["enrichment"].as_bool();
            project::settings(&root, value)?;
            if enabled == Some(false) {
                state.memory_activity.cancel_entities();
            }
            json(())
        }
        Request::ResolveExternal {
            id,
            keep_local,
            pending,
        } => json(project::resolve_external(&root, &id, keep_local, pending)?),
        _ => Err("Action invalide".into()),
    }
}
