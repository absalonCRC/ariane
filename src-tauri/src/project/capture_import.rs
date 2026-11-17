use crate::{
    error::{AppResult, Result},
    inbox::model::{Capture, Destination},
};
use rusqlite::{params, OptionalExtension};
use std::path::Path;

pub fn identity(root: &Path) -> Result<String> {
    super::database(root)?
        .query_row("SELECT value FROM meta WHERE key='project_id'", [], |r| {
            r.get(0)
        })
        .app()
}
/// The receipt is deliberately outside manuscript snapshots and writing branches.
pub fn apply(root: &Path, capture: &Capture, destination: &Destination) -> Result<bool> {
    super::with_lock(root, || {
        let mut c = super::database(root)?;
        if identity(root)? != destination.project_id {
            return Err("Le dossier de destination a été remplacé.".into());
        }
        let encoded = serde_json::to_string(destination).app()?;
        let previous: Option<String> = c
            .query_row(
                "SELECT payload FROM capture_receipts WHERE capture_id=?",
                [&capture.id],
                |r| r.get(0),
            )
            .optional()
            .app()?;
        if let Some(previous) = previous {
            if previous != encoded {
                return Err("Cette capture possède déjà une autre destination.".into());
            }
            return Ok(false);
        }
        if crate::history::active_id(&c)? != destination.branch_id {
            return Err("La variante de destination a changé.".into());
        }
        let tx = c.transaction().app()?;
        let position: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(position),0)+1 FROM sections",
                [],
                |r| r.get(0),
            )
            .app()?;
        tx.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,role,included) VALUES(?,NULL,?,'scene',?,?,1,'note',0)",params![destination.section_id,destination.title,position,capture.text]).app()?;
        tx.execute(
            "INSERT INTO capture_receipts VALUES(?,?,?)",
            params![destination.operation_id, capture.id, encoded],
        )
        .app()?;
        tx.execute(
            "INSERT INTO mirror_pending(id,base) VALUES(?,'')",
            [&destination.section_id],
        )
        .app()?;
        tx.commit().app()?;
        Ok(true)
    })
}
