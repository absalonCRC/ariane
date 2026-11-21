use super::{backup, model::*, storage, transfer};
use crate::project;
fn ready(c: &mut rusqlite::Connection, text: &str) -> Capture {
    let value = storage::draft(c).unwrap();
    let value = storage::save(
        c,
        &value.id,
        value.revision,
        &uuid::Uuid::new_v4().to_string(),
        text,
        Selection {
            anchor: 0,
            head: text.encode_utf16().count(),
        },
    )
    .unwrap();
    storage::finish(
        c,
        &value.id,
        value.revision,
        &uuid::Uuid::new_v4().to_string(),
    )
    .unwrap();
    storage::get(c, &value.id).unwrap()
}
#[test]
fn saves_are_durable_revisioned_and_replayable_without_erasing_newer_text() {
    let d = tempfile::tempdir().unwrap();
    let mut c = storage::db(d.path()).unwrap();
    let draft = storage::draft(&mut c).unwrap();
    let first = storage::save(
        &mut c,
        &draft.id,
        0,
        "save-one",
        "Été 🌿",
        Selection { anchor: 6, head: 6 },
    )
    .unwrap();
    let second = storage::save(
        &mut c,
        &draft.id,
        1,
        "save-two",
        "Été 🌿 demain",
        Selection::default(),
    )
    .unwrap();
    assert_eq!(
        storage::save(
            &mut c,
            &draft.id,
            0,
            "save-one",
            "Été 🌿",
            Selection { anchor: 6, head: 6 }
        )
        .unwrap(),
        first
    );
    assert!(storage::save(
        &mut c,
        &draft.id,
        0,
        "save-three",
        "ancien",
        Selection::default()
    )
    .is_err());
    assert!(storage::save(
        &mut c,
        &draft.id,
        0,
        "save-one",
        "autre",
        Selection::default()
    )
    .is_err());
    drop(c);
    let mut c = storage::db(d.path()).unwrap();
    assert_eq!(storage::draft(&mut c).unwrap(), second);
    assert!(storage::save(
        &mut c,
        &draft.id,
        2,
        "bad-selection",
        "court",
        Selection {
            anchor: 99,
            head: 99
        }
    )
    .is_err());
}
#[test]
fn finish_response_loss_never_finishes_the_following_draft() {
    let d = tempfile::tempdir().unwrap();
    let mut c = storage::db(d.path()).unwrap();
    let initial = storage::draft(&mut c).unwrap();
    let value = storage::save(
        &mut c,
        &initial.id,
        0,
        "s",
        "Une idée",
        Selection::default(),
    )
    .unwrap();
    let next = storage::finish(&mut c, &value.id, value.revision, "finish").unwrap();
    storage::save(&mut c, &next.id, 0, "s2", "Deuxième", Selection::default()).unwrap();
    assert_eq!(
        storage::finish(&mut c, &value.id, value.revision, "finish")
            .unwrap()
            .id,
        next.id
    );
    assert_eq!(storage::draft(&mut c).unwrap().text, "Deuxième");
    assert_eq!(storage::list(&c, "", false, 0).unwrap().items.len(), 1);
    assert!(storage::finish(&mut c, &value.id, value.revision, "other").is_err());
}
#[test]
fn interrupted_transfer_uses_the_receipt_and_preserves_later_edits_and_restoration() {
    let d = tempfile::tempdir().unwrap();
    let mut c = storage::db(d.path()).unwrap();
    let capture = ready(&mut c, "Idée 🌿\nUn passage complet.");
    let root = d.path().join("book");
    project::create(&root, "Projet").unwrap();
    let _guard = project::ProjectGuard::acquire(&root).unwrap();
    let before = crate::history::capture(&root, "Avant", None).unwrap();
    let request = Transfer {
        operation_id: "transfer-one".into(),
        capture_id: capture.id.clone(),
        capture_revision: capture.revision,
        project_path: root.to_string_lossy().into(),
        project_id: project::capture_import::identity(&root).unwrap(),
        branch_id: "main".into(),
        title: "Une idée".into(),
    };
    let (capture, destination) = transfer::begin(&c, &request).unwrap();
    assert!(project::capture_import::apply(&root, &capture, &destination).unwrap());
    // Simulate lost mirror and lost global acknowledgement after the project commit.
    assert!(!project::capture_import::apply(&root, &capture, &destination).unwrap());
    assert_eq!(storage::get(&c, &capture.id).unwrap().status, "ready");
    let filed = transfer::apply(&c, &root, &request).unwrap();
    assert_eq!(filed.status, "filed");
    let mut project = project::load(&root).unwrap();
    let imported = project
        .sections
        .iter_mut()
        .find(|s| s.id == destination.section_id)
        .unwrap();
    assert_eq!(imported.text, capture.text);
    assert!(!imported.included);
    let id = imported.id.clone();
    project::save(
        &root,
        vec![crate::model::TextPatch {
            writing_aids: None,
            id: id.clone(),
            revision: imported.revision,
            text: "Édition ultérieure".into(),
            outline: None,
        }],
    )
    .unwrap();
    transfer::apply(&c, &root, &request).unwrap();
    assert_eq!(
        project::load(&root)
            .unwrap()
            .sections
            .iter()
            .find(|s| s.id == id)
            .unwrap()
            .text,
        "Édition ultérieure"
    );
    crate::history::restore(&root, &before.id).unwrap();
    transfer::apply(&c, &root, &request).unwrap();
    assert!(!project::load(&root)
        .unwrap()
        .sections
        .iter()
        .any(|s| s.id == id));
    assert_eq!(storage::get(&c, &capture.id).unwrap().text, capture.text);
    let mut wrong = request;
    wrong.project_id = "replaced".into();
    assert!(transfer::apply(&c, &root, &wrong).is_err());
}
#[test]
fn backup_restores_without_overwriting_a_more_recent_draft_or_duplicating_notes() {
    let d = tempfile::tempdir().unwrap();
    let mut c = storage::db(d.path()).unwrap();
    let first = ready(&mut c, "Première capture");
    assert_eq!(
        storage::list(&c, "PREMIÈRE", false, 0).unwrap().items.len(),
        1
    );
    let draft = storage::draft(&mut c).unwrap();
    storage::save(
        &mut c,
        &draft.id,
        0,
        "old",
        "Ancien brouillon",
        Selection::default(),
    )
    .unwrap();
    let path = d.path().join("backup.sqlite");
    backup::snapshot(&c, &path).unwrap();
    let exported =
        rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .unwrap();
    assert_eq!(
        exported
            .pragma_query_value::<String, _>(None, "journal_mode", |r| r.get(0))
            .unwrap(),
        "delete"
    );
    drop(exported);
    storage::save(
        &mut c,
        &draft.id,
        1,
        "new",
        "Brouillon récent",
        Selection::default(),
    )
    .unwrap();
    assert_eq!(backup::restore(&mut c, d.path(), &path).unwrap(), 1);
    assert_eq!(backup::restore(&mut c, d.path(), &path).unwrap(), 0);
    assert_eq!(storage::draft(&mut c).unwrap().text, "Brouillon récent");
    assert_eq!(
        storage::get(&c, &first.id).unwrap().text,
        "Première capture"
    );
    assert!(storage::list(&c, "Ancien", false, 0).unwrap().items.len() == 1);
    let target = tempfile::tempdir().unwrap();
    let mut fresh = storage::db(target.path()).unwrap();
    backup::restore(&mut fresh, target.path(), &path).unwrap();
    assert!(
        storage::list(&fresh, "Première", false, 0)
            .unwrap()
            .items
            .len()
            == 1
    );
    assert_eq!(storage::draft(&mut fresh).unwrap().text, "Ancien brouillon");
    assert!(backup::snapshot(&c, &path).is_err());
}

