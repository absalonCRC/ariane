use super::*;
use crate::model::{Outline, OutlineNode, TextPatch};
use std::{fs, path::PathBuf};

fn note(name: &str, kind: &str, fields: Value) -> Source {
    let mut s = vaults::parse::parse("v", &format!("{name}.md"), &format!("# {name}"));
    s.kind = kind.into();
    s.fields = fields;
    s
}
fn extracted(sources: &[Source], text: &str) -> Vec<Evidence> {
    Catalog::new(sources).unwrap().extract("s", text, &mut None)
}
#[test]
fn explicit_facts_cover_all_note_types_and_custom_schemas() {
    let sources = vec![
        note(
            "Bérenger Saunière",
            "Personne",
            json!({"Date de naissance":null,"Lieu de naissance":null}),
        ),
        note(
            "Rennes-le-Château",
            "Lieu",
            json!({"Description":null,"Pays":null}),
        ),
        note("France", "Pays", json!({"Capitale":null})),
        note(
            "Le Livre",
            "Œuvre",
            json!({"Auteur":null,"Date de publication":null}),
        ),
        note("Claude Nougaro", "Personne", json!({})),
        note("Le Catharisme", "Croyance", json!({"Description":null})),
        note("Art roman", "Art", json!({"Période":null})),
        note(
            "Association Exemple",
            "Organisation",
            json!({"Date de fondation":null}),
        ),
    ];
    let cases = [
        (
            "Bérenger Saunière est né le 11 avril 1852 à Montazels.",
            "Date de naissance",
            "11 avril 1852",
        ),
        (
            "Rennes-le-Château est une commune de l’Aude.",
            "Description",
            "une commune de l’Aude",
        ),
        ("France a pour capitale Paris.", "Capitale", "Paris"),
        (
            "Le Livre est écrit par Claude Nougaro.",
            "Auteur",
            "Claude Nougaro",
        ),
        (
            "Le Livre est publié en 1900.",
            "Date de publication",
            "1900",
        ),
        (
            "Le Catharisme est une croyance médiévale.",
            "Description",
            "une croyance médiévale",
        ),
        ("Art roman — Période : XIe siècle.", "Période", "XIe siècle"),
        (
            "Association Exemple est fondée en 1901.",
            "Date de fondation",
            "1901",
        ),
    ];
    for (text, field, value) in cases {
        let result = extracted(&sources, text);
        assert!(
            result
                .iter()
                .any(|e| e.facts.iter().any(|f| f.field == field && f.value == value)),
            "{text}: {result:?}"
        );
    }
    let result = extracted(&sources, cases[0].0);
    assert!(result[0]
        .facts
        .iter()
        .any(|f| f.field == "Lieu de naissance" && f.value == "Montazels"));
    let result = extracted(&sources, cases[3].0);
    assert_eq!(
        result
            .iter()
            .flat_map(|e| &e.facts)
            .find(|f| f.field == "Auteur")
            .unwrap()
            .target,
        Some(sources[4].id.clone())
    );
}
#[test]
fn ambiguity_unicode_boundaries_and_uncertainty_do_not_turn_into_facts() {
    let mut a = note(
        "Claude Nougaro",
        "Personne",
        json!({"Date de naissance":null}),
    );
    a.aliases = vec!["Nougaro".into(), "Claude".into()];
    let mut b = note(
        "Claude Monet",
        "Personne",
        json!({"Date de naissance":null}),
    );
    b.aliases = vec!["Claude".into()];
    let sources = [a, b];
    assert!(extracted(&sources, "Claude est né en 1929.").is_empty());
    assert!(extracted(&sources, "Nougaroland.").is_empty());
    assert!(!extracted(&sources, "NOUGARO chante.").is_empty());
    for text in [
        "Claude Nougaro serait né en 1929.",
        "Claude Nougaro n’est pas né en 1929.",
        "Selon la légende, Claude Nougaro est né en 1929.",
        "Claude Nougaro est né en 1929 ?",
        "« Claude Nougaro est né en 1929. »",
        "Claude Monet affirme que Claude Nougaro est né en 1929.",
    ] {
        assert!(
            extracted(&sources, text).iter().all(|e| e.facts.is_empty()),
            "{text}"
        );
    }
    assert!(extracted(&sources, "```\nClaude Nougaro est né en 1929.\n```").is_empty());
    let result = extracted(
        &sources,
        "Claude Nougaro rencontre Claude Monet. Il est né en 1929.",
    );
    assert!(result.iter().all(|e| e.facts.is_empty()));
    assert_eq!(result[0].related.len(), 1);
}
struct Fixture {
    _temp: tempfile::TempDir,
    root: PathBuf,
    index: PathBuf,
    external: PathBuf,
    source: Source,
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        project::create(&root, "Test").unwrap();
        let external = temp.path().join("external");
        fs::create_dir(&external).unwrap();
        let raw = "---\ntype: personne\nNom: Claude Nougaro\nDate de naissance:\nDescription:\n---\n# Claude Nougaro\nTexte original.\n";
        fs::write(external.join("Claude Nougaro.md"), raw).unwrap();
        vaults::connect(&root, &external).unwrap();
        let index = temp.path().join("index.sqlite");
        let v = vaults::list(&root, &index).unwrap().remove(0);
        let source = vaults::parse::parse(&v.id, "Claude Nougaro.md", raw);
        vaults::index_db(&index)
            .unwrap()
            .execute(
                "INSERT INTO sources VALUES(?,?,?,?,?)",
                params![
                    source.id,
                    v.id,
                    source.path,
                    source.fingerprint,
                    serde_json::to_string(&source).unwrap()
                ],
            )
            .unwrap();
        Self {
            _temp: temp,
            root,
            index,
            external,
            source,
        }
    }
    fn write(&self, lines: &[(&str, &str)]) {
        let section = project::sections(&project::database(&self.root).unwrap())
            .unwrap()
            .remove(0);
        let text = lines
            .iter()
            .map(|(_, text)| *text)
            .collect::<Vec<_>>()
            .join("\n");
        let mut start = 0;
        let nodes = lines
            .iter()
            .map(|(id, text)| {
                let node = OutlineNode { properties: Default::default(), property_conflicts: Default::default(), tag_ids: vec![],
                    id: (*id).into(),
                    parent: None,
                    start,
                };
                start += text.encode_utf16().count() + 1;
                node
            })
            .collect();
        project::save(
            &self.root,
            vec![TextPatch {
                id: section.id,
                text,
                outline: Some(Outline { version: 1, nodes }),
                revision: section.revision,
            }],
        )
        .unwrap();
    }
    fn enriched(&self) -> Source {
        let mut result = vec![self.source.clone()];
        decorate(&self.root, &self.index, &mut result).unwrap();
        result.remove(0)
    }
}
#[test]
fn instances_are_deduplicated_references_never_copied_text_or_index_entries() {
    let f = Fixture::new();
    let before = fs::read(f.external.join("Claude Nougaro.md")).unwrap();
    f.write(&[(
        "node-a",
        "Claude Nougaro est né en 1929. Claude Nougaro chante.",
    )]);
    assert_eq!(run(&f.root, &f.index).unwrap()["analyzed"], 1);
    let result = f.enriched();
    let data = result.enrichment.unwrap();
    assert_eq!(data.passages.len(), 1);
    assert_eq!(data.passages[0].evidence.node.as_deref(), Some("node-a"));
    assert_eq!(result.fields["Date de naissance"], "1929");
    assert_eq!(run(&f.root, &f.index).unwrap()["analyzed"], 0);
    assert_eq!(
        fs::read(f.external.join("Claude Nougaro.md")).unwrap(),
        before
    );
    let c = project::database(&f.root).unwrap();
    let payload: String = c
        .query_row("SELECT payload FROM enrichment_evidence", [], |r| r.get(0))
        .unwrap();
    assert!(!payload.contains("Claude Nougaro chante"));
    assert!(!payload.contains("\"quote\""));
    assert_eq!(
        vaults::all(&f.index, &vaults::list(&f.root, &f.index).unwrap())
            .unwrap()
            .len(),
        1
    );
    assert!(vaults::source(
        &f.index,
        &f.source.id,
        &vaults::list(&f.root, &f.index).unwrap()
    )
    .unwrap()
    .fields["Date de naissance"]
        .is_null());
}
#[test]
fn instance_identity_survives_edits_moves_and_duplicate_text_in_other_nodes() {
    let f = Fixture::new();
    f.write(&[
        ("a", "Claude Nougaro est né en 1929."),
        ("b", "Autre ligne."),
    ]);
    run(&f.root, &f.index).unwrap();
    let id = f.enriched().enrichment.unwrap().passages[0]
        .evidence
        .id
        .clone();
    // Moving a node doesn't wait for extraction and resolves the current line by ID.
    f.write(&[
        ("b", "🙂 Autre ligne."),
        ("a", "Claude Nougaro est né en 1929."),
    ]);
    let data = f.enriched().enrichment.unwrap();
    assert_eq!(data.passages[0].evidence.id, id);
    assert_eq!(data.passages[0].line, 2);
    f.write(&[
        ("b", "Autre ligne."),
        ("a", "Claude Nougaro est né en 1930."),
    ]);
    assert!(
        f.enriched().enrichment.is_none(),
        "Stale fields must disappear before reanalysis"
    );
    run(&f.root, &f.index).unwrap();
    let data = f.enriched();
    assert_eq!(data.enrichment.unwrap().passages[0].evidence.id, id);
    assert_eq!(data.fields["Date de naissance"], "1930");
    f.write(&[
        ("a", "Claude Nougaro est né en 1930."),
        ("c", "Claude Nougaro est né en 1930."),
    ]);
    run(&f.root, &f.index).unwrap();
    let data = f.enriched().enrichment.unwrap();
    assert_eq!(data.passages.len(), 2);
    assert_ne!(data.passages[0].evidence.id, data.passages[1].evidence.id);
    f.write(&[("b", "La mention a été supprimée.")]);
    assert!(f.enriched().enrichment.is_none());
    run(&f.root, &f.index).unwrap();
    assert!(f.enriched().enrichment.is_none());
}
#[test]
fn conflicts_manual_fields_dismissal_and_settings_are_preserved() {
    let mut f = Fixture::new();
    f.write(&[
        ("a", "Claude Nougaro est né en 1929."),
        ("b", "Claude Nougaro est né en 1930."),
    ]);
    run(&f.root, &f.index).unwrap();
    let data = f.enriched();
    assert!(data.fields["Date de naissance"].is_null());
    let data = data.enrichment.unwrap();
    assert!(data.fields.iter().all(|f| f.status == "conflict"));
    ignore(
        &f.root,
        &f.index,
        &f.source.id,
        Some(&data.passages[1].evidence.id),
    )
    .unwrap();
    assert_eq!(f.enriched().fields["Date de naissance"], "1929");
    // Dismissal belongs to the canonical node, including after its movement/edit.
    f.write(&[
        ("b", "Claude Nougaro est né en 1940."),
        ("a", "Claude Nougaro est né en 1929."),
    ]);
    run(&f.root, &f.index).unwrap();
    assert_eq!(f.enriched().enrichment.unwrap().ignored, 1);
    ignore(&f.root, &f.index, &f.source.id, None).unwrap();
    assert_eq!(f.enriched().enrichment.unwrap().passages.len(), 2);
    f.source.fields["Date de naissance"] = json!("Valeur manuelle");
    assert_eq!(f.enriched().fields["Date de naissance"], "Valeur manuelle");
    project::settings(&f.root, json!({"enrichment":false})).unwrap();
    assert!(f.enriched().enrichment.is_none());
    assert_eq!(run(&f.root, &f.index).unwrap()["analyzed"], 0);
}
#[test]
fn scopes_and_project_boundaries_do_not_leak_enrichment() {
    let f = Fixture::new();
    f.write(&[("a", "Claude Nougaro est né en 1929.")]);
    run(&f.root, &f.index).unwrap();
    let other = f._temp.path().join("other");
    project::create(&other, "Other").unwrap();
    vaults::connect(&other, &f.external).unwrap();
    let mut sources = vec![f.source.clone()];
    decorate(&other, &f.index, &mut sources).unwrap();
    assert!(sources[0].enrichment.is_none());
    vaults::set_scope(&f.root, &f.source.vault_id, vec!["Elsewhere".into()]).unwrap();
    assert!(f.enriched().enrichment.is_none());
}

