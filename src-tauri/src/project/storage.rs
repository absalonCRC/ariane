use super::mirrors::{mirror, scene_disk, validate_disk};
use super::{all_sections, database, row_section};
use crate::{
    error::{AppResult, Result},
    model::*,
};
use rusqlite::{params, TransactionBehavior};
use sha2::{Digest, Sha256};
use std::path::Path;
pub fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
pub fn load(root: &Path) -> Result<Project> {
    super::with_lock(root, || load_unlocked(root))
}
pub(crate) fn load_unlocked(root: &Path) -> Result<Project> {
    let root_dir = super::io::Dir::open(root)?;
    if root_dir
        .open_file("ariane.sqlite", libc::O_RDONLY, 0)?
        .is_none()
    {
        return Err("Ce dossier ne contient pas de projet ariane.".into());
    }
    let c = database(root)?;
    let mut recovered = false;
    let mut conflicts = vec![];
    // Read each section only once, including trash. It is important that all
    // ids are validated before any mirror is touched.
    let all = all_sections(&c)?;
    let mirrors = {
        let mut query = c.prepare("SELECT s.id,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id").app()?;
        let rows = query
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    (r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?),
                ))
            })
            .app()?;
        rows.collect::<std::result::Result<std::collections::HashMap<_, _>, _>>()
            .app()?
    };
    for s in all.iter().filter(|s| !s.trashed && s.kind == "scene") {
        let (stored, pending) = mirrors.get(&s.id).ok_or("Section introuvable.")?;
        let disk = scene_disk(&root_dir, &s.id)?;
        let desired = hash(&s.text);
        let disk_hash = disk.as_ref().map(|text| hash(text));
        let base = pending.as_ref().unwrap_or(stored);
        if let Some(actual) = disk_hash.as_ref() {
            // A pending write can have reached disk before its DB acknowledgement.
            if !base.is_empty() && actual != base && (pending.is_none() || actual != &desired) {
                conflicts.push(s.id.clone());
                continue;
            }
            if pending.is_some() && base.is_empty() && actual != &desired {
                conflicts.push(s.id.clone());
                continue;
            }
        }
        if pending.is_some() || stored != &desired || disk.is_none() {
            mirror(&root_dir, &c, s)?;
            recovered |= pending.is_some() || !stored.is_empty();
        }
    }
    let name = c
        .query_row("SELECT value FROM meta WHERE key='name'", [], |r| r.get(0))
        .app()?;
    let settings: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .unwrap_or("{}".into());
    let (trash, sections): (Vec<_>, Vec<_>) = all.into_iter().partition(|s| s.trashed);
    Ok(Project {
        smart_tags: super::tags::definitions(&c)?,
        path: root.to_string_lossy().into(),
        name,
        sections,
        settings: serde_json::from_str(&settings).unwrap_or_default(),
        recovered,
        trash,
        can_undo_structure: c
            .query_row("SELECT EXISTS(SELECT 1 FROM structure_history)", [], |r| {
                r.get(0)
            })
            .app()?,
        conflicts,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorError {
    pub id: String,
    pub message: String,
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReport {
    pub sections: Vec<Section>,
    pub mirror_errors: Vec<MirrorError>,
}
/// Compatibility wrapper for existing local callers. The app should use
/// `save_report` so that a durable commit and a failed mirror are distinct.
#[cfg(any(test, feature = "performance-harness"))]
pub fn save(root: &Path, patches: Vec<TextPatch>) -> Result<Vec<Section>> {
    Ok(save_report(root, patches)?.sections)
}
pub fn save_report(root: &Path, patches: Vec<TextPatch>) -> Result<SaveReport> {
    save_report_with(root, patches, |_| Ok(()))
}
fn save_report_with(
    root: &Path,
    patches: Vec<TextPatch>,
    mut before_mirror: impl FnMut(&Section) -> Result<()>,
) -> Result<SaveReport> {
    super::with_lock(root, || {
        let root_dir = super::io::Dir::open(root)?;
        let mut c = database(root)?;
        let smart_tags = super::tags::definitions(&c)?;
        let mut seen = std::collections::HashSet::new();
        for patch in &patches {
            if let Some(outline) = &patch.outline {
                for node in &outline.nodes { super::tags::validate_ids(&node.tag_ids, &smart_tags)?; }
            }
            super::validate_id(&patch.id)?;
            if !seen.insert(&patch.id) {
                return Err(
                    "Une section ne peut être sauvegardée deux fois dans le même lot.".into(),
                );
            }
            let (rev, old, raw, mir, pending): (i64, String, Option<String>, String, Option<String>) = c.query_row(
                "SELECT s.revision,s.text,s.outline,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id WHERE s.id=?", [&patch.id],
                |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).app()?;
            if rev != patch.revision {
                return Err(
                    "Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into(),
                );
            }
            let old_outline = raw
                .map(|json| serde_json::from_str::<Outline>(&json).app())
                .transpose()?;
            effective_outline(patch, &old, old_outline)?;
            validate_disk(&root_dir, &patch.id, &old, &mir, pending.as_deref())?;
        }
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .app()?;
        for p in &patches {
            let (rev, old, raw, mir, pending): (i64, String, Option<String>, String, Option<String>) = tx.query_row(
                "SELECT s.revision,s.text,s.outline,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id WHERE s.id=?", [&p.id],
                |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).app()?;
            if rev != p.revision {
                return Err(
                    "Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into(),
                );
            }
            let base = validate_disk(&root_dir, &p.id, &old, &mir, pending.as_deref())?;
            let old_outline = raw
                .map(|json| serde_json::from_str::<Outline>(&json).app())
                .transpose()?;
            let next_outline = effective_outline(p, &old, old_outline.clone())?;
            if old != p.text || old_outline != next_outline {
                // Keep the pre-edit state before a substantial deletion or replacement.
                if !old.is_empty() {
                    let prefix = old
                        .chars()
                        .zip(p.text.chars())
                        .take_while(|(a, b)| a == b)
                        .count();
                    let suffix = old
                        .chars()
                        .rev()
                        .zip(p.text.chars().rev())
                        .take_while(|(a, b)| a == b)
                        .count();
                    let length = old.chars().count();
                    let shared_tail = suffix
                        .min(length.saturating_sub(prefix))
                        .min(p.text.chars().count().saturating_sub(prefix));
                    let removed = length.saturating_sub(prefix + shared_tail);
                    crate::history::checkpoint_with(
                        &tx,
                        &p.id,
                        removed >= 200 && removed >= length / 3,
                    )?;
                }
                let encoded = next_outline
                    .map(|outline| serde_json::to_string(&outline).app())
                    .transpose()?;
                tx.execute(
                    "UPDATE sections SET text=?,outline=?,revision=revision+1 WHERE id=?",
                    params![p.text, encoded, p.id],
                )
                .app()?;
                if !p.text.is_empty() {
                    crate::history::checkpoint_with(&tx, &p.id, false)?;
                }
            }
            tx.execute("INSERT INTO mirror_pending(id,base) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET base=excluded.base", params![p.id, base]).app()?;
        }
        let mut saved = Vec::with_capacity(patches.len());
        {
            let mut query = tx.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included,tag_ids FROM sections WHERE id=?").app()?;
            for p in &patches {
                saved.push(query.query_row([&p.id], row_section).app()?);
            }
        }
        tx.commit().app()?;
        let mut mirror_errors = Vec::new();
        for section in &saved {
            if let Err(message) =
                before_mirror(section).and_then(|_| mirror(&root_dir, &c, section))
            {
                mirror_errors.push(MirrorError {
                    id: section.id.clone(),
                    message,
                });
            }
        }
        Ok(SaveReport {
            sections: saved,
            mirror_errors,
        })
    })
}

fn effective_outline(
    patch: &TextPatch,
    old_text: &str,
    old: Option<Outline>,
) -> Result<Option<Outline>> {
    let next = if let Some(outline) = &patch.outline {
        Some(outline.clone())
    } else if old_text == patch.text {
        old
    } else {
        None
    };
    if let Some(outline) = &next {
        super::outline::validate(outline, &patch.text)?;
    }
    Ok(next)
}

#[cfg(test)]
pub fn scene_path(root: &Path, id: &str) -> std::path::PathBuf {
    root.join("manuscrit").join(format!("{id}.md"))
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{add, create, reorder, resolve_external};
    use rusqlite::Connection;
    use std::fs;
    #[test]
    fn rejects_database_ids_that_escape_the_project() {
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("project");
        let initial = create(&root, "A").unwrap();
        let witness = parent.path().join("outside.md");
        std::fs::write(&witness, "witness").unwrap();
        let c = database(&root).unwrap();
        c.execute(
            "UPDATE sections SET id='../outside' WHERE id=?",
            [&initial.sections[0].id],
        )
        .unwrap();
        drop(c);
        assert!(load(&root).is_err());
        assert_eq!(std::fs::read_to_string(witness).unwrap(), "witness");
    }
    #[cfg(unix)]
    #[test]
    fn refuses_redirected_internal_paths_and_ignores_predictable_temp_symlink() {
        use std::os::unix::fs::symlink;
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("project");
        let id = create(&root, "A").unwrap().sections[0].id.clone();
        let witness = parent.path().join("witness");
        std::fs::write(&witness, "witness").unwrap();
        symlink(&witness, root.join("manuscrit").join(format!("{id}.tmp"))).unwrap();
        save(
            &root,
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "Texte".into(),
                outline: None,
            }],
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&witness).unwrap(), "witness");
        std::fs::rename(root.join("manuscrit"), root.join("old-manuscrit")).unwrap();
        symlink(parent.path(), root.join("manuscrit")).unwrap();
        assert!(load(&root).is_err());
        assert!(save(
            &root,
            vec![TextPatch {
                id,
                revision: 1,
                text: "Autre".into(),
                outline: None
            }]
        )
        .is_err());
        assert_eq!(std::fs::read_to_string(&witness).unwrap(), "witness");
    }
    #[test]
    fn opened_directory_descriptor_survives_a_path_swap_without_following_it() {
        use std::os::unix::fs::symlink;
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("project");
        create(&root, "A").unwrap();
        let outside = d.path().join("outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("test.md"), "witness").unwrap();
        let directory = super::super::io::Dir::open(&root)
            .unwrap()
            .child("manuscrit", false)
            .unwrap()
            .unwrap();
        fs::rename(root.join("manuscrit"), root.join("previous")).unwrap();
        symlink(&outside, root.join("manuscrit")).unwrap();
        directory.write_atomic("test.md", "new").unwrap();
        assert_eq!(
            fs::read_to_string(outside.join("test.md")).unwrap(),
            "witness"
        );
        assert_eq!(
            fs::read_to_string(root.join("previous/test.md")).unwrap(),
            "new"
        );
    }
    #[test]
    fn mirror_failure_acknowledges_commit_and_recovers_on_next_open() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let report = save_report_with(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "Durable".into(),
                outline: None,
            }],
            |_| Err("injected mirror error".into()),
        )
        .unwrap();
        assert_eq!(report.sections[0].revision, 1);
        assert_eq!(report.mirror_errors.len(), 1);
        let loaded = load(d.path()).unwrap();
        assert_eq!(loaded.sections[0].revision, 1);
        assert_eq!(loaded.sections[0].text, "Durable");
        assert!(loaded.conflicts.is_empty());
        assert_eq!(
            std::fs::read_to_string(scene_path(d.path(), &id)).unwrap(),
            "Durable"
        );
        let saved = save(
            d.path(),
            vec![TextPatch {
                id,
                revision: 1,
                text: "Suite".into(),
                outline: None,
            }],
        )
        .unwrap();
        assert_eq!(saved[0].revision, 2);
    }
    #[test]
    fn simultaneous_writers_never_leave_mirrors_behind_committed_revision() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let mut joins = Vec::new();
        for text in ["un", "deux"] {
            let root = d.path().to_owned();
            let id = id.clone();
            let barrier = barrier.clone();
            joins.push(std::thread::spawn(move || {
                barrier.wait();
                save(
                    &root,
                    vec![TextPatch {
                        id,
                        revision: 0,
                        text: text.into(),
                        outline: None,
                    }],
                )
            }));
        }
        barrier.wait();
        let results: Vec<_> = joins.into_iter().map(|j| j.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        let loaded = load(d.path()).unwrap();
        assert!(loaded.conflicts.is_empty());
        assert_eq!(
            std::fs::read_to_string(scene_path(d.path(), &id)).unwrap(),
            loaded.sections[0].text
        );
    }
    fn outline(nodes: &[(&str, Option<&str>, usize)]) -> Outline {
        Outline {
            version: 1,
            nodes: nodes
                .iter()
                .map(|(id, parent, start)| OutlineNode { properties: Default::default(), property_conflicts: Default::default(), tag_ids: vec![],
                    id: (*id).into(),
                    parent: parent.map(str::to_owned),
                    start: *start,
                })
                .collect(),
        }
    }
    #[test]
    fn structured_save_reopens_and_metadata_change_increments_revision() {
        let d = tempfile::tempdir().unwrap();
        let s = create(d.path(), "A").unwrap().sections.remove(0);
        let first = outline(&[("a", None, 0), ("b", Some("a"), 2)]);
        let saved = save(
            d.path(),
            vec![TextPatch {
                id: s.id.clone(),
                revision: 0,
                text: "A\nB".into(),
                outline: Some(first.clone()),
            }],
        )
        .unwrap();
        assert_eq!(saved[0].revision, 1);
        assert_eq!(load(d.path()).unwrap().sections[0].outline, Some(first));
        let second = outline(&[("a", None, 0), ("b", None, 2)]);
        let saved = save(
            d.path(),
            vec![TextPatch {
                id: s.id.clone(),
                revision: 1,
                text: "A\nB".into(),
                outline: Some(second.clone()),
            }],
        )
        .unwrap();
        assert_eq!(saved[0].revision, 2);
        assert_eq!(load(d.path()).unwrap().sections[0].outline, Some(second));
    }
    #[test]
    fn rejects_invalid_outline_without_changing_saved_text() {
        let d = tempfile::tempdir().unwrap();
        let s = create(d.path(), "A").unwrap().sections.remove(0);
        let bad = [
            (
                "A\nB",
                outline(&[("a", None, 0), ("b", Some("missing"), 2)]),
            ),
            ("A\nB", outline(&[("a", Some("b"), 0), ("b", Some("a"), 2)])),
            ("A\nB", outline(&[("a", None, 0), ("b", None, 4)])),
            ("😀\nB", outline(&[("a", None, 0), ("b", None, 1)])),
            ("A\nB", outline(&[("a", None, 0), ("b", None, 1)])),
            (
                "A\nB\nC",
                outline(&[("a", None, 0), ("b", None, 2), ("c", Some("a"), 4)]),
            ),
            ("A\nB", outline(&[("a", None, 0), ("a", None, 2)])),
            ("A\nB", outline(&[("a", None, 1), ("b", None, 2)])),
            (
                "A\nB",
                Outline {
                    version: 2,
                    nodes: vec![OutlineNode { properties: Default::default(), property_conflicts: Default::default(), tag_ids: vec![],
                        id: "a".into(),
                        parent: None,
                        start: 0,
                    }],
                },
            ),
        ];
        for (text, outline) in bad {
            assert!(save(
                d.path(),
                vec![TextPatch {
                    id: s.id.clone(),
                    revision: 0,
                    text: text.into(),
                    outline: Some(outline),
                }]
            )
            .is_err());
            let current = load(d.path()).unwrap().sections.remove(0);
            assert_eq!(current.text, "");
            assert_eq!(current.revision, 0);
        }
    }
    #[test]
    fn stale_batch_rolls_back_all_patches() {
        let d = tempfile::tempdir().unwrap();
        let first = create(d.path(), "A").unwrap().sections.remove(0);
        let second = add(d.path(), None, "Second", "scene").unwrap().remove(1);
        save(
            d.path(),
            vec![TextPatch {
                id: first.id.clone(),
                revision: 0,
                text: "existing".into(),
                outline: None,
            }],
        )
        .unwrap();
        save(
            d.path(),
            vec![TextPatch {
                id: second.id.clone(),
                revision: 0,
                text: "current".into(),
                outline: None,
            }],
        )
        .unwrap();
        let versions_before = crate::history::list(d.path())
            .unwrap()
            .into_iter()
            .map(|v| v.id)
            .collect::<Vec<_>>();
        assert!(save(
            d.path(),
            vec![
                TextPatch {
                    id: first.id.clone(),
                    revision: 1,
                    text: "new".into(),
                    outline: None
                },
                TextPatch {
                    id: second.id.clone(),
                    revision: 0,
                    text: "stale".into(),
                    outline: None
                },
            ]
        )
        .is_err());
        let all = load(d.path()).unwrap().sections;
        assert_eq!(
            all.iter().find(|s| s.id == first.id).unwrap().text,
            "existing"
        );
        assert_eq!(
            crate::history::list(d.path())
                .unwrap()
                .into_iter()
                .map(|v| v.id)
                .collect::<Vec<_>>(),
            versions_before
        );
    }
    #[test]
    fn migrates_legacy_sections_schema() {
        let d = tempfile::tempdir().unwrap();
        let c = Connection::open(d.path().join("ariane.sqlite")).unwrap();
        c.execute_batch("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('name','Legacy'); INSERT INTO meta VALUES('settings','{}'); CREATE TABLE sections(id TEXT PRIMARY KEY,parent TEXT,title TEXT NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL,text TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,synopsis TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Brouillon',goal INTEGER NOT NULL DEFAULT 0,mirror TEXT NOT NULL DEFAULT ''); INSERT INTO sections(id,title,kind,position,text) VALUES('old','Old','scene',1,'legacy text');").unwrap();
        drop(c);
        let loaded = load(d.path()).unwrap();
        assert_eq!(loaded.sections[0].text, "legacy text");
        assert_eq!(loaded.sections[0].outline, None);
        let c = database(d.path()).unwrap();
        let marker: String = c
            .query_row(
                "SELECT value FROM meta WHERE key='outline_schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(marker, "1");
    }
    #[test]
    fn omitted_outline_preserves_same_text_and_clears_changed_text() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let structure = outline(&[("a", None, 0), ("b", None, 2)]);
        save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "A\nB".into(),
                outline: Some(structure.clone()),
            }],
        )
        .unwrap();
        let same = save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 1,
                text: "A\nB".into(),
                outline: None,
            }],
        )
        .unwrap();
        assert_eq!(same[0].revision, 1);
        assert_eq!(same[0].outline, Some(structure));
        let changed = save(
            d.path(),
            vec![TextPatch {
                id,
                revision: 1,
                text: "Changed".into(),
                outline: None,
            }],
        )
        .unwrap();
        assert_eq!(changed[0].outline, None);
        assert_eq!(changed[0].revision, 2);
    }
    #[test]
    fn accepts_empty_last_node_after_trailing_newline() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let structure = outline(&[("a", None, 0), ("b", None, 2)]);
        let saved = save(
            d.path(),
            vec![TextPatch {
                id,
                revision: 0,
                text: "A\n".into(),
                outline: Some(structure.clone()),
            }],
        )
        .unwrap();
        assert_eq!(saved[0].outline, Some(structure));
    }
    #[test]
    fn external_resolution_clears_stale_outline_and_keeps_recovery_copy() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "A\nB".into(),
                outline: Some(outline(&[("a", None, 0), ("b", None, 2)])),
            }],
        )
        .unwrap();
        fs::write(scene_path(d.path(), &id), "Outside").unwrap();
        let resolved = resolve_external(d.path(), &id, false, Some("Pending".into())).unwrap();
        assert_eq!(resolved.sections[0].text, "Outside");
        assert_eq!(resolved.sections[0].outline, None);
        let copies = fs::read_dir(d.path().join("recuperation"))
            .unwrap()
            .map(|e| fs::read_to_string(e.unwrap().path()).unwrap())
            .collect::<Vec<_>>();
        assert!(copies.contains(&"Pending".to_owned()));
    }
    #[test]
    fn save_reopen_and_reject_stale() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let s = &p.sections[0];
        save(
            d.path(),
            vec![TextPatch {
                id: s.id.clone(),
                revision: 0,
                text: "Été à Toulouse".into(),
                outline: None,
            }],
        )
        .unwrap();
        assert_eq!(load(d.path()).unwrap().sections[0].text, "Été à Toulouse");
        assert!(save(
            d.path(),
            vec![TextPatch {
                id: s.id.clone(),
                revision: 0,
                text: "Stale".into(),
                outline: None,
            }]
        )
        .is_err());
    }
    #[test]
    fn external_edit_is_preserved() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let id = &p.sections[0].id;
        save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "local".into(),
                outline: None,
            }],
        )
        .unwrap();
        fs::write(scene_path(d.path(), id), "external").unwrap();
        let opened = load(d.path()).unwrap();
        assert_eq!(opened.conflicts, vec![id.clone()]);
        assert_eq!(opened.sections[0].text, "local");
        assert_eq!(
            fs::read_to_string(scene_path(d.path(), id)).unwrap(),
            "external"
        );
        assert!(save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 1,
                text: "new local".into(),
                outline: None,
            }]
        )
        .unwrap_err()
        .starts_with("EXTERNAL"));
        assert_eq!(
            resolve_external(d.path(), id, false, Some("unsaved local".into()))
                .unwrap()
                .sections[0]
                .text,
            "external"
        );
        let copies = fs::read_dir(d.path().join("recuperation"))
            .unwrap()
            .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
            .collect::<Vec<_>>();
        assert!(copies.contains(&"unsaved local".to_owned()));
    }
    #[test]
    fn recovers_unmaterialized_transaction() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let c = database(d.path()).unwrap();
        c.execute("UPDATE sections SET text='durable',revision=1", [])
            .unwrap();
        let recovered = load(d.path()).unwrap();
        assert!(recovered.recovered);
        assert_eq!(
            fs::read_to_string(scene_path(d.path(), &p.sections[0].id)).unwrap(),
            "durable"
        );
        assert!(!load(d.path()).unwrap().recovered);
    }
    #[test]
    fn rejects_cycle() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let id = &p.sections[0].id;
        assert!(reorder(d.path(), std::slice::from_ref(id), id, Some(id.clone())).is_err());
    }
}