#[test]
fn migration_from_v4_preserves_identity_and_a_coherent_backup() {
    let d = tempfile::tempdir().unwrap();
    project::create(d.path(), "Migration").unwrap();
    let identity = project::capture_import::identity(d.path()).unwrap();
    let c = project::database(d.path()).unwrap();
    c.execute_batch("DROP TABLE capture_receipts;ALTER TABLE sections DROP COLUMN writing_aids;PRAGMA user_version=4;")
        .unwrap();
    drop(c);
    let c = project::database(d.path()).unwrap();
    assert_eq!(
        c.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        6
    );
    assert_eq!(
        project::capture_import::identity(d.path()).unwrap(),
        identity
    );
    let copies = std::fs::read_dir(d.path().join("recuperation"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("avant-captures")
        })
        .collect::<Vec<_>>();
    assert_eq!(copies.len(), 1);
    let backup = rusqlite::Connection::open(&copies[0]).unwrap();
    assert_eq!(
        backup
            .pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        4
    );
    c.execute_batch("PRAGMA user_version=7").unwrap();
    drop(c);
    assert!(project::database(d.path()).is_err());
}
#[test]
fn invalid_and_future_backups_do_not_change_the_current_draft() {
    let d = tempfile::tempdir().unwrap();
    let mut c = storage::db(d.path()).unwrap();
    let draft = storage::draft(&mut c).unwrap();
    storage::save(
        &mut c,
        &draft.id,
        0,
        "current",
        "Texte à garder",
        Selection::default(),
    )
    .unwrap();
    let path = d.path().join("invalid.sqlite");
    std::fs::write(&path, b"not sqlite").unwrap();
    assert!(backup::restore(&mut c, d.path(), &path).is_err());
    let future = d.path().join("future.sqlite");
    backup::snapshot(&c, &future).unwrap();
    let newer = rusqlite::Connection::open(&future).unwrap();
    newer.execute_batch("PRAGMA user_version=2").unwrap();
    drop(newer);
    assert!(backup::restore(&mut c, d.path(), &future).is_err());
    let oversized = d.path().join("oversized.sqlite");
    backup::snapshot(&c, &oversized).unwrap();
    let malformed = rusqlite::Connection::open(&oversized).unwrap();
    malformed
        .execute("UPDATE captures SET payload=zeroblob(16777217)", [])
        .unwrap();
    drop(malformed);
    assert!(backup::restore(&mut c, d.path(), &oversized).is_err());
    assert_eq!(storage::draft(&mut c).unwrap().text, "Texte à garder");
}

#[test]
fn retry_receipts_do_not_duplicate_full_drafts_and_preferences_reject_reserved_keys() {
    let d = tempfile::tempdir().unwrap();
    let mut c = storage::db(d.path()).unwrap();
    let draft = storage::draft(&mut c).unwrap();
    let text = "un passage ".repeat(10000);
    let saved = storage::save(
        &mut c,
        &draft.id,
        0,
        "large-save",
        &text,
        Selection::default(),
    )
    .unwrap();
    let size: i64 = c
        .query_row(
            "SELECT length(input)+length(output) FROM operations WHERE id='large-save'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(size < 1000);
    assert_eq!(
        storage::save(
            &mut c,
            &draft.id,
            0,
            "large-save",
            &text,
            Selection::default()
        )
        .unwrap(),
        saved
    );
    let bad = Preferences {
        shortcut: Some("Mod+Q".into()),
        ..Preferences::default()
    };
    assert!(storage::set_preferences(&c, &bad).is_err());
    assert_eq!(storage::preferences(&c).unwrap(), Preferences::default());
}
