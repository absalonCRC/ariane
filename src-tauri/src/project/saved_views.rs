use crate::{
    error::{AppResult, Result},
    project,
};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Term {
    pub kind: String,
    pub id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Query {
    pub version: u32,
    pub groups: Vec<Vec<Term>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct View {
    pub id: String,
    pub name: String,
    pub query: Query,
}
pub fn validate(view: &View) -> Result<()> {
    project::validate_id(&view.id)?;
    if view.name.trim().is_empty()
        || view.name.len() > 400
        || view.query.version != 1
        || view.query.groups.is_empty()
        || view.query.groups.len() > 100
    {
        return Err("Vue enregistrée invalide ou trop récente.".into());
    }
    for g in &view.query.groups {
        if g.is_empty() || g.len() > 100 {
            return Err("Expression incomplète.".into());
        }
        for t in g {
            if !["tag", "entity"].contains(&t.kind.as_str()) || t.id.is_empty() || t.id.len() > 200
            {
                return Err("Référence de recherche invalide.".into());
            }
        }
    }
    Ok(())
}
pub fn list(c: &Connection) -> Result<Vec<View>> {
    let v: Option<String> = c
        .query_row("SELECT value FROM meta WHERE key='saved_views'", [], |r| {
            r.get(0)
        })
        .optional()
        .app()?;
    v.map(|s| serde_json::from_str(&s).app())
        .unwrap_or(Ok(vec![]))
}
pub fn apply(
    root: &Path,
    expected: &str,
    view: Option<View>,
    remove: Option<String>,
) -> Result<Vec<View>> {
    project::with_lock(root, || {
        let mut c = project::database(root)?;
        let tx = c.transaction().app()?;
        let mut all = list(&tx)?;
        if project::hash(&serde_json::to_string(&all).app()?) != expected {
            return Err("Les vues ont changé. Actualisez avant de réessayer.".into());
        }
        if let Some(v) = view {
            validate(&v)?;
            all.retain(|x| x.id != v.id);
            all.push(v);
        }
        if let Some(id) = remove {
            all.retain(|x| x.id != id);
        }
        if all.len() > 1000 {
            return Err("Trop de vues enregistrées.".into());
        }
        tx.execute(
            "INSERT OR REPLACE INTO meta VALUES('saved_views',?)",
            [serde_json::to_string(&all).app()?],
        )
        .app()?;
        tx.commit().app()?;
        Ok(all)
    })
}
pub fn response(c: &Connection) -> Result<serde_json::Value> {
    let items = list(c)?;
    Ok(
        serde_json::json!({"token":project::hash(&serde_json::to_string(&items).app()?),"items":items}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn references_survive_rename_and_restore_but_future_versions_are_rejected() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Vues").unwrap();
        let version = crate::history::capture(d.path(), "Avant", None).unwrap();
        let c = project::database(d.path()).unwrap();
        let token = response(&c).unwrap()["token"].as_str().unwrap().to_owned();
        let v = View {
            id: "view".into(),
            name: "Enquête".into(),
            query: Query {
                version: 1,
                groups: vec![vec![Term {
                    kind: "tag".into(),
                    id: "stable".into(),
                }]],
            },
        };
        apply(d.path(), &token, Some(v.clone()), None).unwrap();
        assert!(apply(d.path(), &token, Some(v.clone()), None).is_err());
        crate::history::restore(d.path(), &version.id).unwrap();
        assert_eq!(list(&c).unwrap()[0].query.groups[0][0].id, "stable");
        let mut future = v;
        future.query.version = 2;
        assert!(validate(&future).is_err());
    }
}
