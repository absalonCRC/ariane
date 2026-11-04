use super::*;
use tempfile::TempDir;
fn fixture() -> TempDir {
    let dir = tempfile::tempdir().unwrap();
    project::create(dir.path(), "Mémoire").unwrap();
    project::database(dir.path())
        .unwrap()
        .execute("DELETE FROM sections", [])
        .unwrap();
    dir
}
fn scene(root: &Path, id: &str, text: &str, nodes: &[(&str, usize)]) {
    let c = project::database(root).unwrap();
    let outline = crate::model::Outline {
        version: 1,
        nodes: nodes
            .iter()
            .map(|(id, start)| crate::model::OutlineNode {
                id: (*id).into(),
                parent: None,
                start: *start,
            })
            .collect(),
    };
    c.execute("INSERT INTO sections(id,title,kind,position,text,revision,outline,mirror) VALUES(?,?,'scene',0,?,1,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text,outline=excluded.outline,mirror=excluded.mirror,revision=sections.revision+1",params![id,id,text,serde_json::to_string(&outline).unwrap(),project::hash(text)]).unwrap();
}
fn output(text: &str, label: &str, start: usize, end: usize) -> Value {
    let mut vector = vec![0.; 768];
    vector[0] = 1.;
    json!({"entities":[{"text":text,"label":label,"start":start,"end":end,"score":0.99}],"vector":vector,"queryVector":vector,"model":GEMMA_MODEL})
}
#[test]
fn identical_names_in_different_nodes_are_unresolved_distinct_mentions() {
    let d = fixture();
    scene(d.path(), "a", "Claude est relieur.", &[("a", 0)]);
    scene(d.path(), "b", "Claude est marin.", &[("b", 0)]);
    sync(d.path()).unwrap();
    for (section, node) in [("a", "a"), ("b", "b")] {
        let p = passage(d.path(), section, Some(node)).unwrap().unwrap();
        apply(d.path(), &p, &output("Claude", "person", 0, 6)).unwrap();
    }
    let entities = list(d.path()).unwrap();
    assert_eq!(entities.as_array().unwrap().len(), 2);
    assert_ne!(entities[0]["id"], entities[1]["id"]);
}
#[test]
fn a_title_change_invalidates_embeddings_without_erasing_ner_mentions() {
    let d = fixture();
    scene(d.path(), "a", "Claude attend.", &[("n", 0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    apply(d.path(), &p, &output("Claude", "person", 0, 6)).unwrap();
    let detected = json!({"model":ner::NER_MODEL,"entities":[{"text":"Claude","label":"person","start":0,"end":6,"score":0.99}]});
    apply_entities(d.path(), &p, &detected).unwrap();
    project::database(d.path())
        .unwrap()
        .execute("UPDATE sections SET title='Nouveau titre' WHERE id='a'", [])
        .unwrap();
    sync(d.path()).unwrap();
    assert_eq!(list(d.path()).unwrap().as_array().unwrap().len(), 1);
    assert!(pending_entities_at(d.path(), "a", Some("n"))
        .unwrap()
        .is_none());
    assert_eq!(pending(d.path(), Some("a"), 10).unwrap().len(), 1);
}
#[test]
fn lowercase_people_can_be_proposed_but_common_place_phrases_are_not_names() {
    let d = fixture();
    scene(d.path(), "a", "claude traverse la salle.", &[("a", 0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("a")).unwrap().unwrap();
    let mut prediction = output("claude", "person", 0, 6);
    prediction["entities"]
        .as_array_mut()
        .unwrap()
        .push(json!({"text":"la salle","label":"location","start":16,"end":24,"score":0.99}));
    apply(d.path(), &p, &prediction).unwrap();
    let entities = list(d.path()).unwrap();
    assert_eq!(entities.as_array().unwrap().len(), 1);
    assert_eq!(entities[0]["title"], "claude");
}
#[test]
fn creates_derived_fiche_without_touching_text() {
    let d = fixture();
    let text = "Louise Morel, relieuse, s’installa à Arles en 1924.";
    scene(d.path(), "a", text, &[("n", 0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    apply(d.path(), &p, &output("Louise Morel", "person", 0, 12)).unwrap();
    let all = list(d.path()).unwrap();
    assert_eq!(all[0]["title"], "Louise Morel");
    let e = entity(d.path(), all[0]["id"].as_str().unwrap()).unwrap();
    assert_eq!(e["fields"][0]["value"], "relieuse");
    assert_eq!(e["timeline"][0]["date"], "1924");
    assert_eq!(
        project::section(&project::database(d.path()).unwrap(), "a")
            .unwrap()
            .unwrap()
            .text,
        text
    );
}
#[test]
fn stale_output_and_removed_mentions_are_rejected() {
    let d = fixture();
    scene(d.path(), "a", "Louise Morel, relieuse.", &[("n", 0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    scene(d.path(), "a", "La maison est vide.", &[("n", 0)]);
    assert!(!apply(d.path(), &p, &output("Louise Morel", "person", 0, 12)).unwrap());
    sync(d.path()).unwrap();
    assert!(list(d.path()).unwrap().as_array().unwrap().is_empty());
}
#[test]
fn offsets_are_unicode_codepoints_not_utf16_or_bytes() {
    let d = fixture();
    scene(d.path(), "a", "🌿 Louise Morel travaille.", &[("n", 0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    assert!(apply(d.path(), &p, &output("Louise Morel", "person", 2, 14)).unwrap());
    assert!(apply(d.path(), &p, &output("Louise Morel", "person", 3, 15)).is_err());
}
#[test]
fn confident_single_word_names_are_kept_but_rules_and_weak_predictions_are_not() {
    let d = fixture();
    scene(d.path(), "a", "Louise attend Paris.", &[("n", 0)]);
    sync(d.path()).unwrap();
    assert!(list(d.path()).unwrap().as_array().unwrap().is_empty());
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    let mut prediction = output("Louise", "person", 0, 6);
    prediction["entities"]
        .as_array_mut().unwrap()
        .push(json!({"text":"Paris","label":"location","start":14,"end":19,"score":0.2}));
    apply(d.path(), &p, &prediction).unwrap();
    let entities = list(d.path()).unwrap();
    assert_eq!(entities.as_array().unwrap().len(), 1);
    assert_eq!(entities[0]["title"], "Louise");
}
#[test]
fn node_identity_survives_moves_but_deleted_nodes_disappear() {
    let d = fixture();
    let first = "Louise Morel, relieuse.\n";
    let second = "La maison attend.\n";
    scene(
        d.path(),
        "a",
        &format!("{first}{second}"),
        &[("n", 0), ("m", first.encode_utf16().count())],
    );
    sync(d.path()).unwrap();
    let id = list(d.path()).unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    scene(
        d.path(),
        "a",
        &format!("{second}{first}"),
        &[("m", 0), ("n", second.encode_utf16().count())],
    );
    sync(d.path()).unwrap();
    assert_eq!(list(d.path()).unwrap()[0]["id"], id);
    scene(d.path(), "a", second, &[("m", 0)]);
    sync(d.path()).unwrap();
    assert!(list(d.path()).unwrap().as_array().unwrap().is_empty());
}
#[test]
fn recalls_semantic_passage_excludes_neighbours_and_honors_dismissal() {
    let d = fixture();
    scene(
        d.path(),
        "a",
        "Le logis désert garde une présence.",
        &[("n", 0)],
    );
    scene(
        d.path(),
        "b",
        "La demeure abandonnée attend ses habitants.",
        &[("m", 0)],
    );
    sync(d.path()).unwrap();
    for p in pending(d.path(), None, 10).unwrap() {
        let mut v = output("", "person", 0, 1);
        v["entities"] = json!([]);
        apply(d.path(), &p, &v).unwrap();
    }
    let result = context(d.path(), "a", Some("n"), 3).unwrap();
    assert_eq!(result["recall"]["section"], "b");
    dismiss(
        d.path(),
        result["recall"]["id"].as_str().unwrap(),
        result["recall"]["hash"].as_str().unwrap(),
    )
    .unwrap();
    assert!(context(d.path(), "a", Some("n"), 3).unwrap()["recall"].is_null());
}
#[test]
fn memory_does_not_leak_between_projects() {
    let a = fixture();
    let b = fixture();
    scene(a.path(), "a", "Louise Morel, relieuse.", &[("n", 0)]);
    sync(a.path()).unwrap();
    assert!(list(b.path()).unwrap().as_array().unwrap().is_empty());
}
#[test]
fn dates_keep_precision_and_do_not_invent_missing_anchors() {
    assert_eq!(temporal::dates("Le 31 février 1924.").len(), 0);
    let a = temporal::dates("Vers 1920.");
    assert_eq!(a[0]["approximate"], true);
    assert_eq!(a[0]["date"], "1920");
    let a = temporal::dates("Entre 1921 et 1924.");
    assert_eq!(a.len(), 1);
    assert_eq!(a[0]["precision"], "interval");
    assert_eq!(
        temporal::dates("Trois ans plus tard.")[0]["precision"],
        "unresolved"
    );
    let a = temporal::dates("En 1921. Trois ans plus tard.");
    assert_eq!(a[1]["date"], "1924");
    assert_eq!(
        temporal::dates("Au XVIIIe siècle.")[0]["precision"],
        "century"
    );
}
#[test]
fn explicit_session_is_bounded_and_survives_restart() {
    let d = fixture();
    scene(d.path(), "a", "Un passage.", &[("n", 0)]);
    let v = json!({"section":"a","node":"n","offset":2,"cursor":2,"recent":[{"section":"a","node":"n"}],"sourceId":"source"});
    session(d.path(), Some(v)).unwrap();
    assert_eq!(session(d.path(), None).unwrap()["node"], "n");
    scene(d.path(), "a", "Autre.", &[("other", 0)]);
    assert!(session(d.path(), None).unwrap()["node"].is_null());
}
#[test]
fn unchanged_sync_does_not_rewrite_vectors() {
    let d = fixture();
    scene(d.path(), "a", "Louise Morel, relieuse.", &[("n", 0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    apply(d.path(), &p, &output("Louise Morel", "person", 0, 12)).unwrap();
    sync(d.path()).unwrap();
    assert!(pending(d.path(), None, 10).unwrap().is_empty());
    assert_eq!(
        vector(d.path(), "a", Some("n")).unwrap().unwrap().1[0].len(),
        768
    );
}

#[test]
fn code_fences_cross_nodes_without_creating_entities() {
    let d = fixture();
    let text = "```txt\nLouise Morel, relieuse.\n```\nPierre Martin, libraire.\n";
    scene(
        d.path(),
        "a",
        text,
        &[("a", 0), ("b", 7), ("c", 31), ("d", 35)],
    );
    sync(d.path()).unwrap();
    let names = list(d.path()).unwrap();
    assert_eq!(names.as_array().unwrap().len(), 1);
    assert_eq!(names[0]["title"], "Pierre Martin");
}

#[test]
fn session_removes_deleted_recent_nodes_and_clamps_local_offset() {
    let d = fixture();
    scene(d.path(), "a", "Court.", &[("n", 0)]);
    let v=session(d.path(),Some(json!({"section":"a","node":"n","offset":900,"cursor":900,"recent":[{"section":"a","node":"n"}]}))).unwrap();
    assert_eq!(v["offset"], 6);
    scene(d.path(), "a", "Court.", &[("other", 0)]);
    assert!(session(d.path(), None).unwrap()["recent"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn changed_model_is_requeued_and_large_legacy_nodes_do_not_block_other_passages() {
    let d = fixture();
    scene(d.path(), "a", &"a".repeat(65537), &[("long", 0)]);
    scene(d.path(), "b", "Louise Morel, relieuse.", &[("n", 0)]);
    sync(d.path()).unwrap();
    let pending = pending(d.path(), Some("a"), 2).unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].section, "b");
    apply(
        d.path(),
        &pending[0],
        &output("Louise Morel", "person", 0, 12),
    )
    .unwrap();
    project::database(d.path()).unwrap().execute("UPDATE memory_passages SET model='intfloat/multilingual-e5-small@old' WHERE section='b'",[]).unwrap();
    assert_eq!(super::pending(d.path(), None, 2).unwrap().len(), 1);
}

#[test]
fn cancelled_context_and_index_yield_to_typing() {
    let d = fixture();
    scene(d.path(), "a", "La maison attend.", &[("a", 0)]);
    scene(d.path(), "b", "La maison reste vide.", &[("b", 0)]);
    sync_idle(d.path(), None, || true).unwrap();
    assert!(pending(d.path(), None, 3).unwrap().is_empty());
    sync(d.path()).unwrap();
    assert_eq!(
        context_idle(d.path(), "a", Some("a"), 3, || true).unwrap()["busy"],
        true
    );
}

#[test]
fn shared_gemma_migration_preserves_extracted_mentions_and_rejects_mixed_dimensions() {
    let d = fixture();
    scene(d.path(), "a", "Louise attend Paris.", &[("n", 0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    let mut legacy = output("Paris", "location", 14, 19);
    let mut vector = vec![0.;384]; vector[0] = 1.;
    legacy["vector"] = json!(vector); legacy["queryVector"] = json!(vector);
    legacy["model"] = json!("intfloat/multilingual-e5-small@legacy");
    apply(d.path(), &p, &legacy).unwrap();
    assert_eq!(pending(d.path(),None,1).unwrap().len(), 1);
    let mut gemma = output("Paris", "location", 14, 19);
    gemma.as_object_mut().unwrap().remove("entities");
    apply(d.path(), &p, &gemma).unwrap();
    assert_eq!(list(d.path()).unwrap()[0]["title"], "Paris");
    assert!(pending(d.path(),None,1).unwrap().is_empty());
    gemma["queryVector"] = json!(vector);
    assert!(apply(d.path(), &p, &gemma).is_err());
}

#[test]
fn pressure_and_missing_models_do_not_block_fiches_timeline_recall_or_sources() {
    use crate::{inference::Engine, memory_engine::Activity, vaults};
    let d = fixture();
    scene(d.path(), "a", "Louise Morel, relieuse, vivait à Arles en 1924.", &[("n",0)],
    );
    scene(d.path(), "b", "Louise Morel, relieuse, travaillait à Lyon en 1921.", &[("m",0)],
    );
    let index = d.path().join("sources.sqlite");
    let vault = d.path().join("Vault");
    std::fs::create_dir(&vault).unwrap(); vaults::connect(d.path(), &vault).unwrap();
    let available = vaults::list(d.path(), &index).unwrap();
    let raw = "Louise Morel dirigeait un atelier de reliure à Arles en 1924.";
    std::fs::write(vault.join("archive.md"), raw).unwrap();
    let mut source = vaults::parse::parse(&available[0].id, "archive.md", raw);
    source.fingerprint = project::hash(&format!("{}:{}",raw.len(),project::hash(raw)));
    let c = vaults::index_db(&index).unwrap();
    c.execute("INSERT INTO sources VALUES(?,?,?,?,?)",params![source.id,available[0].id,source.path,source.fingerprint,serde_json::to_string(&source).unwrap()],
    ).unwrap();
    c.execute("INSERT INTO search(text,source,page) VALUES(?,?,NULL)",params![source.text,source.id],
    ).unwrap();
    let engine = std::sync::Mutex::new(Engine::default()); let activity = Activity::default();
    let resources = d.path().join("resources");
    let queue = Queue { root:d.path(),index:&index,resources:&resources,engine:&engine,activity:&activity,critical_pressure:true,
    };
    let missing = queue.run("a",Some("n"),1,3,true).unwrap();
    assert_eq!(missing["entities"][0]["title"], "Louise Morel");
    assert!(missing["evidence"]["quote"].as_str().unwrap().contains("reliure"));
    assert_eq!(missing["recall"]["section"],"b");
    let entity = entity(d.path(),missing["entities"][0]["id"].as_str().unwrap()).unwrap();
    assert_eq!(entity["timeline"].as_array().unwrap().len(), 1);
    assert_eq!(entity["unresolved"], true);
    // These fake resources must never be executed under critical pressure.
    std::fs::create_dir_all(resources.join("engine")).unwrap();
    std::fs::create_dir_all(resources.join("models")).unwrap();
    std::fs::write(resources.join("engine/llama-server"), "not executable").unwrap();
    std::fs::write(resources.join("models/embeddinggemma-300M-Q8_0.gguf"), "model",
    ).unwrap();
    let pressured = queue.run("a",Some("n"),1,3,true).unwrap();
    assert_eq!(pressured["deferred"],true);
    assert_eq!(pressured["entities"],missing["entities"]);
    assert_eq!(pressured["evidence"],missing["evidence"]);
    assert!(pressured["modelError"].is_null());
    {
        let _foreground = activity.foreground();
        assert_eq!(queue.run("a", Some("n"), 1, 3, false).unwrap()["entities"], missing["entities"]);
    }
    activity.writing(true);
    assert_eq!(queue.run("a",Some("n"),1,3,true).unwrap()["busy"],true);
}

#[test]
fn independent_entities_preserve_vectors_cache_empty_results_and_reject_stale_text() {
    let d = fixture();
    let text = "🌿 Louise Morel visite Paris avec UNESCO.";
    scene(d.path(), "a", text, &[("n", 0)]);
    sync(d.path()).unwrap();
    let p = pending_entities_at(d.path(), "a", Some("n")).unwrap().unwrap();
    let mut embedding = output("Louise Morel", "person", 2, 14);
    embedding.as_object_mut().unwrap().remove("entities");
    apply(d.path(), &p, &embedding).unwrap();
    let before = vector(d.path(), "a", Some("n")).unwrap();
    let ner = json!({"model":ner::NER_MODEL,"entities":[
        {"text":"Louise Morel","label":"person","start":2,"end":14,"score":0.99},
        {"text":"Paris","label":"location","start":22,"end":27,"score":0.99},
        {"text":"UNESCO","label":"organization","start":33,"end":39,"score":0.99}
    ]});
    assert!(apply_entities(d.path(), &p, &ner).unwrap());
    assert_eq!(list(d.path()).unwrap().as_array().unwrap().len(), 3);
    assert_eq!(vector(d.path(), "a", Some("n")).unwrap(), before);
    assert!(pending_entities_at(d.path(), "a", Some("n")).unwrap().is_none());
    // Re-embedding must not erase GLiNER mentions or its independent receipt.
    apply(d.path(), &p, &embedding).unwrap();
    assert_eq!(list(d.path()).unwrap().as_array().unwrap().len(), 3);
    assert!(pending_entities_at(d.path(), "a", Some("n")).unwrap().is_none());
    scene(d.path(), "a", "La maison attend.", &[("n", 0)]);
    assert!(!apply_entities(d.path(), &p, &ner).unwrap());
    sync(d.path()).unwrap();
    let p = pending_entities_at(d.path(), "a", Some("n")).unwrap().unwrap();
    assert!(apply_entities(d.path(), &p, &json!({"model":ner::NER_MODEL,"entities":[]})).unwrap());
    assert!(pending_entities_at(d.path(), "a", Some("n")).unwrap().is_none());
    assert!(list(d.path()).unwrap().as_array().unwrap().is_empty());
}

#[test]
fn initialized_memory_readers_do_not_need_a_write_lock() {
    let d = fixture();
    scene(d.path(), "a", "Louise Morel, relieuse.", &[("n", 0)]);
    sync(d.path()).unwrap();
    let mut c = project::database(d.path()).unwrap();
    let _writer = c.transaction_with_behavior(TransactionBehavior::Immediate).unwrap();
    // Used to fail after the busy timeout: opening every memory connection
    // performed INSERT OR IGNORE even for an already initialized schema.
    let reader = storage::database(d.path()).unwrap();
    assert_eq!(reader.query_row("SELECT COUNT(*) FROM memory_passages", [], |r|r.get::<_,i64>(0)).unwrap(), 1);
}

#[test]
fn entities_follow_manuscript_order_after_the_current_passage() {
    let d = fixture();
    scene(d.path(), "scene-10", "Paris attend.", &[("n",0)]);
    scene(d.path(), "scene-2", "Arles attend.", &[("n",0)]);
    let c = project::database(d.path()).unwrap();
    c.execute("UPDATE sections SET position=10 WHERE id='scene-10'", []).unwrap();
    c.execute("UPDATE sections SET position=2 WHERE id='scene-2'", []).unwrap();
    sync(d.path()).unwrap();
    assert_eq!(pending_entities_at(d.path(), "absent", None).unwrap().unwrap().section, "scene-2");
    assert_eq!(pending_entities_at(d.path(), "scene-10", Some("n")).unwrap().unwrap().section, "scene-10");
}

#[test]
fn blank_outline_nodes_never_block_entities_or_semantic_backfill() {
    let d = fixture();
    let blank = "\n \t\u{a0}\u{2009}\n";
    let text = format!("{blank}Marie Curie travaille à Paris.");
    scene(d.path(), "a", &text, &[("blank",0),("real",blank.encode_utf16().count())],
    );
    sync(d.path()).unwrap();
    let pending = pending_at(d.path(),Some("a"),Some("blank"),64).unwrap();
    assert_eq!(pending.len(),1);
    assert_eq!(pending[0].node.as_deref(),Some("real"));
    let p = pending_entities_at(d.path(),"a",Some("blank")).unwrap().unwrap();
    assert_eq!(p.node.as_deref(),Some("real"));
    apply_entities(d.path(),&p,&json!({"model":ner::NER_MODEL,"entities":[]})).unwrap();
    assert!(pending_entities_at(d.path(),"a",Some("blank")).unwrap().is_none());
}

#[test]
fn gemma2_migration_keeps_ner_and_requeues_incompatible_vectors() {
    let d = fixture();
    scene(d.path(), "a", "Louise Morel visite Paris.", &[("n",0)]);
    sync(d.path()).unwrap();
    let p = passage(d.path(), "a", Some("n")).unwrap().unwrap();
    let mut embedding = output("", "person", 0, 1);
    embedding.as_object_mut().unwrap().remove("entities");
    apply(d.path(), &p, &embedding).unwrap();
    apply_entities(d.path(), &p, &json!({"model":ner::NER_MODEL,"entities":[
        {"text":"Louise Morel","label":"person","start":0,"end":12,"score":0.99},
        {"text":"Paris","label":"location","start":20,"end":25,"score":0.99}
    ]}),
    ).unwrap();
    let before = list(d.path()).unwrap();
    project::database(d.path()).unwrap().execute(
        "UPDATE memory_passages SET model='embeddinggemma-2-Q8_0:manuscript-v1'", [],
        ).unwrap();
    assert!(vector(d.path(), "a", Some("n")).unwrap().is_none());
    assert_eq!(pending(d.path(), None, 10).unwrap().len(), 1);
    assert!(pending_entities_at(d.path(), "a", Some("n")).unwrap().is_none());
    apply(d.path(), &p, &embedding).unwrap();
    assert_eq!(vector(d.path(), "a", Some("n")).unwrap().unwrap().0, GEMMA_MODEL);
    assert!(pending(d.path(), None, 10).unwrap().is_empty());
    assert_eq!(list(d.path()).unwrap(), before);
    assert!(pending_entities_at(d.path(), "a", Some("n")).unwrap().is_none());
}
