use super::all_sections;
use super::{database, load, sections};
use crate::{
    error::{AppResult, Result},
    model::*,
};
use rusqlite::params;
use std::{fs, path::Path};
pub fn create(root: &Path, name: &str) -> Result<Project> {
    if name.trim().is_empty() {
        return Err("Le projet doit avoir un nom.".into());
    }
    if root.join("ariane.sqlite").exists() {
        return Err("Ce dossier contient déjà un projet.".into());
    }
    fs::create_dir_all(root).app()?;
    let c = database(root)?;
    c.execute("INSERT INTO meta VALUES('name',?)", [name])
        .app()?;
    c.execute("INSERT INTO meta VALUES('settings','{}')", [])
        .app()?;
    add(root, None, "Sans titre", "scene")?;
    load(root)
}

pub fn add(root: &Path, parent: Option<String>, title: &str, kind: &str) -> Result<Vec<Section>> {
    crate::project::with_lock(root, || {
        if !["folder", "chapter", "scene"].contains(&kind) {
            return Err("Type de section inconnu.".into());
        }
        let c = database(root)?;
        super::library::validate_parent(
            &all_sections(&c)?,
            parent.as_deref(),
            &std::collections::HashSet::new(),
            Some(kind),
        )?;
        if let Some(p) = &parent {
            let exists: bool = c
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sections WHERE id=?)",
                    [p],
                    |r| r.get(0),
                )
                .app()?;
            if !exists {
                return Err("Section parente introuvable.".into());
            }
        }
        let pos: i64 = c
            .query_row(
                "SELECT COALESCE(MAX(position),0)+1 FROM sections",
                [],
                |r| r.get(0),
            )
            .app()?;
        c.execute(
            "INSERT INTO sections(id,parent,title,kind,position) VALUES(?,?,?,?,?)",
            params![uuid::Uuid::new_v4().to_string(), parent, title, kind, pos],
        )
        .app()?;
        sections(&c)
    })
}

pub fn update(root: &Path, s: &Section) -> Result<Vec<Section>> {
    crate::project::with_lock(root, || {
        let c = database(root)?;
        c.execute(
            "UPDATE sections SET title=?,synopsis=?,status=?,goal=? WHERE id=?",
            params![s.title, s.synopsis, s.status, s.goal.max(0), s.id],
        )
        .app()?;
        sections(&c)
    })
}

pub fn reorder(
    root: &Path,
    ids: &[String],
    id: &str,
    parent: Option<String>,
) -> Result<Vec<Section>> {
    crate::project::with_lock(root, || {
        let mut c = database(root)?;
        let all = sections(&c)?;
        if ids.len() != all.len()
            || all
                .iter()
                .any(|s| ids.iter().filter(|v| **v == s.id).count() != 1)
        {
            return Err("Ordre de sections invalide.".into());
        }
        let mut cursor = parent.clone();
        let mut seen = std::collections::HashSet::new();
        while let Some(p) = cursor {
            if p == id || !seen.insert(p.clone()) {
                return Err("Un dossier ne peut pas être placé dans lui-même.".into());
            }
            cursor = all
                .iter()
                .find(|s| s.id == p)
                .ok_or("Parent introuvable")?
                .parent
                .clone()
        }
        super::library::validate_parent(
            &all_sections(&c)?,
            parent.as_deref(),
            &std::collections::HashSet::from([id.to_owned()]),
            None,
        )?;
        let tx = c.transaction().app()?;
        for (i, id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE sections SET position=? WHERE id=?",
                params![i as i64, id],
            )
            .app()?;
        }
        tx.execute(
            "UPDATE sections SET parent=? WHERE id=?",
            params![parent, id],
        )
        .app()?;
        tx.commit().app()?;
        sections(&c)
    })
}

pub fn settings(root: &Path, value: serde_json::Value) -> Result<()> {
    crate::project::with_lock(root, || {
        database(root)?
            .execute(
                "INSERT OR REPLACE INTO meta VALUES('settings',?)",
                [value.to_string()],
            )
            .app()?;
        Ok(())
    })
}
