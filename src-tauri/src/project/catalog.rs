use crate::error::{AppResult, Result};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub last_opened: String,
    pub pinned: bool,
    pub archived: bool,
    pub available: bool,
}
fn db(data: &Path) -> Result<Connection> {
    let c = Connection::open(data.join("library.sqlite")).app()?;
    c.busy_timeout(std::time::Duration::from_secs(5)).app()?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS projects(path TEXT PRIMARY KEY,name TEXT NOT NULL,last_opened TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0)").app()?;
    Ok(c)
}
pub fn remember(data: &Path, root: &Path, name: &str) -> Result<()> {
    let path = root.canonicalize().app()?.to_string_lossy().into_owned();
    db(data)?.execute("INSERT INTO projects(path,name,last_opened) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET name=excluded.name,last_opened=excluded.last_opened", params![path,name,chrono::Utc::now().to_rfc3339()]).app()?;
    Ok(())
}
pub fn list(data: &Path) -> Result<Vec<Entry>> {
    let c = db(data)?;
    let mut q = c.prepare("SELECT path,name,last_opened,pinned,archived FROM projects ORDER BY pinned DESC,last_opened DESC,path").app()?;
    let entries = q
        .query_map([], |r| {
            let path: String = r.get(0)?;
            Ok(Entry {
                available: Path::new(&path).join("ariane.sqlite").is_file(),
                path,
                name: r.get(1)?,
                last_opened: r.get(2)?,
                pinned: r.get(3)?,
                archived: r.get(4)?,
            })
        })
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    Ok(entries)
}
pub fn update(data: &Path, path: &str, pinned: bool, archived: bool) -> Result<Vec<Entry>> {
    if db(data)?
        .execute(
            "UPDATE projects SET pinned=?,archived=? WHERE path=?",
            params![pinned, archived, path],
        )
        .app()?
        == 0
    {
        return Err("Projet absent de la bibliothèque.".into());
    }
    list(data)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::project;
    #[test]
    fn catalog_survives_unavailable_paths_and_archiving_never_moves_files() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("book");
        project::create(&path, "Livre").unwrap();
        remember(d.path(), &path, "Livre").unwrap();
        let entry = list(d.path()).unwrap().remove(0);
        update(d.path(), &entry.path, true, true).unwrap();
        assert!(path.join("ariane.sqlite").is_file());
        let items = list(d.path()).unwrap();
        assert!(items[0].archived && items[0].pinned && items[0].available);
        std::fs::rename(&path, d.path().join("moved")).unwrap();
        assert!(!list(d.path()).unwrap()[0].available);
    }
}
