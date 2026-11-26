use super::merge::{entry, merge_text};
use super::*;
use crate::model::TextPatch;
fn setup() -> (tempfile::TempDir, String) {
    let d = tempfile::tempdir().unwrap();
    let p = project::create(d.path(), "Roman").unwrap();
    let id = p.sections[0].id.clone();
    (d, id)
}
fn write(root: &Path, id: &str, text: &str) {
    let p = project::load(root).unwrap();
    let s = p.sections.iter().find(|s| s.id == id).unwrap();
    project::save(
        root,
        vec![TextPatch {
            writing_aids: None,
            id: id.into(),
            revision: s.revision,
            text: text.into(),
            outline: None,
        }],
    )
    .unwrap();
}
fn variant(root: &Path) -> String {
    history_state(root)
        .unwrap()
        .branches
        .into_iter()
        .find(|b| !b.is_main)
        .unwrap()
        .id
}
#[test]
fn project_goals_and_private_landmarks_survive_variant_switches() {
    let (d, id) = setup();
    let root = d.path();
    create_branch(root, "Essai", None).unwrap();
    let branch = variant(root);
    let prefs = serde_json::json!({"sessionGoal": 20, "sessionWords": 3,
        "tomorrow": {"text": "Reprendre ici", "point": {"section": id, "branch": branch}},
        "lastEdit": {"section": id, "branch": branch}});
    project::settings(root, prefs.clone()).unwrap();
    let main = switch_branch(root, "main").unwrap();
    assert_eq!(main.settings["sessionWords"], 3);
    assert_eq!(main.settings["tomorrow"], prefs["tomorrow"]);
    assert_eq!(main.settings["lastEdit"], prefs["lastEdit"]);
    project::settings(root, serde_json::json!({"tomorrow": null, "sessionWords": 0})).unwrap();
    let other = switch_branch(root, &branch).unwrap();
    assert!(other.settings["tomorrow"].is_null());
    assert_eq!(other.settings["sessionWords"], 0);
}

