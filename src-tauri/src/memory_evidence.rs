use crate::{
    error::{AppResult, Result},
    memory::Passage,
    project, vaults,
};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::{collections::HashSet, path::Path, sync::LazyLock};

static WORDS: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"[\p{L}]{4,}").unwrap());
pub fn fresh(
    index: &Path,
    source: &crate::model::Source,
    available: &[crate::model::Vault],
) -> bool {
    let Ok(path) = vaults::file(index, &source.id, available) else {
        return false;
    };
    let Ok(metadata) = std::fs::metadata(&path) else {
        return false;
    };
    if metadata.len() > 100_000_000 {
        return false;
    }
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    source.fingerprint
        == project::hash(&format!(
            "{}:{:x}",
            bytes.len(),
            <sha2::Sha256 as sha2::Digest>::digest(&bytes)
        ))
}
pub fn suggest(root: &Path, index: &Path, passage: &Passage) -> Result<Option<Value>> {
    let ignored = [
        "dans", "avec", "pour", "cette", "comme", "était", "avait", "leur", "elle", "mais",
        "alors", "plus", "sans", "tout", "toute", "toutes", "aussi", "sont", "entre", "depuis",
    ];
    let mut seen = HashSet::new();
    let terms: Vec<_> = WORDS
        .find_iter(&passage.text)
        .map(|m| m.as_str().to_lowercase())
        .filter(|w| !ignored.contains(&w.as_str()) && seen.insert(w.clone()))
        .take(24)
        .collect();
    if terms.len() < 2 {
        return Ok(None);
    }
    let query = terms
        .iter()
        .map(|s| format!("\"{s}\""))
        .collect::<Vec<_>>()
        .join(" OR ");
    let available = vaults::list(root, index)?;
    let c = vaults::index_db(index)?;
    let local = project::database(root)?;
    let mut q = c.prepare("SELECT source,page,text FROM search WHERE search MATCH ? ORDER BY bm25(search) LIMIT 24").app()?;
    let rows = q
        .query_map([query], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<i64>>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .app()?;
    for row in rows {
        let (id, page, text) = row.app()?;
        if text.trim().is_empty() {
            continue;
        }
        let Ok(source) = vaults::source(index, &id, &available) else {
            continue;
        };
        let shared = terms
            .iter()
            .filter(|word| text.to_lowercase().contains(word.as_str()))
            .count();
        if shared < 2 {
            continue;
        }
        if !fresh(index, &source, &available) {
            continue;
        }
        // Keep the selected words in the excerpt, even in a long indexed chunk.
        let first = WORDS
            .find_iter(&text)
            .find(|m| terms.contains(&m.as_str().to_lowercase()))
            .map_or(0, |m| m.start());
        let prefix = text[..first].chars().count().saturating_sub(160);
        let quote: String = text.chars().skip(prefix).take(900).collect();
        let hash = project::hash(&format!(
            "{}:{}:{}",
            source.fingerprint, passage.hash, quote
        ));
        let key = format!("source:{}:{}", id, passage.key);
        let dismissed: Option<i32> = local
            .query_row(
                "SELECT 1 FROM memory_dismissals WHERE id=? AND hash=?",
                params![key, hash],
                |r| r.get(0),
            )
            .optional()
            .app()?;
        if dismissed.is_some() {
            continue;
        }
        return Ok(Some(
            json!({"id":key,"hash":hash,"title":source.title,"sourceId":source.id,"fingerprint":source.fingerprint,"page":page,"quote":quote,"reason":"Passage à confronter","score":shared,"anchorHash":passage.hash}),
        ));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excerpts_keep_the_match_and_reject_changed_removed_or_out_of_scope_sources() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        project::create(&root, "Sources").unwrap();
        crate::memory::sync(&root).unwrap();
        let vault = d.path().join("vault");
        std::fs::create_dir(&vault).unwrap();
        vaults::connect(&root, &vault).unwrap();
        let index = d.path().join("sources.sqlite");
        let available = vaults::list(&root, &index).unwrap();
        let id = &available[0].id;
        let raw = format!(
            "{} Louise Morel tenait un atelier de reliure à Arles en 1924.",
            "Préambule documentaire. ".repeat(60)
        );
        let file = vault.join("archive.md");
        std::fs::write(&file, &raw).unwrap();
        let mut source = vaults::parse::parse(id, "archive.md", &raw);
        source.fingerprint = project::hash(&format!(
            "{}:{:x}",
            raw.len(),
            <sha2::Sha256 as sha2::Digest>::digest(raw.as_bytes())
        ));
        let c = vaults::index_db(&index).unwrap();
        c.execute(
            "INSERT INTO sources VALUES(?,?,?,?,?)",
            params![
                source.id,
                id,
                source.path,
                source.fingerprint,
                serde_json::to_string(&source).unwrap()
            ],
        )
        .unwrap();
        c.execute(
            "INSERT INTO search(text,source,page) VALUES(?,?,7)",
            params![source.text, source.id],
        )
        .unwrap();
        let p = Passage {
            key: "a".into(),
            section: "a".into(),
            node: None,
            title: "Texte".into(),
            text: "Louise Morel vivait à Arles.".into(),
            hash: "h".into(),
            position: 0,
        };
        let found = suggest(&root, &index, &p).unwrap().unwrap();
        assert!(found["quote"]
            .as_str()
            .unwrap()
            .contains("atelier de reliure"));
        assert_eq!(found["page"], 7);
        std::fs::write(&file, "Une autre source.").unwrap();
        assert!(suggest(&root, &index, &p).unwrap().is_none());
        std::fs::remove_file(&file).unwrap();
        assert!(suggest(&root, &index, &p).unwrap().is_none());
        assert!(!fresh(&index, &source, &[]));
    }
}