#[test]
fn fenced_code_spanning_nodes_is_not_a_reference_and_outline_changes_recompute() {
    let f = Fixture::new();
    f.write(&[
        ("fence", "```"),
        ("code", "Claude Nougaro est né en 1929."),
        ("end", "```"),
    ]);
    run(&f.root, &f.index).unwrap();
    assert!(f.enriched().enrichment.is_none());
    // Same text, different structural identity: the link must follow the new node.
    f.write(&[("a", "Claude Nougaro est né en 1929.")]);
    run(&f.root, &f.index).unwrap();
    let first = f.enriched().enrichment.unwrap().passages[0]
        .evidence
        .id
        .clone();
    f.write(&[("replacement", "Claude Nougaro est né en 1929.")]);
    assert!(f.enriched().enrichment.is_none());
    assert_eq!(run(&f.root, &f.index).unwrap()["analyzed"], 1);
    assert_ne!(
        f.enriched().enrichment.unwrap().passages[0].evidence.id,
        first
    );
}

#[test]
fn explicit_wikilink_resolves_its_target_without_creating_an_instance_for_its_caption() {
    let a = note(
        "Claude Nougaro",
        "Personne",
        json!({"Date de naissance":null}),
    );
    let b = note(
        "Claude Monet",
        "Personne",
        json!({"Date de naissance":null}),
    );
    let result = extracted(
        &[a.clone(), b],
        "[[Claude Nougaro|Claude Monet]] est né en 1929.",
    );
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].source, a.id);
    assert_eq!(result[0].facts[0].value, "1929");
}

