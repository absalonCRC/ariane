use crate::{
    error::{AppResult, Result},
    project::database,
};
use std::path::Path;
pub fn associate(root: &Path, section: &str, id: &str, payload: serde_json::Value) -> Result<()> {
    database(root)?
        .execute(
            "INSERT OR REPLACE INTO links(section,source,payload) VALUES(?,?,?)",
            rusqlite::params![section, id, payload.to_string()],
        )
        .app()?;
    Ok(())
}
pub fn links(root: &Path, section: &str) -> Result<Vec<serde_json::Value>> {
    let c = database(root)?;
    let mut q = c
        .prepare("SELECT payload FROM links WHERE section=?")
        .app()?;
    let rows = q.query_map([section], |r| r.get::<_, String>(0)).app()?;
    let mut out = vec![];
    for v in rows {
        out.push(serde_json::from_str(&v.app()?).app()?)
    }
    Ok(out)
}
