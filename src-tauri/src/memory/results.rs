//! Durable derived results. Catalogue changes invalidate their dependants, not
//! every passage in the project. These caches never own manuscript content.
use super::storage;
use crate::{
    error::{AppResult, Result},
    retrieval, vaults,
};
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
};

fn dependencies(value: &Value, ids: &mut HashSet<String>) {
    match value {
        Value::Array(values) => {
            for v in values {
                dependencies(v, ids);
            }
        }
        Value::Object(fields) => {
            for key in ["sourceId", "source", "target"] {
                if let Some(id) = fields.get(key).and_then(Value::as_str) {
                    ids.insert(id.into());
                }
            }
            if let Some(related) = fields.get("related").and_then(Value::as_array) {
                for item in related {
                    if let Some(id) = item["id"].as_str() {
                        ids.insert(id.into());
                    }
                }
            }
            if fields.contains_key("vaultId") || fields.contains_key("fingerprint") {
                if let Some(id) = fields.get("id").and_then(Value::as_str) {
                    ids.insert(id.into());
                }
            }
            for v in fields.values() {
                dependencies(v, ids);
            }
        }
        _ => {}
    }
}

/// Reconcile once per catalogue generation. An unrelated edit keeps the actual
/// saved result byte-for-byte; aliases and newly relevant sources invalidate it.
pub fn reconcile(root: &Path, index: &Path) -> Result<()> {
    let snapshot = retrieval::cache::snapshot(root, index, false)?;
    let current = &snapshot.sources.stamps;
    let manifest = &snapshot.sources.manifest;
    let c = storage::database(root)?;
    let token: Option<String> = c
        .query_row(
            "SELECT value FROM meta WHERE key='memory_result_catalog_token'",
            [],
            |r| r.get(0),
        )
        .optional()
        .app()?;
    if token.as_deref() == Some(snapshot.sources.token.as_str()) {
        return Ok(());
    }
    let previous: Option<String> = c
        .query_row(
            "SELECT value FROM meta WHERE key='memory_result_catalog'",
            [],
            |r| r.get(0),
        )
        .optional()
        .app()?;
    let old: BTreeMap<String, String> = previous
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let old_names: BTreeMap<String, Vec<String>> = c
        .query_row(
            "SELECT value FROM meta WHERE key='memory_result_names'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .app()?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let names: BTreeMap<String, Vec<String>> = snapshot
        .sources
        .all
        .iter()
        .map(|s| {
            (
                s.id.clone(),
                std::iter::once(s.title.clone())
                    .chain(s.aliases.iter().cloned())
                    .collect(),
            )
        })
        .collect();
    let changed: HashSet<&str> = old
        .keys()
        .chain(current.keys())
        .filter(|id| old.get(*id) != current.get(*id))
        .map(String::as_str)
        .collect();
    let mut q = c
        .prepare("SELECT key,text,payload FROM memory_results")
        .app()?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .app()?;
    let mut invalid = Vec::new();
    for row in rows {
        let (key, text, payload) = row.app()?;
        let Ok(value) = serde_json::from_str::<Value>(&payload) else {
            invalid.push(key);
            continue;
        };
        let mut deps = HashSet::new();
        dependencies(&value, &mut deps);
        let normalized = vaults::parse::normalize(&text);
        let terms = super::terms(&text);
        let former_name = old_names
            .iter()
            .filter(|(id, _)| changed.contains(id.as_str()))
            .flat_map(|(_, names)| names)
            .any(|name| {
                let name = vaults::parse::normalize(name);
                !name.is_empty()
                    && vaults::parse::exact_mention_normalized(&normalized, &name, true)
            });
        let affected = former_name
            || deps.iter().any(|id| changed.contains(id.as_str()))
            || snapshot
                .sources
                .all
                .iter()
                .filter(|s| changed.contains(s.id.as_str()))
                .any(|s| {
                    std::iter::once(&s.title)
                        .chain(s.aliases.iter())
                        .any(|name| {
                            let name = vaults::parse::normalize(name);
                            !name.is_empty()
                                && vaults::parse::exact_mention_normalized(&normalized, &name, true)
                        })
                        || {
                            let source_text = vaults::parse::normalize(&s.text);
                            terms
                                .iter()
                                .filter(|word| source_text.contains(word.as_str()))
                                .take(2)
                                .count()
                                >= 2
                        }
                });
        if affected {
            invalid.push(key);
        }
    }
    drop(q);
    let tx = c.unchecked_transaction().app()?;
    for key in invalid {
        tx.execute("DELETE FROM memory_results WHERE key=?", [key])
            .app()?;
    }
    tx.execute("INSERT INTO meta(key,value) VALUES('memory_result_catalog',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[manifest]).app()?;
    tx.execute("INSERT INTO meta(key,value) VALUES('memory_result_names',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(&names).app()?]).app()?;
    tx.execute("INSERT INTO meta(key,value) VALUES('memory_result_catalog_token',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&snapshot.sources.token]).app()?;
    tx.commit().app()
}

pub fn get(root: &Path, key: &str, hash: &str) -> Result<Option<Value>> {
    let c = storage::database(root)?;
    let raw: Option<String> = c
        .query_row(
            "SELECT payload FROM memory_results WHERE key=? AND hash=?",
            params![key, hash],
            |r| r.get(0),
        )
        .optional()
        .app()?;
    Ok(raw.and_then(|s| serde_json::from_str(&s).ok()))
}

pub fn source_hits(
    root: &Path,
    index: &Path,
    key: &str,
    hash: &str,
) -> Result<Option<Vec<crate::model::Source>>> {
    let Some(value) = get(root, key, hash)? else {
        return Ok(None);
    };
    let Some(hits) = value["hits"].as_array() else {
        return Ok(None);
    };
    // An empty lexical result must not hide semantic matches indexed later.
    if hits.is_empty() && value["vectors"].as_i64() != Some(vector_generation(index)?) {
        return Ok(None);
    }
    let snapshot = retrieval::cache::snapshot(root, index, false)?;
    let mut sources = Vec::new();
    for hit in hits {
        let Some(id) = hit["sourceId"].as_str() else {
            return Ok(None);
        };
        let Some(&position) = snapshot.sources.by_id.get(id) else {
            return Ok(None);
        };
        let mut source = snapshot.sources.all[position].clone();
        source.score = hit["score"].as_f64().unwrap_or(0.);
        source.matched = hit["matched"].as_str().map(str::to_owned);
        source.page = hit["page"].as_i64();
        if let Some(excerpt) = hit["excerpt"].as_str() {
            source.text = excerpt.into();
        }
        sources.push(source);
    }
    Ok(Some(sources))
}

pub fn put_source_hits(
    root: &Path,
    index: &Path,
    key: &str,
    hash: &str,
    text: &str,
    sources: &[crate::model::Source],
    generation: &SourceGeneration,
) -> Result<()> {
    // Save references and ranking, not a copy of every complete source document.
    let snapshot = retrieval::cache::snapshot(root, index, false)?;
    let hits: Vec<_> = sources.iter().map(|s| {
        let original = snapshot.sources.by_id.get(&s.id).map(|&i|&snapshot.sources.all[i].text);
        serde_json::json!({"sourceId":s.id,"score":s.score,"matched":s.matched,"page":s.page,"excerpt":if original == Some(&s.text) { None } else { Some(&s.text) }})
    }).collect();
    put_if_current(
        root,
        index,
        key,
        hash,
        text,
        &serde_json::json!({"hits":hits,"vectors":generation.vectors}),
        &generation.catalog,
    )?;
    Ok(())
}

pub struct SourceGeneration {
    pub catalog: String,
    pub vectors: i64,
}
pub fn vector_generation(index: &Path) -> Result<i64> {
    vaults::index_db(index)?
        .query_row(
            "SELECT vectors FROM index_generations WHERE singleton=1",
            [],
            |r| r.get(0),
        )
        .app()
}
pub fn source_generation(root: &Path, index: &Path) -> Result<SourceGeneration> {
    Ok(SourceGeneration {
        catalog: catalog(root, index)?,
        vectors: vector_generation(index)?,
    })
}

pub fn catalog(root: &Path, index: &Path) -> Result<String> {
    Ok(retrieval::cache::snapshot(root, index, false)?
        .sources
        .token
        .clone())
}

#[allow(clippy::too_many_arguments)]
pub fn put_if_current(
    root: &Path,
    index: &Path,
    key: &str,
    hash: &str,
    text: &str,
    value: &Value,
    generation: &str,
) -> Result<bool> {
    if catalog(root, index)? != generation {
        return Ok(false);
    }
    put(root, key, hash, text, value)?;
    // A catalogue can change between the first check and the SQLite commit.
    // If reconciliation ran before this write, withdraw this late result too.
    if catalog(root, index)? != generation {
        storage::database(root)?
            .execute(
                "DELETE FROM memory_results WHERE key=? AND hash=?",
                params![key, hash],
            )
            .app()?;
        return Ok(false);
    }
    Ok(true)
}

pub fn put(root: &Path, key: &str, hash: &str, text: &str, value: &Value) -> Result<()> {
    let c = storage::database(root)?;
    c.execute("INSERT INTO memory_results(key,hash,text,payload) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET hash=excluded.hash,text=excluded.text,payload=excluded.payload",params![key,hash,text,value.to_string()]).app()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn source_and_alias_updates_invalidate_only_related_saved_results() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        vaults::create_project(root, "Sources", None).unwrap();
        let index = root.join("sources.sqlite");
        let a = vaults::create_entity(root, "lieu", "Toulouse", "").unwrap();
        let b = vaults::create_entity(root, "lieu", "Paris", "").unwrap();
        let source_a = vaults::index_created_entity(root, &index, &a).unwrap();
        let source_b = vaults::index_created_entity(root, &index, &b).unwrap();
        reconcile(root, &index).unwrap();
        put(
            root,
            "first",
            "a",
            "Toulouse.",
            &json!({"sourceId":source_a.id,"quote":"Ville"}),
        )
        .unwrap();
        put(
            root,
            "last",
            "b",
            "Paris.",
            &json!({"sourceId":source_b.id,"quote":"Capitale"}),
        )
        .unwrap();
        put(root, "alias", "c", "Ville rose.", &json!([])).unwrap();
        let raw = std::fs::read_to_string(&a)
            .unwrap()
            .replace("Alias: []", "Alias: [Ville rose]");
        std::fs::write(&a, raw).unwrap();
        let old_generation = catalog(root, &index).unwrap();
        vaults::index_created_entity(root, &index, &a).unwrap();
        assert!(!put_if_current(
            root,
            &index,
            "late",
            "z",
            "Ville rose.",
            &json!([]),
            &old_generation
        )
        .unwrap());
        assert!(get(root, "late", "z").unwrap().is_none());
        reconcile(root, &index).unwrap();
        assert!(get(root, "first", "a").unwrap().is_none());
        assert!(get(root, "alias", "c").unwrap().is_none());
        assert_eq!(
            get(root, "last", "b").unwrap().unwrap()["quote"],
            "Capitale"
        );
        // Reopen the SQLite file: persistence is independent of the frontend lifetime.
        assert_eq!(
            get(root, "last", "b").unwrap().unwrap()["sourceId"],
            source_b.id
        );
        assert!(get(root, "last", "changed-anchor").unwrap().is_none());
        let mut hit = source_b.clone();
        hit.text = "Un extrait précis.".into();
        hit.page = Some(7);
        hit.score = 0.75;
        put_source_hits(
            root,
            &index,
            "excerpt",
            "d",
            "Paris.",
            &[hit],
            &source_generation(root, &index).unwrap(),
        )
        .unwrap();
        let restored = source_hits(root, &index, "excerpt", "d").unwrap().unwrap();
        assert_eq!(restored[0].text, "Un extrait précis.");
        assert_eq!(restored[0].page, Some(7));
        let generation = source_generation(root, &index).unwrap();
        put_source_hits(root, &index, "cold", "f", "Texte.", &[], &generation).unwrap();
        assert!(source_hits(root, &index, "cold", "f").unwrap().is_some());
        vaults::index_db(&index)
            .unwrap()
            .execute(
                "UPDATE index_generations SET vectors=vectors+1 WHERE singleton=1",
                [],
            )
            .unwrap();
        assert!(source_hits(root, &index, "cold", "f").unwrap().is_none());
        put(root, "former-alias", "e", "Ville rose.", &json!([])).unwrap();
        vaults::index_db(&index)
            .unwrap()
            .execute("DELETE FROM sources WHERE id=?", [&source_a.id])
            .unwrap();
        reconcile(root, &index).unwrap();
        assert!(get(root, "former-alias", "e").unwrap().is_none());
        assert!(get(root, "last", "b").unwrap().is_some());
        vaults::set_scope(root, &source_b.vault_id, vec!["Absent".into()]).unwrap();
        reconcile(root, &index).unwrap();
        assert!(get(root, "last", "b").unwrap().is_none());
    }
}
