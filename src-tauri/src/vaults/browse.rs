use super::*;
use serde::Serialize;
#[derive(Serialize)]
struct EntityType {
    kind: String,
    count: usize,
}
#[derive(Serialize)]
pub struct SourcePage {
    items: Vec<Source>,
    total: usize,
    kinds: Vec<String>,
    types: Vec<EntityType>,
    folders: Vec<String>,
}
#[allow(clippy::too_many_arguments)]
pub fn browse(
    root: &Path,
    index: &Path,
    query: &str,
    vault: Option<&str>,
    kind: Option<&str>,
    folder: Option<&str>,
    offset: usize,
) -> Result<SourcePage> {
    let vaults = list(root, index)?;
    let c = index_db(index)?;
    let mut q = c.prepare("SELECT id,vault,path,json_extract(payload,'$.title'),json_extract(payload,'$.kind'),CASE WHEN ?='' THEN '' ELSE json_extract(payload,'$.text') END FROM sources ORDER BY json_extract(payload,'$.title') COLLATE NOCASE,path,id").app()?;
    let rows = q
        .query_map([query], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
            ))
        })
        .app()?;
    let term = query.trim().to_lowercase();
    let mut ids = Vec::new();
    let mut kinds = std::collections::BTreeMap::new();
    let mut folders = std::collections::BTreeSet::new();
    let mut total = 0;
    for row in rows {
        let (id, v, path, title, source_kind, text) = row.app()?;
        if !vaults.iter().any(|item| {
            item.id == v
                && (item.scope.is_empty()
                    || item.scope.iter().any(|s| Path::new(&path).starts_with(s)))
        }) || vault.is_some_and(|selected| selected != v)
        {
            continue;
        }
        let dir = Path::new(&path)
            .parent()
            .unwrap_or(Path::new(""))
            .to_string_lossy()
            .into_owned();
        *kinds.entry(source_kind.clone()).or_insert(0usize) += 1;
        if !dir.is_empty() {
            folders.insert(dir);
        }
        if kind.is_some_and(|k| k != source_kind)
            || folder.is_some_and(|f| !Path::new(&path).starts_with(f))
        {
            continue;
        }
        if !term.is_empty()
            && !title.to_lowercase().contains(&term)
            && !text.to_lowercase().contains(&term)
        {
            continue;
        }
        if total >= offset && ids.len() < 50 {
            ids.push(id);
        }
        total += 1;
    }
    let mut items = Vec::new();
    for id in ids {
        let mut s = source(index, &id, &vaults)?;
        s.text = s.text.chars().take(240).collect();
        items.push(s);
    }
    Ok(SourcePage {
        items,
        total,
        kinds: kinds.keys().cloned().collect(),
        types: kinds
            .into_iter()
            .map(|(kind, count)| EntityType { kind, count })
            .collect(),
        folders: folders.into_iter().collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paginates_and_filters_only_connected_scopes() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("book");
        let vault = d.path().join("vault");
        let index = d.path().join("sources.sqlite");
        std::fs::create_dir(&vault).unwrap();
        project::create(&root, "Livre").unwrap();
        connect(&root, &vault).unwrap();
        let id = list(&root, &index).unwrap()[0].id.clone();
        set_scope(&root, &id, vec!["allowed".into()]).unwrap();
        let c = index_db(&index).unwrap();
        for i in 0..57 {
            let source = Source {
                id: format!("s{i}"),
                vault_id: id.clone(),
                path: format!("{}/{i}.md", if i < 55 { "allowed" } else { "private" }),
                title: format!("Source {i:02}"),
                kind: if i % 2 == 0 {
                    "Personne".into()
                } else {
                    "Lieu".into()
                },
                aliases: vec![],
                tags: vec![],
                fields: serde_json::json!({}),
                text: "Passage lune".into(),
                page: None,
                matched: None,
                score: 0.,
                fingerprint: String::new(),
                enrichment: None,
            };
            c.execute(
                "INSERT INTO sources VALUES(?,?,?,?,?)",
                params![
                    source.id,
                    id,
                    source.path,
                    "hash",
                    serde_json::to_string(&source).unwrap()
                ],
            )
            .unwrap();
        }
        let first = browse(&root, &index, "", None, None, None, 0).unwrap();
        assert_eq!(first.total, 55);
        assert_eq!(first.types.iter().map(|t| t.count).sum::<usize>(), 55);
        assert_eq!(
            first
                .types
                .iter()
                .find(|t| t.kind == "Personne")
                .unwrap()
                .count,
            28
        );
        assert_eq!(first.items.len(), 50);
        assert_eq!(first.folders, vec!["allowed"]);
        let second = browse(&root, &index, "", None, None, None, 50).unwrap();
        assert_eq!(second.items.len(), 5);
        assert!(!first
            .items
            .iter()
            .any(|s| second.items.iter().any(|v| v.id == s.id)));
        assert_eq!(
            browse(
                &root,
                &index,
                "lune",
                None,
                Some("Personne"),
                Some("allowed"),
                0
            )
            .unwrap()
            .total,
            28
        );
        assert_eq!(
            browse(&root, &index, "", Some("unknown"), None, None, 0)
                .unwrap()
                .total,
            0
        );
    }
}
