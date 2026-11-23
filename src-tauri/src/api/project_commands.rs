use super::{json, AppState, Request};
use crate::error::Result;
use crate::project;
use std::path::{Path, PathBuf};

pub(super) fn handle(
    _app: &tauri::AppHandle,
    state: &AppState,
    root: PathBuf,
    index: PathBuf,
    request: Request,
) -> Result<serde_json::Value> {
    match request {
        Request::EntityMentions { project_path } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(crate::memory::project_entity_mentions(&root, &index, || {
                super::root(state).is_ok_and(|active| active == root)
            })?)
        }
        Request::EntityCatalog { project_path } => {
            if Path::new(&project_path)!=root {return Err("Le projet actif a changé.".into());}
            crate::vaults::recover_card_edits(&root,&index)?;
            json(project::entities::read(&project::database(&root)?)?)
        }
        Request::EntityOperation { project_path, revision, operation } => {
            if Path::new(&project_path)!=root {return Err("Le projet actif a changé.".into());}
            json(project::entities::apply(&root,revision,operation)?)
        }
        Request::EntityMergePreview {project_path,source,target} => {
            if Path::new(&project_path)!=root {return Err("Le projet actif a changé.".into());}
            project::entities::preview(&root,&source,&target)
        }
        Request::EntityMergeHistory {project_path} => {
            if Path::new(&project_path)!=root {return Err("Le projet actif a changé.".into());}
            project::entities::history(&root)
        }
        Request::SavedViews {project_path} => {
            if Path::new(&project_path)!=root {return Err("Le projet actif a changé.".into());}
            project::saved_views::response(&project::database(&root)?)
        }
        Request::SaveView {project_path,token,view,remove} => {
            if Path::new(&project_path)!=root {return Err("Le projet actif a changé.".into());}
            project::saved_views::apply(&root,&token,view,remove)?;
            project::saved_views::response(&project::database(&root)?)
        }
        Request::UpdateSourceCard {project_path,source,fingerprint,title,kind,aliases,body} => {
            if Path::new(&project_path)!=root {return Err("Le projet actif a changé.".into());}
            json(crate::vaults::update_card(&root,&index,&source,&fingerprint,&title,&kind,&aliases,&body)?)
        }
        Request::SmartTagOperation { project_path, operation } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            json(project::tags::apply(&root, operation)?)
        }
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
        Request::ProjectBackup { project_path, destination } => {
            if Path::new(&project_path) != root {
                return Err("Le projet actif a changé.".into());
            }
            let destination = Path::new(&destination);
            state.grants.require("project-backup-destination", destination)?;
            json(project::backup::save(&root, destination)?)
        }
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
            pending_writing_aids,
        } => json(project::resolve_external(&root, &id, keep_local, pending, pending_writing_aids)?),
        _ => Err("Action invalide".into()),
    }
}
