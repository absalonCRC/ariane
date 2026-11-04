use super::*;
use crate::{inference::Engine, memory_engine::Activity, memory_evidence};
use std::sync::Mutex;

pub const GEMMA_MODEL: &str = "embeddinggemma-300M-Q8_0:manuscript-outline-v2";

pub struct Queue<'a> {
    pub root: &'a Path,
    pub index: &'a Path,
    pub resources: &'a Path,
    pub engine: &'a Mutex<Engine>,
    pub activity: &'a Activity,
    pub critical_pressure: bool,
}

impl Queue<'_> {
    pub fn run(&self, section: &str, node: Option<&str>, revision: i64, depth: u8, semantic: bool,
    ) -> Result<Value> {
        if self.activity.is_writing() { return Ok(json!({"busy":true})); }
        let c = project::database(self.root)?;
        if project::section(&c, section)?.is_none_or(|s|s.revision != revision) {
            return Ok(json!({"stale":true}));
        }
        let settings: String = c.query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
                r.get(0)
            }).unwrap_or_else(|_|"{}".into());
        if serde_json::from_str::<Value>(&settings).ok().and_then(|s|s["enrichment"].as_bool()) == Some(false) {
            return Ok(json!({"entities":[],"recall":null,"anchorHash":"","pending":false}));
        }
        drop(c);
        // Cheap, useful results are independent of model availability and pressure.
        sync_idle(self.root, Some(section), ||self.activity.is_writing())?;
        let available = Engine::available(self.resources);
        let mut analyzed = 0;
        let mut model_error = None;
        let mut deferred = false;
        if semantic && available && depth > 0 {
            if self.critical_pressure || self.activity.blocked() {
                deferred = true;
            } else {
                // One passage per turn; a foreground request can take the shared
                // engine between forwards. Never wait for its mutex in this queue.
                for passage in pending_at(self.root, Some(section), node, 1)? {
                    let _priority = self.activity.inference();
                    let active = passage.section == section && passage.node.as_deref() == node;
                    let result = encode(&passage.text, active, |inputs| {
                        if self.activity.blocked() { return Ok(None); }
                        let Ok(mut engine) = self.engine.try_lock() else { return Ok(None); };
                        encoding_cache::encode_many(
                            self.root,
                            self.resources,
                            &mut engine,
                            &passage.title,
                            inputs, ||self.activity.blocked(),
                        )
                    });
                    match result {
                        Ok(Some(output)) if !self.activity.blocked() => {
                            if apply(self.root, &passage, &output)? { analyzed += 1; }
                        }
                        Ok(_) => deferred = true,
                        Err(e) => model_error = Some(e),
                    }
                }
            }
        }
        let mut result = context_idle(self.root, section, node, depth, || {
            self.activity.is_writing()
        })?;
        if result["busy"].as_bool() == Some(true) { return Ok(result); }
        if depth > 0 {
            if let Some(passage) = passage(self.root, section, node)? {
                result["evidence"] = json!(memory_evidence::suggest(self.root, self.index, &passage)?);
            }
        }
        result["analyzed"] = json!(analyzed);
        result["pending"] = json!(depth > 0 && available && !pending(self.root, Some(section), 1)?.is_empty());
        result["deferred"] = json!(deferred);
        result["modelError"] = json!(model_error);
        Ok(result)
    }
}

// Preserve a paragraph vector plus its individual ideas. Whitespace changes do
// not alter encoding, and long paragraphs are chunked by the existing engine.
fn encode(text: &str,
    active: bool,
    mut embed: impl FnMut(&[(&str, bool)]) -> Result<Option<Vec<Vec<f32>>>>,
) -> Result<Option<Value>> {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut pieces = vec![normalized.as_str()];
    let sentences: Vec<&str> = normalized.split_inclusive(['.', '!', '?', ';']).map(str::trim).filter(|s|s.chars().count() > 15).collect();
    if sentences.len() > 1 { pieces.extend(sentences.into_iter().take(8)); }
    let mut inputs = Vec::new();
    for piece in pieces {
        inputs.push((piece, false));
        if active {
            inputs.push((piece, true));
        }
    }
    let Some(vectors) = embed(&inputs)? else {
        return Ok(None);
    };
    if vectors.len() != inputs.len() {
        return Err("Lot vectoriel incomplet.".into());
    }
    let mut passages = Vec::new();
    let mut queries = Vec::new();
    for ((_, query), vector) in inputs.iter().zip(vectors) {
        if *query {
            queries.push(vector); } else {
            passages.push(vector);
        }
    }
    Ok(Some(json!({"model":GEMMA_MODEL,"vector":passages[0],"queryVector":queries.first(),
        "passageVectors":passages,"queryVectors":if active { Some(queries) } else { None }}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn interrupted_encoding_never_returns_partial_vectors() {
        let output = encode("Une maison vide. Une demeure abandonnée.", true, |inputs| {
            assert_eq!(inputs.len(), 6);
            Ok(None)
        }).unwrap();
        assert!(output.is_none());
    }
}