#[test]
fn decoration_does_not_load_unrelated_invalid_sections() {
    let f = Fixture::new();
    f.write(&[("node-a", "Claude Nougaro est né à Toulouse.")]);
    run(&f.root, &f.index).unwrap();
    let c = project::database(&f.root).unwrap();
    c.execute("INSERT INTO sections(id,title,kind,position,text,outline) VALUES('unrelated','Autre','scene',99,'texte','invalid-json')", []).unwrap();
    // Only sections referenced by evidence for the returned sources are read.
    assert!(f.enriched().enrichment.is_some());
}

#[test]
fn external_vault_reference_tracks_original_node_without_writing_vault() {
    let fixture = tempfile::tempdir().unwrap();
    let external = fixture.path().join("vault");
    fs::create_dir_all(&external).unwrap();
    let file = external.join("Bérenger Saunière.md");
    fs::write(&file, "---\ntype: Personne\n---\n# Bérenger Saunière\nUne note documentaire de test.").unwrap();
    let original = fs::read_to_string(&file).unwrap();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("projet");
    project::create(&root,"Test RLC").unwrap();
    vaults::connect(&root,&external).unwrap();
    let index = temp.path().join("index.sqlite");
    let vault = vaults::list(&root,&index).unwrap().remove(0);
    let rel = file.strip_prefix(&external).unwrap().to_string_lossy().to_string();
    let source = vaults::parse::parse(&vault.id,&rel,&original);
    vaults::index_db(&index).unwrap().execute("INSERT INTO sources VALUES(?,?,?,?,?)",params![source.id,vault.id,rel,source.fingerprint,serde_json::to_string(&source).unwrap()]).unwrap();
    let section = project::sections(&project::database(&root).unwrap()).unwrap().remove(0);
    let save = |text: &str, rev| { project::save(&root,vec![TextPatch { id:section.id.clone(),revision:rev,text:text.into(),outline:Some(Outline{version:1,nodes:vec![OutlineNode{ properties: Default::default(), property_conflicts: Default::default(), tag_ids: vec![],id:"original-node".into(),parent:None,start:0}]}) }]).unwrap(); };
    let name = &source.title;
    save(&format!("{name} était un personnage de Rennes-le-Château. {name} apparaît dans le récit."), section.revision);
    run(&root,&index).unwrap();
    let mut sources=vec![source.clone()]; decorate(&root,&index,&mut sources).unwrap();
    let first=sources[0].enrichment.as_ref().expect("real RLC note matched");
    assert_eq!(first.passages.len(),1);
    let id=first.passages[0].evidence.id.clone();
    save(&format!("{name} figure dans une phrase modifiée."), section.revision+1);
    let mut stale=vec![source.clone()]; decorate(&root,&index,&mut stale).unwrap();
    assert!(stale[0].enrichment.is_none());
    run(&root,&index).unwrap();
    let mut updated=vec![source.clone()]; decorate(&root,&index,&mut updated).unwrap();
    let data=updated[0].enrichment.as_ref().unwrap();
    assert_eq!(data.passages.len(),1);
    assert_eq!(data.passages[0].evidence.id,id);
    assert!(data.passages[0].quote.contains("phrase modifiée"));
    assert_eq!(fs::read_to_string(&file).unwrap(),original);
    assert_eq!(vaults::all(&index,&[vault]).unwrap().len(),1);
}

#[test]
fn changed_middle_node_preserves_other_evidence_and_only_updates_its_own_row() {
    let f = Fixture::new();
    f.write(&[("a","Claude Nougaro arrive."),("b","Claude Nougaro attend."),("c","Claude Nougaro repart.")]);
    run(&f.root,&f.index).unwrap();
    let c = project::database(&f.root).unwrap();
    c.execute_batch("CREATE TABLE updated_evidence(id TEXT); CREATE TRIGGER log_evidence AFTER UPDATE ON enrichment_evidence BEGIN INSERT INTO updated_evidence VALUES(new.id); END;").unwrap();
    f.write(&[("a","Claude Nougaro arrive."),("b","😀 Claude Nougaro attend encore."),("c","Claude Nougaro repart.")]);
    run(&f.root,&f.index).unwrap();
    let nodes:Vec<String> = c.prepare("SELECT json_extract(payload,'$.node') FROM enrichment_evidence WHERE id IN (SELECT id FROM updated_evidence)").unwrap().query_map([],|r|r.get(0)).unwrap().collect::<std::result::Result<_,_>>().unwrap();
    assert_eq!(nodes,vec!["b"]);
    assert_eq!(f.enriched().enrichment.unwrap().passages.len(),3);
}
