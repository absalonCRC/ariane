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

fn pin_database(root: &Path) -> Result<rusqlite::Connection> {
    let c = database(root)?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS margin_pins(section TEXT,source TEXT,PRIMARY KEY(section,source));").app()?;
    Ok(c)
}
fn valid_scene(root: &Path, section: &str) -> Result<()> {
    let scene = super::section(&database(root)?, section)?.ok_or("Texte introuvable.")?;
    if scene.kind != "scene" || scene.trashed {
        return Err("Choisissez un texte ouvert pour ajouter une fiche.".into());
    }
    Ok(())
}
pub fn margin_pins(root: &Path, section: &str) -> Result<Vec<crate::model::Source>> {
    valid_scene(root, section)?;
    let c = pin_database(root)?;
    let mut q=c.prepare("SELECT l.payload FROM links l JOIN margin_pins p ON p.section=l.section AND p.source=l.source WHERE l.section=? ORDER BY p.rowid").app()?;
    let rows = q.query_map([section], |r| r.get::<_, String>(0)).app()?;
    rows.map(|row| serde_json::from_str(&row.app()?).app())
        .collect()
}
pub fn pin(
    root: &Path,
    section: &str,
    source: &crate::model::Source,
) -> Result<Vec<crate::model::Source>> {
    valid_scene(root, section)?;
    let mut c = pin_database(root)?;
    let tx = c.transaction().app()?;
    tx.execute(
        "INSERT OR REPLACE INTO links(section,source,payload) VALUES(?,?,?)",
        rusqlite::params![section, source.id, serde_json::to_string(source).app()?],
    )
    .app()?;
    tx.execute(
        "INSERT OR IGNORE INTO margin_pins(section,source) VALUES(?,?)",
        rusqlite::params![section, source.id],
    )
    .app()?;
    tx.commit().app()?;
    margin_pins(root, section)
}
pub fn unpin(root: &Path, section: &str, id: &str) -> Result<Vec<crate::model::Source>> {
    valid_scene(root, section)?;
    pin_database(root)?
        .execute(
            "DELETE FROM margin_pins WHERE section=? AND source=?",
            rusqlite::params![section, id],
        )
        .app()?;
    margin_pins(root, section)
}

pub fn cite(root: &Path, id: &str, payload: serde_json::Value) -> Result<()> {
    database(root)?
        .execute(
            "INSERT OR REPLACE INTO citations VALUES(?,?)",
            rusqlite::params![id, payload.to_string()],
        )
        .app()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{project, vaults};
    #[test]
    fn pins_survive_reopening_and_removal_keeps_the_source_and_other_links() {
        let temp = tempfile::tempdir().unwrap();
        vaults::create_project(temp.path(), "Test", None).unwrap();
        let scene = project::load(temp.path())
            .unwrap()
            .sections
            .into_iter()
            .find(|s| s.kind == "scene")
            .unwrap();
        let file = vaults::create_entity(temp.path(), "lieu", "Toulouse", "").unwrap();
        let index = temp.path().join("sources.sqlite");
        let source = vaults::index_created_entity(temp.path(), &index, &file).unwrap();
        associate(
            temp.path(),
            &scene.id,
            "other",
            serde_json::json!({"id":"other"}),
        )
        .unwrap();
        pin(temp.path(), &scene.id, &source).unwrap();
        pin(temp.path(), &scene.id, &source).unwrap();
        assert_eq!(margin_pins(temp.path(), &scene.id).unwrap().len(), 1);
        assert_eq!(links(temp.path(), &scene.id).unwrap().len(), 2);
        assert!(unpin(temp.path(), &scene.id, &source.id)
            .unwrap()
            .is_empty());
        assert_eq!(links(temp.path(), &scene.id).unwrap().len(), 2);
        assert!(file.exists());
        assert!(pin(temp.path(), "missing", &source).is_err());
        database(temp.path())
            .unwrap()
            .execute("UPDATE sections SET trashed=1 WHERE id=?", [&scene.id])
            .unwrap();
        assert!(pin(temp.path(), &scene.id, &source).is_err());
    }
    #[test]
    fn pins_are_added_to_existing_projects_without_changing_their_schema_version() {
        let temp = tempfile::tempdir().unwrap();
        vaults::create_project(temp.path(), "Test", None).unwrap();
        let scene = project::load(temp.path()).unwrap().sections[0].id.clone();
        let c = database(temp.path()).unwrap();
        let before: i64 = c
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        c.execute_batch("DROP TABLE IF EXISTS margin_pins").unwrap();
        drop(c);
        assert!(margin_pins(temp.path(), &scene).unwrap().is_empty());
        let after: i64 = database(temp.path())
            .unwrap()
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(before, after);
    }
}
