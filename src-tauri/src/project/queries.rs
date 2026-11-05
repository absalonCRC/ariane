use crate::{
    error::{AppResult, Result},
    model::*,
};
use rusqlite::{Connection, OptionalExtension, Row};
pub fn sections(c: &Connection) -> Result<Vec<Section>> {
    let mut q = c.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included,tag_ids FROM sections WHERE trashed=0 ORDER BY position,id").app()?;
    let rows = q.query_map([], row_section).app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}

pub fn all_sections(c: &Connection) -> Result<Vec<Section>> {
    let mut q=c.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included,tag_ids FROM sections ORDER BY position,id").app()?;
    let rows = q.query_map([], row_section).app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}

pub fn section(c: &Connection, id: &str) -> Result<Option<Section>> {
    super::validate_id(id)?;
    c.query_row("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included,tag_ids FROM sections WHERE id=? AND trashed=0", [id], row_section)
        .optional().app()
}

pub(crate) fn row_section(r: &Row<'_>) -> rusqlite::Result<Section> {
    let id: String = r.get(0)?;
    super::validate_id(&id).map_err(|message| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                message,
            )),
        )
    })?;
    let raw: Option<String> = r.get(10)?;
    let outline = raw
        .map(|json| {
            serde_json::from_str(&json).map_err(|err| {
                rusqlite::Error::FromSqlConversionFailure(
                    10,
                    rusqlite::types::Type::Text,
                    Box::new(err),
                )
            })
        })
        .transpose()?;
    Ok(Section {
        id,
        tag_ids: serde_json::from_str(&r.get::<_, String>(14)?).map_err(|e| rusqlite::Error::FromSqlConversionFailure(14, rusqlite::types::Type::Text, Box::new(e)))?,
        parent: r.get(1)?,
        title: r.get(2)?,
        kind: r.get(3)?,
        position: r.get(4)?,
        text: r.get(5)?,
        revision: r.get(6)?,
        synopsis: r.get(7)?,
        status: r.get(8)?,
        goal: r.get(9)?,
        outline,
        role: r.get(11)?,
        trashed: r.get(12)?,
        included: r.get(13)?,
    })
}
