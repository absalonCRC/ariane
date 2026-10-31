use super::*;

pub const NER_MODEL: &str = "fastino/gliner2-multi-v1@ce747d7+qnnpack-v3:entities-v1";

// Separate progress from embeddings: switching Gemma versions must not rerun
// GLiNER, and an entity result must never overwrite a semantic vector.
pub fn pending_entities_at(root: &Path, section: &str, node: Option<&str>) -> Result<Option<Passage>> {
    let c = storage::database(root)?;
    c.query_row(
        "SELECT p.key,p.section,p.node,p.title,p.text,p.hash,p.position FROM memory_passages p
         LEFT JOIN memory_ner n ON n.passage_key=p.key
         WHERE (n.hash IS NULL OR n.hash<>p.hash OR n.model<>?)
           AND length(trim(p.text,?))>0 AND length(p.text)<=65536
         ORDER BY CASE WHEN p.section=? AND p.node IS ? THEN 0 WHEN p.section=? THEN 1 ELSE 2 END,
           (SELECT position FROM sections WHERE id=p.section),p.section,p.position LIMIT 1",
        params![NER_MODEL,WHITESPACE,section,node,section], row_passage,
    ).optional().app()
}

pub fn apply_entities(root: &Path, passage: &Passage, output: &Value) -> Result<bool> {
    if output["model"].as_str() != Some(NER_MODEL) || !output["entities"].is_array() {
        return Err("Résultat GLiNER incompatible.".into());
    }
    let mentions = parse_mentions(passage, output)?;
    let mut c = storage::database(root)?;
    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).app()?;
    let Some(s) = project::section(&tx, &passage.section)? else { return Ok(false); };
    if section_passages(&s)?.iter().find(|p|p.key == passage.key) != Some(passage)
        || storage::fingerprint(&passage.text) != passage.hash { return Ok(false); }
    let current: Option<(String, i64)> = tx.query_row(
        "SELECT hash,revision FROM memory_passages WHERE key=?", [&passage.key],
        |r| Ok((r.get(0)?,r.get(1)?)),
    ).optional().app()?;
    if current != Some((passage.hash.clone(),s.revision)) { return Ok(false); }
    tx.execute("DELETE FROM memory_mentions WHERE passage_key=? AND origin LIKE 'model:%'", [&passage.key]).app()?;
    for (text,label,a,b) in mentions {
        entities::mention(&tx,&passage.key,&passage.text,&text,a,b,&format!("model:{label}"))?;
    }
    tx.execute("INSERT INTO memory_ner(passage_key,hash,model) VALUES(?,?,?) ON CONFLICT(passage_key) DO UPDATE SET hash=excluded.hash,model=excluded.model",
        params![passage.key,passage.hash,NER_MODEL]).app()?;
    tx.commit().app()?;
    Ok(true)
}
