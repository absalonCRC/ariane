mod context;
mod passages;
#[cfg(test)]
pub use context::vector;
pub use context::{context, context_idle, dismiss, entity, list, passage, session};
pub use passages::{pending, pending_at, sync, sync_idle, sync_preferred};
use passages::{row_passage, section_passages, utf16_byte};
mod entities;
mod inline;
pub use inline::{
    create_detected_entity, inline_entities, resolve_detected_entity, resolve_inline_entities,
};
mod ner;
pub use ner::{apply_entities, pending_entities_at, prepare_types};
pub(crate) mod classification_queue;
mod encoding_cache;
mod queue;
pub use queue::{Queue, GEMMA_MODEL};
pub(crate) mod results;
mod storage;
mod temporal;

use crate::{
    error::{AppResult, Result},
    project,
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashSet, path::Path};

// SQLite trim() removes only ASCII spaces by default. Mirror Rust's Unicode
// whitespace handling so blank outline nodes never block a model queue.
const WHITESPACE: &str = " \t\n\r\u{b}\u{c}\u{85}\u{a0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Passage {
    pub key: String,
    pub section: String,
    pub node: Option<String>,
    pub title: String,
    pub text: String,
    pub hash: String,
    pub position: usize,
}

fn codepoint_range(text: &str, start: usize, end: usize) -> Result<(usize, usize)> {
    if start >= end {
        return Err("Plage de mention invalide.".into());
    }
    let starts: Vec<usize> = text
        .char_indices()
        .map(|(i, _)| i)
        .chain(std::iter::once(text.len()))
        .collect();
    if end >= starts.len() {
        return Err("Plage de mention hors du passage.".into());
    }
    Ok((starts[start], starts[end]))
}

