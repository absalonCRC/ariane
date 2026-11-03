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
    let selected = list(root, index)?.into_iter().filter(|v|vault.is_none_or(|id|id==v.id)).collect::<Vec<_>>();
    let c = index_db(index)?;
    let flags=rusqlite::functions::FunctionFlags::SQLITE_UTF8 | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC | rusqlite::functions::FunctionFlags::SQLITE_INNOCUOUS;
    c.create_scalar_function("ariane_lower",1,flags,|ctx|Ok(ctx.get::<String>(0)?.to_lowercase())).app()?;
    c.create_scalar_function("ariane_dir",1,flags,|ctx|Ok(Path::new(&ctx.get::<String>(0)?).parent().unwrap_or(Path::new("")).to_string_lossy().to_string())).app()?;
    let scope=scope_json(&selected)?;
    let scoped=format!("WITH scoped AS MATERIALIZED (SELECT s.* FROM sources s WHERE {SCOPE_SQL})");
    let mut q=c.prepare(&format!("{scoped} SELECT json_extract(payload,'$.kind'),count(*) FROM scoped GROUP BY 1 ORDER BY 1")).app()?;
    let types=q.query_map([&scope],|r|Ok(EntityType {kind:r.get(0)?,count:r.get(1)?})).app()?.collect::<std::result::Result<Vec<_>,_>>().app()?;
    let mut q=c.prepare(&format!("{scoped} SELECT DISTINCT ariane_dir(path) AS folder FROM scoped WHERE folder<>'' ORDER BY folder")).app()?;
    let folders=q.query_map([&scope],|r|r.get::<_,String>(0)).app()?.collect::<std::result::Result<Vec<_>,_>>().app()?;
    let filter="(?2 IS NULL OR json_extract(payload,'$.kind')=?2) AND (?3 IS NULL OR path=?3 OR substr(path,1,length(?3)+1)=?3||'/') AND (?4='' OR instr(ariane_lower(json_extract(payload,'$.title')),?4)>0 OR instr(ariane_lower(json_extract(payload,'$.text')),?4)>0)";
    let term=query.trim().to_lowercase();
    let total=c.query_row(&format!("{scoped} SELECT count(*) FROM scoped WHERE {filter}"),params![scope,kind,folder,term],|r|r.get(0)).app()?;
    let mut q=c.prepare(&format!("{scoped} SELECT json_set(payload,'$.text',substr(json_extract(payload,'$.text'),1,240)) FROM scoped WHERE {filter} ORDER BY json_extract(payload,'$.title') COLLATE NOCASE,path,id LIMIT 50 OFFSET ?5")).app()?;
    let rows=q.query_map(params![scope,kind,folder,term,i64::try_from(offset).unwrap_or(i64::MAX)],|r|r.get::<_,String>(0)).app()?;
    let items=rows.map(|r|serde_json::from_str(&r.app()?).app()).collect::<Result<Vec<Source>>>()?;
    Ok(SourcePage {items,total,kinds:types.iter().map(|t|t.kind.clone()).collect(),types,folders})
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
