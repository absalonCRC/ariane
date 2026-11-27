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
            writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
                    writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
                writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
                writing_aids: None,
                id: first.id.clone(),
                revision: 1,
                text: "new".into(),
                outline: None
            },
            TextPatch {
                writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
            id: id.clone(),
            revision: 0,
            text: "A\nB".into(),
            outline: Some(outline(&[("a", None, 0), ("b", None, 2)])),
        }],
    )
    .unwrap();
    fs::write(scene_path(d.path(), &id), "Outside").unwrap();
    let resolved = resolve_external(d.path(), &id, false, Some("Pending".into()), None).unwrap();
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
            writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
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
            writing_aids: None,
            id: id.clone(),
            revision: 1,
            text: "new local".into(),
            outline: None,
        }]
    )
    .unwrap_err()
    .starts_with("EXTERNAL"));
    assert_eq!(
        resolve_external(d.path(), id, false, Some("unsaved local".into()), None)
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

#[test]
fn reorder_requires_every_live_section_and_an_existing_moved_section() {
    let d = tempfile::tempdir().unwrap();
    let p = create(d.path(), "Test").unwrap();
    let first = p.sections[0].id.clone();
    let second = add(d.path(), None, "Deux", "scene").unwrap();
    let second = second.last().unwrap().id.clone();
    let order = vec![second.clone(), first.clone()];
    for invalid in [vec![first.clone()], vec![first.clone(), first.clone()]] {
        assert!(reorder(d.path(), &invalid, &first, None).is_err());
    }
    assert!(reorder(d.path(), &order, "absent", None).is_err());
    assert_eq!(load(d.path()).unwrap().sections[0].id, first);
    assert_eq!(
        reorder(d.path(), &order, &second, None).unwrap()[0].id,
        second
    );
}
