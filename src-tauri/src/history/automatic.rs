use super::{insert, snapshot};
use crate::{
    error::{AppResult, Result},
    model::Version,
    project,
};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

const BUDGET: i64 = 128 * 1024 * 1024;

fn prepare(c: &Connection) -> Result<()> {
    // Additive metadata: existing versions, including old automatic backups, stay untouched.
    c.execute_batch("CREATE TABLE IF NOT EXISTS automatic_versions(id TEXT PRIMARY KEY REFERENCES versions(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,bytes INTEGER NOT NULL);").app()
}
pub fn checkpoint(root: &Path, scope: &str) -> Result<Option<Version>> {
    project::with_lock(root, || {
        let mut c = project::database(root)?;
        let tx = c.transaction().app()?;
        let version = checkpoint_with(&tx, scope, true)?;
        tx.commit().app()?;
        Ok(version)
    })
}
/// Called inside the same transaction as a text save; snapshots cannot outlive a failed save.
pub(crate) fn checkpoint_with(c: &Connection, scope: &str, force: bool) -> Result<Option<Version>> {
    project::validate_id(scope)?;
    prepare(c)?;
    let last: Option<(String,String)> = c.query_row(
        "SELECT v.created,a.fingerprint FROM versions v JOIN automatic_versions a ON a.id=v.id WHERE v.scope=? ORDER BY v.created DESC,v.id DESC LIMIT 1",
        [scope], |r| Ok((r.get(0)?,r.get(1)?))).optional().app()?;
    if !force
        && last.as_ref().is_some_and(|(created, _)| {
            DateTime::parse_from_rfc3339(created)
                .is_ok_and(|time| Utc::now().signed_duration_since(time).num_seconds() < 300)
        })
    {
        return Ok(None);
    }
    let mut state = snapshot(c, &Some(scope.to_owned()))?;
    if state.sections.is_empty() {
        return Ok(None);
    }
    // Revision counters and the editor cursor do not constitute a new version.
    state.settings = serde_json::Value::Null;
    for section in &mut state.sections {
        section.revision = 0;
    }
    let payload = serde_json::to_string(&state).app()?;
    let fingerprint = project::hash(&payload);
    if last
        .as_ref()
        .is_some_and(|(_, previous)| previous == &fingerprint)
    {
        return Ok(None);
    }
    let bytes = payload.len() as i64;
    drop(payload);
    if bytes > BUDGET {
        return Ok(None);
    }
    let version = insert(c, "Sauvegarde automatique", Some(scope.to_owned()), state)?;
    c.execute(
        "INSERT INTO automatic_versions VALUES(?,?,?)",
        params![version.id, fingerprint, bytes],
    )
    .app()?;
    prune(c, Utc::now(), BUDGET)?;
    Ok(Some(version))
}
fn prune(c: &Connection, now: DateTime<Utc>, budget: i64) -> Result<()> {
    let mut q = c.prepare("SELECT v.id,v.scope,v.created,a.bytes FROM versions v JOIN automatic_versions a ON a.id=v.id ORDER BY v.created DESC,v.id DESC").app()?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut buckets = HashSet::new();
    let mut used = 0;
    for (id, scope, created, bytes) in rows {
        let count = counts.entry(scope.clone()).or_default();
        let time = DateTime::parse_from_rfc3339(&created).app()?;
        let age = now.signed_duration_since(time).num_seconds();
        let bucket = if age < 86400 {
            time.timestamp().div_euclid(3600)
        } else {
            time.timestamp().div_euclid(86400)
        };
        let spaced = buckets.insert((scope, age >= 86400, bucket));
        let keep =
            (*count < 8 || (age < 30 * 86400 && spaced)) && *count < 40 && used + bytes <= budget;
        if keep {
            *count += 1;
            used += bytes;
        } else {
            c.execute("DELETE FROM automatic_versions WHERE id=?", [&id])
                .app()?;
            c.execute("DELETE FROM versions WHERE id=?", [&id]).app()?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::TextPatch;
    fn save(root: &Path, id: &str, text: &str) {
        let revision = project::load(root)
            .unwrap()
            .sections
            .iter()
            .find(|s| s.id == id)
            .unwrap()
            .revision;
        project::save(
            root,
            vec![TextPatch {
                id: id.into(),
                revision,
                text: text.into(),
                outline: None,
            }],
        )
        .unwrap();
    }
    fn setup() -> (tempfile::TempDir, String) {
        let d = tempfile::tempdir().unwrap();
        let id = project::create(d.path(), "Versions").unwrap().sections[0]
            .id
            .clone();
        (d, id)
    }
    #[test]
    fn checkpoints_latest_text_without_duplicate_or_cursor_versions() {
        let (d, id) = setup();
        save(d.path(), &id, "Départ.");
        assert!(checkpoint(d.path(), &id).unwrap().is_none());
        save(d.path(), &id, "Départ. La suite.");
        assert_eq!(super::super::list(d.path()).unwrap().len(), 1);
        let v = checkpoint(d.path(), &id).unwrap().unwrap();
        assert_eq!(v.sections[0].text, "Départ. La suite.");
        let c = project::database(d.path()).unwrap();
        c.execute("UPDATE sections SET revision=revision+1 WHERE id=?", [&id])
            .unwrap();
        c.execute(
            "UPDATE meta SET value='{\"cursor\":42}' WHERE key='settings'",
            [],
        )
        .unwrap();
        assert!(checkpoint(d.path(), &id).unwrap().is_none());
        assert_eq!(super::super::list(d.path()).unwrap().len(), 2);
    }
    #[test]
    fn long_sessions_capture_after_five_minutes() {
        let (d, id) = setup();
        save(d.path(), &id, "Départ.");
        let c = project::database(d.path()).unwrap();
        c.execute(
            "UPDATE versions SET created=?",
            [(Utc::now() - chrono::Duration::minutes(6)).to_rfc3339()],
        )
        .unwrap();
        save(d.path(), &id, "Départ. Six minutes plus tard.");
        let versions = super::super::list(d.path()).unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!(
            super::super::get(d.path(), &versions[0].id)
                .unwrap()
                .sections[0]
                .text,
            "Départ. Six minutes plus tard."
        );
    }
    #[test]
    fn preserves_recent_writing_before_a_large_replacement_and_restores_it() {
        let (d, id) = setup();
        let text = "Une biographie 🙂. ".repeat(30);
        save(d.path(), &id, &text);
        let recent = format!("{text}Dernière phrase.");
        save(d.path(), &id, &recent);
        save(d.path(), &id, "Nouveau départ.");
        let versions = super::super::list(d.path()).unwrap();
        let v = versions
            .iter()
            .find(|v| super::super::get(d.path(), &v.id).unwrap().sections[0].text == recent)
            .unwrap();
        let restored = super::super::restore(d.path(), &v.id).unwrap();
        assert_eq!(restored.sections[0].text, recent);
    }
    #[test]
    fn deletion_in_repeated_text_does_not_overlap_prefix_and_suffix() {
        let (d, id) = setup();
        save(d.path(), &id, &"é".repeat(400));
        save(d.path(), &id, &"é".repeat(600));
        save(d.path(), &id, &"é".repeat(300));
        assert!(super::super::list(d.path())
            .unwrap()
            .iter()
            .any(
                |v| super::super::get(d.path(), &v.id).unwrap().sections[0].text == "é".repeat(600)
            ));
    }
    #[test]
    fn failed_save_rolls_back_its_automatic_checkpoint() {
        let (d, id) = setup();
        save(d.path(), &id, &"a".repeat(400));
        save(d.path(), &id, &format!("{}b", "a".repeat(400)));
        let c = project::database(d.path()).unwrap();
        let before = super::super::list(d.path()).unwrap().len();
        c.execute_batch("CREATE TRIGGER fail_save BEFORE UPDATE OF text ON sections BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        let revision = project::load(d.path()).unwrap().sections[0].revision;
        assert!(project::save(
            d.path(),
            vec![TextPatch {
                id,
                revision,
                text: "replacement".into(),
                outline: None
            }]
        )
        .is_err());
        assert_eq!(super::super::list(d.path()).unwrap().len(), before);
    }
    #[test]
    fn retention_spaces_old_versions_and_preserves_manual_and_legacy_versions() {
        let (d, id) = setup();
        let manual =
            super::super::capture(d.path(), "Sauvegarde automatique", Some(id.clone())).unwrap();
        let c = project::database(d.path()).unwrap();
        prepare(&c).unwrap();
        for n in 0..120 {
            let created = (Utc::now() - chrono::Duration::minutes(n * 30)).to_rfc3339();
            c.execute(
                "INSERT INTO versions VALUES(?,?,?,?,'[]')",
                params![format!("auto-{n}"), "Auto", created, id],
            )
            .unwrap();
            c.execute(
                "INSERT INTO automatic_versions VALUES(?,'fingerprint',100)",
                [format!("auto-{n}")],
            )
            .unwrap();
        }
        prune(&c, Utc::now(), BUDGET).unwrap();
        let count: i64 = c
            .query_row("SELECT COUNT(*) FROM automatic_versions", [], |r| r.get(0))
            .unwrap();
        assert!((8..=40).contains(&count));
        for n in 0..8 {
            assert!(c
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM versions WHERE id=?)",
                    [format!("auto-{n}")],
                    |r| r.get::<_, bool>(0)
                )
                .unwrap());
        }
        prune(&c, Utc::now(), 300).unwrap();
        assert_eq!(
            c.query_row("SELECT SUM(bytes) FROM automatic_versions", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            300
        );
        assert!(super::super::get(d.path(), &manual.id).is_ok());
    }
    #[test]
    fn restoration_recovers_pinned_cards() {
        let (d, id) = setup();
        save(d.path(), &id, "Biographie.");
        let c = project::database(d.path()).unwrap();
        c.execute_batch(
            "CREATE TABLE margin_pins(section TEXT,source TEXT,PRIMARY KEY(section,source));",
        )
        .unwrap();
        c.execute("INSERT INTO margin_pins VALUES(?,'person')", [&id])
            .unwrap();
        c.execute("INSERT INTO links VALUES(?,'person','{}')", [&id])
            .unwrap();
        let version = checkpoint(d.path(), &id).unwrap().unwrap();
        c.execute("DELETE FROM margin_pins", []).unwrap();
        c.execute("DELETE FROM links", []).unwrap();
        super::super::restore(d.path(), &version.id).unwrap();
        assert_eq!(
            c.query_row(
                "SELECT source FROM margin_pins WHERE section=?",
                [&id],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "person"
        );
    }
}
