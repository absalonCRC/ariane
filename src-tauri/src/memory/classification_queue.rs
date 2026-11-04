//! Durable quick-note jobs. Publication still rechecks the owned file's fingerprint.
use super::*;
use crate::{
    memory_engine::{Activity, EntityEngine},
    model::Source,
    vaults,
};
pub fn enqueue(root: &Path, index: &Path, source: &Source, context: &str) -> Result<()> {
    if source.kind.to_lowercase() != "note" {
        return Ok(());
    }
    let types = vaults::classification_types(root, index)?;
    if types.is_empty() {
        return Ok(());
    }
    let registry = serde_json::to_string(&types).app()?;
    let context: String = context.chars().take(1000).collect();
    storage::database(root)?.execute("INSERT INTO memory_classification_queue(source,fingerprint,context,registry) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET
        attempts=CASE WHEN fingerprint<>excluded.fingerprint OR registry<>excluded.registry OR (excluded.context<>'' AND context<>excluded.context) THEN 0 ELSE attempts END,
        retry=CASE WHEN fingerprint<>excluded.fingerprint OR registry<>excluded.registry OR (excluded.context<>'' AND context<>excluded.context) THEN 0 ELSE retry END,
        fingerprint=excluded.fingerprint,registry=excluded.registry,context=CASE WHEN excluded.context<>'' THEN excluded.context ELSE context END",params![source.id,source.fingerprint,context,registry]).app()?;
    Ok(())
}
pub fn next(root: &Path) -> Result<Option<String>> {
    storage::database(root)?.query_row("SELECT source FROM memory_classification_queue WHERE attempts<5 AND retry<=? ORDER BY retry,source LIMIT 1",[chrono::Utc::now().timestamp()],|r|r.get(0)).optional().app()
}
#[allow(clippy::too_many_arguments)]
pub fn run(
    root: &Path,
    index: &Path,
    data: &Path,
    resources: &Path,
    worker: &mut EntityEngine,
    activity: &Activity,
    id: &str,
    current: impl Fn() -> bool,
) -> Result<Value> {
    let c = storage::database(root)?;
    let job:Option<(String,String,i64,i64)>=c.query_row("SELECT fingerprint,context,attempts,retry FROM memory_classification_queue WHERE source=?",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().app()?;
    let Some((fingerprint, context, attempts, retry)) = job else {
        return Ok(json!({"pending":false}));
    };
    if attempts >= 5 {
        return Ok(json!({"pending":false}));
    }
    if retry > chrono::Utc::now().timestamp() || activity.ner_blocked() {
        return Ok(json!({"pending":true}));
    }
    let available = vaults::list(root, index)?;
    let source = vaults::source(index, id, &available).ok();
    let types = vaults::classification_types(root, index)?;
    let source = source.filter(|s| {
        s.fingerprint == fingerprint
            && s.kind.to_lowercase() == "note"
            && available
                .iter()
                .any(|v| v.id == s.vault_id && v.owned && v.available)
    });
    if source.is_none() || types.is_empty() {
        c.execute(
            "DELETE FROM memory_classification_queue WHERE source=?",
            [id],
        )
        .app()?;
        return Ok(json!({"pending":false}));
    }
    let source = source.unwrap();
    if vaults::example_type(&source.title, &types).is_none()
        && !EntityEngine::available(data, resources)
    {
        c.execute(
            "UPDATE memory_classification_queue SET retry=? WHERE source=?",
            params![chrono::Utc::now().timestamp() + 60, id],
        )
        .app()?;
        return Ok(json!({"pending":true,"unavailable":true}));
    }

    let kind = if let Some(kind) = vaults::example_type(&source.title, &types) {
        Some(kind.to_owned())
    } else {
        match worker.classify_note(
            data,
            resources,
            activity,
            &source.title,
            &context,
            serde_json::to_value(&types).app()?,
        ) {
            Ok(Some(output)) => vaults::predicted_type(&output, &types).map(str::to_owned),
            Ok(None) => return Ok(json!({"pending":true})),
            Err(_) => {
                c.execute("UPDATE memory_classification_queue SET attempts=attempts+1,retry=? WHERE source=?",params![chrono::Utc::now().timestamp()+5*(1i64<<attempts),id]).app()?;
                return Ok(json!({"pending":attempts<4}));
            }
        }
    };
    if !current()
        || serde_json::to_string(&types).app()?
            != serde_json::to_string(&vaults::classification_types(root, index)?).app()?
    {
        return Ok(json!({"pending":true}));
    }
    let typed = kind
        .map(|kind| vaults::apply_note_type(root, index, &source, &kind))
        .transpose()?
        .flatten();
    c.execute(
        "DELETE FROM memory_classification_queue WHERE source=?",
        [id],
    )
    .app()?;
    Ok(json!({"pending":false,"source":typed}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retrying_the_same_job_is_bounded_but_new_input_starts_a_fresh_job() {
        let d = tempfile::tempdir().unwrap();
        let index = d.path().join("index");
        project::create(d.path(), "File").unwrap();
        let mut source = vaults::create_quick_note(d.path(), &index, "Claude").unwrap();
        enqueue(d.path(), &index, &source, "Relieur").unwrap();
        let c = storage::database(d.path()).unwrap();
        c.execute(
            "UPDATE memory_classification_queue SET attempts=5,retry=9999999999",
            [],
        )
        .unwrap();
        enqueue(d.path(), &index, &source, "Relieur").unwrap();
        assert!(next(d.path()).unwrap().is_none());
        source.fingerprint = "updated-file".into();
        enqueue(d.path(), &index, &source, "Voyageur").unwrap();
        assert_eq!(next(d.path()).unwrap(), Some(source.id));
        assert_eq!(
            c.query_row(
                "SELECT fingerprint FROM memory_classification_queue",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "updated-file"
        );
    }
    #[test]
    fn jobs_survive_reopening_but_never_overwrite_a_changed_note() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        let index = root.join("index");
        project::create(root, "File").unwrap();
        let source = vaults::create_quick_note(root, &index, "Claude").unwrap();
        enqueue(root, &index, &source, "Un relieur").unwrap();
        assert_eq!(next(root).unwrap(), Some(source.id.clone()));
        vaults::apply_note_type(root, &index, &source, "Personne").unwrap();
        let result = run(
            root,
            &index,
            root,
            root,
            &mut EntityEngine::default(),
            &Activity::default(),
            &source.id,
            || true,
        )
        .unwrap();
        assert_eq!(result["pending"], false);
        assert!(next(root).unwrap().is_none());
    }
}