pub fn apply(root: &Path, passage: &Passage, output: &Value) -> Result<bool> {
    let mut c = storage::database(root)?;
    let vector = output
        .get("vector")
        .and_then(Value::as_array)
        .ok_or("Vecteur manquant.")?;
    let model = output
        .get("model")
        .and_then(Value::as_str)
        .ok_or("Modèle manquant.")?;
    let dimension = if model == GEMMA_MODEL {
        768
    } else if model.starts_with("intfloat/multilingual-e5-small") {
        384
    } else {
        return Err("Modèle vectoriel incompatible.".into());
    };
    if vector.len() != dimension {
        return Err("Dimension vectorielle invalide.".into());
    }
    let mut parsed = Vec::new();
    for value in vector {
        let n = value
            .as_f64()
            .filter(|x| x.is_finite())
            .ok_or("Vecteur invalide.")?;
        parsed.push(n as f32);
    }
    if !parsed.is_empty()
        && (parsed.iter().any(|x| !x.is_finite())
            || parsed.iter().map(|x| x * x).sum::<f32>() < 0.5)
    {
        return Err("Vecteur non normalisé.".into());
    }
    let query: Vec<f32> = if output["queryVector"].is_null() {
        vec![]
    } else {
        serde_json::from_value(output["queryVector"].clone()).app()?
    };
    let norm = query.iter().map(|v| v * v).sum::<f32>();
    if !query.is_empty()
        && (query.len() != dimension
            || query.iter().any(|v| !v.is_finite())
            || !(0.9..=1.1).contains(&norm))
    {
        return Err("Vecteur de requête invalide.".into());
    }
    let passage_vectors = parse_vectors(output.get("passageVectors"), &parsed)?;
    let query_vectors = if query.is_empty() {
        None
    } else {
        Some(parse_vectors(output.get("queryVectors"), &query)?)
    };
    let mentions = parse_mentions(&passage.text, output, &crate::ai_policy::POLICY.ner)?;
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .app()?;
    let Some(s) = project::section(&tx, &passage.section)? else {
        return Ok(false);
    };
    let live = section_passages(&s)?
        .into_iter()
        .find(|p| p.key == passage.key);
    if live.as_ref() != Some(passage) || storage::fingerprint(&passage.text) != passage.hash {
        return Ok(false);
    }
    let current: Option<(String, i64)> = tx
        .query_row(
            "SELECT hash,revision FROM memory_passages WHERE key=?",
            [&passage.key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .app()?;
    if current != Some((passage.hash.clone(), s.revision)) {
        return Ok(false);
    }
    if output.get("entities").is_some() {
        tx.execute(
            "DELETE FROM memory_mentions WHERE passage_key=? AND origin LIKE 'model:%'",
            [&passage.key],
        )
        .app()?;
    }
    for (text, label, a, b) in mentions {
        entities::mention(
            &tx,
            &passage.key,
            &passage.text,
            &text,
            a,
            b,
            &format!("model:{label}"),
        )?;
    }
    tx.execute(
        "UPDATE memory_passages SET analyzed=1,vector=?,query_vector=?,model=? WHERE key=?",
        params![
            crate::vectors::encode_group(&passage_vectors),
            query_vectors
                .as_ref()
                .map(|v| crate::vectors::encode_group(v)),
            model,
            passage.key
        ],
    )
    .app()?;
    tx.execute("INSERT INTO meta(key,value) VALUES('memory_vectors_generation','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(meta.value AS INTEGER)+1 AS TEXT)",[]).app()?;
    tx.commit().app()?;
    Ok(true)
}

fn terms(text: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    text.split(|c: char| !c.is_alphanumeric())
        .filter_map(|word| {
            let lower = word.to_lowercase();
            if lower.chars().count() < 4
                || [
                    "dans", "avec", "pour", "cette", "comme", "était", "avait", "leur", "elle",
                    "mais", "alors", "plus", "sans", "tout", "toute", "depuis",
                ]
                .contains(&lower.as_str())
                || !seen.insert(lower.clone())
            {
                None
            } else {
                Some(lower)
            }
        })
        .take(12)
        .collect()
}

fn parse_vectors(value: Option<&Value>, fallback: &[f32]) -> Result<Vec<Vec<f32>>> {
    let vectors: Vec<Vec<f32>> = match value {
        Some(value) => serde_json::from_value(value.clone()).app()?,
        None => vec![fallback.to_vec()],
    };
    if vectors.is_empty()
        || vectors.len() > 9
        || vectors.iter().any(|v| {
            v.len() != fallback.len()
                || v.iter().any(|x| !x.is_finite())
                || !(0.9..=1.1).contains(&v.iter().map(|x| x * x).sum::<f32>())
        })
    {
        return Err("Segments vectoriels invalides.".into());
    }
    Ok(vectors)
}
type Vectors = (String, Vec<Vec<f32>>);

#[cfg(test)]
mod tests;

pub(crate) fn parse_mentions(
    source: &str,
    output: &Value,
    policy: &crate::ai_policy::Ner,
) -> Result<Vec<(String, String, usize, usize)>> {
    let mut mentions = Vec::new();
    for item in output
        .get("entities")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if item
            .get("score")
            .and_then(Value::as_f64)
            .is_none_or(|score| {
                !score.is_finite()
                    || score > 1.
                    || score < policy.threshold(item["label"].as_str().unwrap_or(""))
            })
        {
            continue;
        }
        let label = item
            .get("label")
            .and_then(Value::as_str)
            .ok_or("Type de mention manquant.")?;
        let text = item
            .get("text")
            .and_then(Value::as_str)
            .ok_or("Texte de mention manquant.")?;
        let named = text.chars().any(char::is_uppercase);
        let confident_person = label == "person"
            && item.get("score").and_then(Value::as_f64).unwrap_or(0.) >= policy.lowercase_person
            && !text
                .split_whitespace()
                .next()
                .is_some_and(|w| ["le", "la", "les", "un", "une", "des"].contains(&w));
        if !(named || confident_person) {
            continue;
        }
        let start = item
            .get("start")
            .and_then(Value::as_u64)
            .ok_or("Début de mention manquant.")? as usize;
        let end = item
            .get("end")
            .and_then(Value::as_u64)
            .ok_or("Fin de mention manquante.")? as usize;
        let (a, b) = codepoint_range(source, start, end)?;
        if source.get(a..b) != Some(text) {
            return Err("Texte de mention non aligné.".into());
        }
        mentions.push((text.to_owned(), label.to_owned(), a, b));
    }
    Ok(mentions)
}
