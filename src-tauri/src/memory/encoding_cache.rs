//! Per-project, content-addressed partial encodings survive interrupted analyses.
use super::*;
pub fn encode_many(
    root: &Path,
    resources: &Path,
    engine: &mut crate::inference::Engine,
    title: &str,
    inputs: &[(&str, bool)],
    interrupted: impl Fn() -> bool,
) -> Result<Option<Vec<Vec<f32>>>> {
    let mut result = vec![None; inputs.len()];
    let c = storage::database(root)?;
    let mut missing = vec![];
    for (i, (text, query)) in inputs.iter().enumerate() {
        let prompt = crate::inference::encoding::prompt(text, Some(title), *query);
        let key = storage::fingerprint(&format!(
            "{GEMMA_MODEL}:{}:{prompt}",
            crate::inference::encoding::VERSION
        ));
        result[i] = c
            .query_row(
                "SELECT vector FROM memory_encoding_cache WHERE key=?",
                [&key],
                |r| Ok(crate::vectors::decode(r.get_ref(0)?)),
            )
            .optional()
            .app()?
            .flatten();
        if result[i].is_none() {
            missing.push((i, key, prompt));
        }
    }
    for batch in missing.chunks(2) {
        if interrupted() {
            return Ok(None);
        }
        let mut short = true;
        for (_, _, prompt) in batch {
            short &= engine.token_count(resources, prompt)? <= crate::inference::encoding::TOKENS;
        }
        let vectors = if short {
            let outcome = engine.embed_batch(
                resources,
                &batch.iter().map(|(_, _, p)| p.clone()).collect::<Vec<_>>(),
            );
            if let Err(error) = outcome {
                for (_, key, prompt) in batch {
                    if let Some(vector) = engine.cached_vector(prompt) {
                        store(&c, key, &vector)?;
                    }
                }
                return Err(error);
            }
            outcome?
        } else {
            let mut vectors = vec![];
            for (i, key, _) in batch {
                let (text, query) = inputs[*i];
                let Some(v) =
                    engine.embed_titled_idle(resources, text, Some(title), query, &interrupted)?
                else {
                    return Ok(None);
                };
                store(&c, key, &v)?;
                vectors.push(v);
            }
            vectors
        };
        for ((i, key, _), vector) in batch.iter().zip(vectors) {
            store(&c, key, &vector)?;
            result[*i] = Some(vector);
        }
    }
    c.execute("DELETE FROM memory_encoding_cache WHERE key IN (SELECT key FROM memory_encoding_cache ORDER BY used DESC,key LIMIT -1 OFFSET 1024)",[]).app()?;
    Ok((!interrupted()).then(|| result.into_iter().map(Option::unwrap).collect()))
}
fn store(c: &rusqlite::Connection, key: &str, vector: &[f32]) -> Result<()> {
    let tx = c.unchecked_transaction().app()?;
    tx.execute(
        "INSERT OR REPLACE INTO memory_encoding_cache(key,vector,used) VALUES(?,?,?)",
        params![
            key,
            crate::vectors::encode(vector),
            chrono::Utc::now().timestamp_millis()
        ],
    )
    .app()?;
    tx.execute("DELETE FROM memory_encoding_cache WHERE key IN (SELECT key FROM memory_encoding_cache ORDER BY used DESC,key LIMIT -1 OFFSET 1024)",[]).app()?;
    tx.commit().app()
}
#[cfg(test)]
pub fn get_or_encode(
    root: &Path,
    text: &str,
    title: &str,
    query: bool,
    encode: impl FnOnce() -> Result<Option<Vec<f32>>>,
) -> Result<Option<Vec<f32>>> {
    let key = storage::fingerprint(&format!(
        "{}:{}:{}",
        GEMMA_MODEL,
        crate::inference::encoding::VERSION,
        crate::inference::encoding::prompt(text, Some(title), query)
    ));
    let c = storage::database(root)?;
    let cached = c
        .query_row(
            "SELECT vector FROM memory_encoding_cache WHERE key=?",
            [&key],
            |r| Ok(crate::vectors::decode(r.get_ref(0)?)),
        )
        .optional()
        .app()?
        .flatten();
    if cached.is_some() {
        return Ok(cached);
    }
    let Some(vector) = encode()? else {
        return Ok(None);
    };
    c.execute(
        "INSERT OR REPLACE INTO memory_encoding_cache(key,vector,used) VALUES(?,?,?)",
        params![
            key,
            crate::vectors::encode(&vector),
            chrono::Utc::now().timestamp_millis()
        ],
    )
    .app()?;
    c.execute("DELETE FROM memory_encoding_cache WHERE key IN (SELECT key FROM memory_encoding_cache ORDER BY used DESC,key LIMIT -1 OFFSET 1024)",[]).app()?;
    Ok(Some(vector))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outline_edits_reuse_other_lines_and_completed_work_after_interruption() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Cache").unwrap();
        let calls = std::cell::Cell::new(0);
        let encode = || {
            calls.set(calls.get() + 1);
            let mut v = vec![0.; 768];
            v[0] = 1.;
            Ok(Some(v))
        };
        for line in ["Première ligne.", "Deuxième ligne."] {
            get_or_encode(d.path(), line, "Scène", false, encode).unwrap();
        }
        // A new queue/process reads the persistent cache, even after an interrupted turn.
        get_or_encode(d.path(), "Première ligne.", "Scène", false, encode).unwrap();
        get_or_encode(d.path(), "Deuxième ligne modifiée.", "Scène", false, encode).unwrap();
        assert_eq!(calls.get(), 3);
        get_or_encode(d.path(), "Première   ligne.\n", "Scène", false, encode).unwrap();
        assert_eq!(calls.get(), 3);
        get_or_encode(d.path(), "Première ligne.", "Nouveau titre", false, encode).unwrap();
        assert_eq!(calls.get(), 4);
    }
}
