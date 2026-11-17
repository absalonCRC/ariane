use super::{model::*, storage};
use crate::{
    error::{AppResult, Result},
    project,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub fn begin(c: &Connection, request: &Transfer) -> Result<(Capture, Destination)> {
    storage::validate_id(&request.operation_id)?;
    let capture = storage::get(c, &request.capture_id)?;
    let input = serde_json::to_string(request).app()?;
    let old: Option<(String, String)> = c
        .query_row(
            "SELECT input,destination FROM transfers WHERE capture=?",
            [&capture.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .app()?;
    if let Some((old, destination)) = old {
        // The UI can recover a lost response without knowing the original operation ID.
        let mut previous: Transfer = serde_json::from_str(&old).app()?;
        previous.operation_id = request.operation_id.clone();
        if serde_json::to_string(&previous).app()? != input {
            return Err(
                "Cette capture possède déjà un rangement en attente. Retrouvez sa destination."
                    .into(),
            );
        }
        return Ok((capture, serde_json::from_str(&destination).app()?));
    }
    if capture.status != "ready" || capture.revision != request.capture_revision {
        return Err("La capture a changé. Rechargez la boîte de réception.".into());
    }
    if request.title.trim().is_empty() || request.title.len() > 4096 {
        return Err("Titre de capture invalide.".into());
    }
    let destination = Destination {
        operation_id: request.operation_id.clone(),
        project_path: request.project_path.clone(),
        project_id: request.project_id.clone(),
        branch_id: request.branch_id.clone(),
        section_id: uuid::Uuid::new_v4().to_string(),
        title: request.title.trim().into(),
        fingerprint: project::hash(&capture.text),
    };
    c.execute(
        "INSERT INTO transfers VALUES(?,?,?,?)",
        params![
            request.operation_id,
            capture.id,
            input,
            serde_json::to_string(&destination).app()?
        ],
    )
    .app()?;
    Ok((capture, destination))
}
pub fn complete(c: &Connection, capture: &Capture, destination: &Destination) -> Result<Capture> {
    let mut value = storage::get(c, &capture.id)?;
    if project::hash(&value.text) != destination.fingerprint {
        return Err("La capture a changé pendant le rangement.".into());
    }
    if value.status != "filed" {
        value.revision += 1;
        value.updated_at = chrono::Utc::now().to_rfc3339();
    }
    value.status = "filed".into();
    value.destination = Some(destination.clone());
    storage::put(c, &value)?;
    Ok(value)
}
pub fn apply(c: &Connection, root: &Path, request: &Transfer) -> Result<Capture> {
    if root != Path::new(&request.project_path) {
        return Err("Le projet actif a changé.".into());
    }
    if project::capture_import::identity(root)? != request.project_id {
        return Err("Le dossier de destination a été remplacé.".into());
    }
    let (capture, destination) = begin(c, request)?;
    project::capture_import::apply(root, &capture, &destination)?;
    // Try the existing mirror recovery protocol after the transactional receipt.
    // A disk error cannot turn the committed text into a failed import.
    let mirror_error = project::load(root).is_err();
    let mut filed = complete(c, &capture, &destination)?;
    let pending: i64 = project::database(root)?
        .query_row(
            "SELECT count(*) FROM mirror_pending WHERE id=?",
            [&destination.section_id],
            |r| r.get(0),
        )
        .app()?;
    filed.mirror_pending = Some(mirror_error || pending > 0);
    Ok(filed)
}