#[test]
fn variants_keep_unsaved_named_steps_drafts_and_automatic_history_across_reopen() {
    let (d, id) = setup();
    write(d.path(), &id, "Début principal.");
    create_branch(d.path(), "Autre fin", None).unwrap();
    let branch = variant(d.path());
    write(d.path(), &id, "Variante en cours.");
    let versions = super::super::list(d.path()).unwrap();
    assert!(versions
        .iter()
        .all(|v| v.branch_id.as_deref() == Some(&branch)));
    assert!(versions.iter().any(|v| v.automatic));
    assert_eq!(
        switch_branch(d.path(), "main").unwrap().sections[0].text,
        "Début principal."
    );
    write(d.path(), &id, "Principal poursuivi.");
    assert_eq!(
        switch_branch(d.path(), &branch).unwrap().sections[0].text,
        "Variante en cours."
    );
    assert_eq!(
        project::load(d.path()).unwrap().sections[0].text,
        "Variante en cours."
    );
    assert_eq!(
        switch_branch(d.path(), "main").unwrap().sections[0].text,
        "Principal poursuivi."
    );
}
#[test]
fn automatic_promotion_keeps_content_and_survives_retention() {
    let (d, id) = setup();
    write(d.path(), &id, "Un état à retenir.");
    let v = super::super::list(d.path())
        .unwrap()
        .into_iter()
        .find(|v| v.automatic)
        .unwrap();
    let named = promote_version(d.path(), &v.id, "Premier jet").unwrap();
    assert!(!named.automatic);
    assert_eq!(named.created, v.created);
    assert_eq!(named.sections[0].text, "Un état à retenir.");
    write(d.path(), &id, "La suite.");
    super::super::checkpoint(d.path(), &id).unwrap();
    assert_eq!(
        super::super::get(d.path(), &named.id).unwrap().name,
        "Premier jet"
    );
}
#[test]
fn integrates_nonoverlapping_paragraph_edits_and_can_undo() {
    let (d, id) = setup();
    write(d.path(), &id, "Matin.\n\nMilieu.\n\nSoir.");
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    write(d.path(), &id, "Matin.\n\nMilieu.\n\nNuit.");
    switch_branch(d.path(), "main").unwrap();
    write(d.path(), &id, "Aube.\n\nMilieu.\n\nSoir.");
    let preview = merge_preview(d.path(), &branch).unwrap();
    assert!(!preview.entries[0].conflict);
    let p = merge_branch(d.path(), &branch, &preview.token, vec![]).unwrap();
    assert_eq!(p.sections[0].text, "Aube.\n\nMilieu.\n\nNuit.");
    let versions = super::super::list(d.path()).unwrap();
    let recovery = versions
        .iter()
        .find(|v| v.name == "Avant intégration")
        .unwrap();
    assert!(versions.iter().any(|v| v.merge_parent_id.is_some()));
    let again = merge_preview(d.path(), &branch).unwrap();
    assert!(!again.entries.iter().any(|e| e.changed));
    let p = super::super::restore(d.path(), &recovery.id).unwrap();
    assert_eq!(p.sections[0].text, "Aube.\n\nMilieu.\n\nSoir.");
}
#[test]
fn refuses_stale_or_unresolved_merge_without_mutating_either_draft() {
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    write(d.path(), &id, "Variante.");
    switch_branch(d.path(), "main").unwrap();
    write(d.path(), &id, "Principal.");
    let preview = merge_preview(d.path(), &branch).unwrap();
    assert!(preview.entries[0].conflict);
    let count = super::super::list(d.path()).unwrap().len();
    assert!(merge_branch(d.path(), &branch, &preview.token, vec![]).is_err());
    assert_eq!(super::super::list(d.path()).unwrap().len(), count);
    write(d.path(), &id, "Principal récent.");
    assert!(merge_branch(
        d.path(),
        &branch,
        &preview.token,
        vec![MergeResolution {
            id: id.clone(),
            choice: "incoming".into(),
            text: None
        }]
    )
    .unwrap_err()
    .contains("changé"));
    assert_eq!(
        project::load(d.path()).unwrap().sections[0].text,
        "Principal récent."
    );
    let preview = merge_preview(d.path(), &branch).unwrap();
    let p = merge_branch(
        d.path(),
        &branch,
        &preview.token,
        vec![MergeResolution {
            id: id.clone(),
            choice: "custom".into(),
            text: Some("Réécriture choisie.".into()),
        }],
    )
    .unwrap();
    assert_eq!(p.sections[0].text, "Réécriture choisie.");
    assert_eq!(
        switch_branch(d.path(), &branch).unwrap().sections[0].text,
        "Variante."
    );
}
#[test]
fn resolving_text_conflicts_preserves_independent_section_changes() {
    for choice in ["current", "incoming"] {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "Variante.");
        let mut section = project::load(d.path()).unwrap().sections.remove(0);
        section.synopsis = "Résumé de la variante".into();
        project::update(d.path(), &section).unwrap();
        switch_branch(d.path(), "main").unwrap();
        write(d.path(), &id, "Principal.");
        let mut section = project::load(d.path()).unwrap().sections.remove(0);
        section.title = "Titre principal".into();
        project::update(d.path(), &section).unwrap();

        let preview = merge_preview(d.path(), &branch).unwrap();
        assert_eq!(preview.entries[0].fields, vec!["text"]);
        assert_eq!(preview.entries[0].title, "Titre principal");
        let merged = merge_branch(
            d.path(),
            &branch,
            &preview.token,
            vec![MergeResolution {
                id: id.clone(),
                choice: choice.into(),
                text: None,
            }],
        )
        .unwrap();
        assert_eq!(merged.sections[0].title, "Titre principal");
        assert_eq!(merged.sections[0].synopsis, "Résumé de la variante");
        assert_eq!(
            merged.sections[0].text,
            if choice == "current" {
                "Principal."
            } else {
                "Variante."
            }
        );
    }
}
#[test]
fn incompatible_outline_blocks_text_resolution_without_changing_the_draft() {
    use crate::model::{Outline, OutlineNode};
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    write(d.path(), &id, "Court.");
    switch_branch(d.path(), "main").unwrap();
    let s = project::load(d.path()).unwrap().sections.remove(0);
    project::save(
        d.path(),
        vec![TextPatch {
            writing_aids: None,
            id: id.clone(),
            revision: s.revision,
            text: "Long\nSuite.".into(),
            outline: Some(Outline {
                version: 1,
                nodes: vec![
                    OutlineNode {
                        properties: Default::default(),
                        property_conflicts: Default::default(),
                        tag_ids: vec![],
                        id: "a".into(),
                        parent: None,
                        start: 0,
                    },
                    OutlineNode {
                        properties: Default::default(),
                        property_conflicts: Default::default(),
                        tag_ids: vec![],
                        id: "b".into(),
                        parent: None,
                        start: 5,
                    },
                ],
            }),
        }],
    )
    .unwrap();
    let preview = merge_preview(d.path(), &branch).unwrap();
    assert_eq!(preview.entries[0].fields, vec!["text"]);
    let err = merge_branch(
        d.path(),
        &branch,
        &preview.token,
        vec![MergeResolution {
            id: id.clone(),
            choice: "incoming".into(),
            text: None,
        }],
    )
    .unwrap_err();
    assert!(err.contains("plan ne correspond pas"));
    assert_eq!(
        project::load(d.path()).unwrap().sections[0].text,
        "Long\nSuite."
    );
    assert_eq!(
        switch_branch(d.path(), &branch).unwrap().sections[0].text,
        "Court."
    );
}
#[test]
fn a_skipped_change_remains_available_for_later_integration() {
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    write(d.path(), &id, "Variante.");
    let preview = merge_preview(d.path(), &branch).unwrap();
    let p = merge_branch(
        d.path(),
        &branch,
        &preview.token,
        vec![MergeResolution {
            id: id.clone(),
            choice: "current".into(),
            text: None,
        }],
    )
    .unwrap();
    assert_eq!(p.sections[0].text, "Origine.");
    assert!(merge_preview(d.path(), &branch)
        .unwrap()
        .entries
        .iter()
        .any(|e| e.changed));
}
#[test]
fn failed_workspace_replacement_rolls_back_outgoing_draft_and_active_branch() {
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    write(d.path(), &id, "Brouillon précieux.");
    let c = project::database(d.path()).unwrap();
    c.execute_batch("CREATE TRIGGER fail_replace BEFORE INSERT ON sections BEGIN SELECT RAISE(ABORT,'failure'); END;").unwrap();
    assert!(switch_branch(d.path(), "main").is_err());
    assert_eq!(active(&c).unwrap(), branch);
    assert_eq!(
        project::load(d.path()).unwrap().sections[0].text,
        "Brouillon précieux."
    );
}
#[test]
fn references_settings_and_annotations_are_isolated_and_conflicts_explicit() {
    let (d, id) = setup();
    write(d.path(), &id, "Texte annoté.");
    let note = project::annotations::create(
        d.path(),
        &id,
        project::load(d.path()).unwrap().sections[0].revision,
        0,
        5,
        "À relire",
    )
    .unwrap();
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    project::annotations::update(d.path(), &note.id, 0, "Autre remarque", false).unwrap();
    project::database(d.path())
        .unwrap()
        .execute(
            "INSERT OR REPLACE INTO meta VALUES('settings','{\"font\":\"sans\"}')",
            [],
        )
        .unwrap();
    switch_branch(d.path(), "main").unwrap();
    assert_eq!(
        project::annotations::list(d.path()).unwrap()[0].note,
        "À relire"
    );
    project::database(d.path())
        .unwrap()
        .execute(
            "INSERT OR REPLACE INTO meta VALUES('settings','{\"font\":\"mono\"}')",
            [],
        )
        .unwrap();
    let preview = merge_preview(d.path(), &branch).unwrap();
    assert!(preview
        .auxiliary_conflicts
        .iter()
        .any(|e| e.id == "settings:font"));
    let p = merge_branch(
        d.path(),
        &branch,
        &preview.token,
        vec![MergeResolution {
            id: "settings:font".into(),
            choice: "incoming".into(),
            text: None,
        }],
    )
    .unwrap();
    assert_eq!(p.settings["font"], "sans");
    assert_eq!(
        project::annotations::list(d.path()).unwrap()[0].note,
        "Autre remarque"
    );
}
#[test]
fn deletion_against_edit_and_incompatible_tree_are_never_guessed() {
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    let mut b = project::load(d.path()).unwrap().sections[0].clone();
    let mut a = b.clone();
    a.text = "Modifié".into();
    assert!(entry(Some(&b), Some(&a), None).unwrap().conflict);
    let mut trashed = b.clone();
    trashed.trashed = true;
    assert!(entry(Some(&b), Some(&a), Some(&trashed)).unwrap().conflict);
    b.parent = Some(b.id.clone());
    assert!(validate(&Snapshot {
        sections: vec![b],
        ..Default::default()
    })
    .is_err());
    assert_eq!(
        merge_text("A\n\nB\n\nC", "X\n\nB\n\nC", "A\n\nB\n\nY"),
        Some("X\n\nB\n\nY".into())
    );
}
#[test]
fn migration_preserves_legacy_payloads_without_fabricated_ancestry() {
    let (d, id) = setup();
    write(d.path(), &id, "Ancien état.");
    let c = project::database(d.path()).unwrap();
    let payload = serde_json::to_string(&snapshot(&c, &None).unwrap()).unwrap();
    c.execute_batch("DROP TABLE automatic_versions;DROP TABLE history_branches;DROP TABLE versions;CREATE TABLE versions(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL,scope TEXT,payload TEXT NOT NULL);DELETE FROM meta WHERE key='active_branch';PRAGMA user_version=1;").unwrap();
    c.execute(
        "INSERT INTO versions VALUES('old','Ancien','2020-01-01T00:00:00Z',NULL,?)",
        [payload],
    )
    .unwrap();
    drop(c);
    let old = super::super::get(d.path(), "old").unwrap();
    assert_eq!(old.sections[0].text, "Ancien état.");
    assert_eq!(old.parent_id, None);
    assert_eq!(old.branch_id.as_deref(), Some("main"));
    assert!(std::fs::read_dir(d.path().join("recuperation"))
        .unwrap()
        .any(|v| v
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("avant-versions")));
}
#[test]
fn nested_variants_include_inherited_changes_when_integrated_into_main() {
    let (d, id) = setup();
    write(d.path(), &id, "A\n\nB\n\nC");
    create_branch(d.path(), "Mère", None).unwrap();
    write(d.path(), &id, "X\n\nB\n\nC");
    create_branch(d.path(), "Fille", None).unwrap();
    let child = history_state(d.path()).unwrap().active_branch;
    write(d.path(), &id, "X\n\nB\n\nZ");
    let preview = merge_preview(d.path(), &child).unwrap();
    assert_eq!(
        merge_branch(d.path(), &child, &preview.token, vec![])
            .unwrap()
            .sections[0]
            .text,
        "X\n\nB\n\nZ"
    );
}
#[test]
fn partial_passage_choice_keeps_unintegrated_text_available() {
    let (d, id) = setup();
    write(d.path(), &id, "A\n\nB\n\nC");
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    write(d.path(), &id, "X\n\nB\n\nZ");
    let preview = merge_preview(d.path(), &branch).unwrap();
    let p = merge_branch(
        d.path(),
        &branch,
        &preview.token,
        vec![MergeResolution {
            id: id.clone(),
            choice: "custom".into(),
            text: Some("X\n\nB\n\nC".into()),
        }],
    )
    .unwrap();
    assert_eq!(p.sections[0].text, "X\n\nB\n\nC");
    assert!(merge_preview(d.path(), &branch)
        .unwrap()
        .entries
        .iter()
        .any(|e| e.changed));
}
#[test]
fn switching_never_overwrites_an_external_markdown_edit() {
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    create_branch(d.path(), "Fin", None).unwrap();
    let branch = variant(d.path());
    let path = d.path().join("manuscrit").join(format!("{id}.md"));
    std::fs::write(&path, "Modification externe.").unwrap();
    assert!(switch_branch(d.path(), "main")
        .unwrap_err()
        .starts_with("EXTERNAL:"));
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        "Modification externe."
    );
    assert_eq!(history_state(d.path()).unwrap().active_branch, branch);
}
#[test]
fn origin_can_be_restored_in_the_variant_without_losing_the_current_draft() {
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    let opened = create_branch(d.path(), "Piste", None).unwrap();
    assert!(!opened.recovered);
    let state = history_state(d.path()).unwrap();
    let variant = state.branches.iter().find(|b| !b.is_main).unwrap();
    let origin = variant.base_version.clone().unwrap();
    let variant_id = variant.id.clone();
    write(d.path(), &id, "Brouillon de la variante.");
    let restored = super::super::restore(d.path(), &origin).unwrap();
    assert!(!restored.recovered);
    assert_eq!(restored.sections[0].text, "Origine.");
    assert_eq!(history_state(d.path()).unwrap().active_branch, variant_id);
    let recovery = super::super::list(d.path())
        .unwrap()
        .into_iter()
        .find(|v| v.name == "Avant restauration")
        .unwrap();
    assert_eq!(
        super::super::get(d.path(), &recovery.id).unwrap().sections[0].text,
        "Brouillon de la variante."
    );
    assert!(!switch_branch(d.path(), "main").unwrap().recovered);
}

#[test]
fn restore_rejects_a_version_from_an_unrelated_variant() {
    let (d, id) = setup();
    write(d.path(), &id, "Origine.");
    create_branch(d.path(), "Piste A", None).unwrap();
    write(d.path(), &id, "Texte A.");
    let v = super::super::capture(d.path(), "Fin A", None).unwrap();
    switch_branch(d.path(), "main").unwrap();
    create_branch(d.path(), "Piste B", None).unwrap();
    let error = super::super::restore(d.path(), &v.id).unwrap_err();
    assert!(error.contains("autre variante"));
    assert_eq!(
        project::load(d.path()).unwrap().sections[0].text,
        "Origine."
    );
}
