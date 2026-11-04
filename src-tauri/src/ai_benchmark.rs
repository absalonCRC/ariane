//! Opt-in evaluation of the real local paths on a frozen synthetic corpus.
mod entity_metrics;
mod fusion_metrics;
mod retrieval_metrics;
mod speech;
use crate::{inference::Engine, project, retrieval, vaults};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Mutex},
    time::Instant,
};

#[test]
#[ignore = "calibrate or validate recorded GLiNER outputs through production publication gates"]
fn entity_policy_evaluation() {
    entity_metrics::evaluate();
}

#[test]
#[ignore = "requires native Gemma; separate calibration and validation reports"]
fn retrieval_policy_evaluation() {
    retrieval_metrics::evaluate();
}

#[test]
#[ignore = "independent frozen validation of explicit RRF lookup and exact aliases"]
fn retrieval_fusion_evaluation() {
    fusion_metrics::evaluate();
}

#[test]
#[ignore = "runs frozen speech/noise/long-file cases through the installed voice pipeline"]
fn speech_stress_evaluation() {
    speech::evaluate();
}

#[test]
#[ignore = "requires installed LanguageTool/Salamandra; writes ARIANE_REVISION_REPORT"]
fn revision_context_evaluation() {
    let corpus: Value = if let Ok(path) = std::env::var("ARIANE_REVISION_CORPUS") {
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
    } else {
        serde_json::from_str(include_str!("../../benchmarks/fixtures/ai/revision.json")).unwrap()
    };
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let data = PathBuf::from(std::env::var("ARIANE_REVISION_TEST_DATA").unwrap());
    let mut engine = crate::revision::RevisionEngine::default();
    let mut rows = vec![];
    for case in corpus["cases"].as_array().unwrap() {
        let mut variants = vec![];
        for context in [false, true] {
            println!("revision-start {} context {}",case["id"],context);
            let text = case["text"].as_str().unwrap();
            let language_code = case["language"].as_str().unwrap_or("fr");
            let before = if context {
                case["before"].as_str().unwrap()
            } else {
                ""
            };
            let after = if context {
                case["after"].as_str().unwrap()
            } else {
                ""
            };
            let start = Instant::now();
            let language = serde_json::to_value(
                engine
                    .check_context(
                        &data,
                        &resources,
                        text,
                        language_code,
                        "language",
                        before,
                        after,
                    )
                    .unwrap(),
            )
            .unwrap();
            let language_ms = start.elapsed().as_secs_f64() * 1000.;
            let start = Instant::now();
            let model = serde_json::to_value(
                engine
                    .check_context(
                        &data,
                        &resources,
                        text,
                        language_code,
                        "model",
                        before,
                        after,
                    )
                    .unwrap(),
            )
            .unwrap();
            let model_ms = start.elapsed().as_secs_f64() * 1000.;
            assert!(language["languageError"].is_null(), "case {} context {context}: {language}", case["id"]);
            assert!(model["modelError"].is_null(), "case {} context {context}: {model}", case["id"]);
            variants.push(json!({"context":context,"language":language,"model":model,"languageMs":language_ms,"modelMs":model_ms}));
        }
        rows.push(json!({"case":case,"variants":variants}));
    }
    engine.shutdown();
    std::fs::write(
        std::env::var("ARIANE_REVISION_REPORT").unwrap(),
        serde_json::to_vec_pretty(&json!({"protocol":corpus["protocol"],"rows":rows})).unwrap(),
    )
    .unwrap();
}

#[test]
#[ignore = "counts native forwards and persistent outline reuse in a temporary project"]
fn outline_cache_evaluation() {
    use crate::{memory, memory_engine::Activity};
    let d = tempfile::tempdir().unwrap();
    let root = d.path();
    project::create(root, "Cache natif").unwrap();
    let c = project::database(root).unwrap();
    c.execute("DELETE FROM sections", []).unwrap();
    let first = "La lumière traverse une maison abandonnée.";
    let second = "Le bateau quitte le port au lever du jour.";
    let update = |first: &str| {
        let text = format!("{first}\n{second}");
        let outline = json!({"version":1,"nodes":[{"id":"first","parent":null,"start":0},{"id":"second","parent":null,"start":first.encode_utf16().count()+1}]});
        c.execute("INSERT INTO sections(id,title,kind,position,text,revision,outline,mirror) VALUES('s','Scène','scene',0,?,1,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text,outline=excluded.outline,mirror=excluded.mirror,revision=sections.revision+1",rusqlite::params![text,outline.to_string(),project::hash(&text)]).unwrap();
    };
    update(first);
    let engine = Mutex::new(Engine::default());
    let activity = Activity::default();
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let index = root.join("index");
    let queue = memory::Queue {
        root,
        index: &index,
        resources: &resources,
        engine: &engine,
        activity: &activity,
        critical_pressure: false,
    };
    for node in ["first", "second"] {
        queue.run("s", Some(node), 1, 1, true).unwrap();
    }
    let original_second = memory::vector(root, "s", Some("second")).unwrap();
    let before = engine.lock().unwrap().embedding_requests;
    queue.run("s", Some("second"), 1, 1, true).unwrap();
    assert_eq!(
        engine.lock().unwrap().embedding_requests,
        before,
        "returning to unchanged outline must not encode"
    );
    update("La lumière traverse maintenant une maison abandonnée.");
    queue.run("s", Some("first"), 2, 1, true).unwrap();
    assert_eq!(
        memory::vector(root, "s", Some("second")).unwrap(),
        original_second,
        "a different outline node was reencoded"
    );
    let changed = engine.lock().unwrap().embedding_requests;
    assert!(changed > before);
    engine.lock().unwrap().shutdown();
    // Return to the original source after a simulated restart/undo. Both roles
    // must be read from SQLite, without loading any model or running a forward.
    update(first);
    let reopened = Mutex::new(Engine::default());
    let queue = memory::Queue {
        engine: &reopened,
        ..queue
    };
    queue.run("s", Some("first"), 3, 1, true).unwrap();
    assert_eq!(reopened.lock().unwrap().embedding_requests, 0);
    assert!(memory::vector(root, "s", Some("first")).unwrap().is_some());
    if let Ok(report) = std::env::var("ARIANE_OUTLINE_REPORT") {
        std::fs::write(report,serde_json::to_vec_pretty(&json!({"initialForwards":before,"afterOneLineEdit":changed,"afterReopenUndo":0,"unchangedLinePreserved":true})).unwrap()).unwrap();
    }
}

#[test]
#[ignore = "requires installed native embeddings; writes only to ARIANE_AI_REPORT"]
fn native_ai_evaluation() {
    let corpus: Value =
        serde_json::from_str(include_str!("../../benchmarks/fixtures/ai/retrieval.json")).unwrap();
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("project");
    let vault = temporary.path().join("vault");
    std::fs::create_dir(&vault).unwrap();
    project::create(&root, "Évaluation synthétique").unwrap();
    vaults::connect(&root, &vault).unwrap();
    for d in corpus["documents"].as_array().unwrap() {
        std::fs::write(
            vault.join(format!("{}.md", d["id"].as_str().unwrap())),
            format!(
                "---\ntitle: {}\n---\n{}",
                d["title"].as_str().unwrap(),
                d["text"].as_str().unwrap()
            ),
        )
        .unwrap();
    }
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let engine = Mutex::new(Engine::default());
    let index = temporary.path().join("index.sqlite");
    let start = Instant::now();
    let indexed = vaults::index(
        &root,
        &index,
        &resources,
        &engine,
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    let indexing_ms = start.elapsed().as_secs_f64() * 1000.;
    let mut rows = vec![];
    let mut doc_vectors = vec![];
    for d in corpus["documents"].as_array().unwrap() {
        let v = engine
            .lock()
            .unwrap()
            .embed_titled_idle(
                &resources,
                d["text"].as_str().unwrap(),
                d["title"].as_str(),
                false,
                || false,
            )
            .unwrap()
            .unwrap();
        doc_vectors.push((d["id"].as_str().unwrap().to_string(), v));
    }
    for q in corpus["queries"].as_array().unwrap() {
        let start = Instant::now();
        let hits = retrieval::search(
            &root,
            &index,
            &resources,
            &engine,
            q["text"].as_str().unwrap(),
            true,
        )
        .unwrap();
        let ranked: Vec<_> = hits
            .iter()
            .map(|s| {
                std::path::Path::new(&s.path)
                    .file_stem()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        let gold = q["relevant"].as_array().unwrap();
        let rank = ranked
            .iter()
            .position(|id| gold.iter().any(|g| g.as_str() == Some(id)))
            .map(|i| i + 1);
        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.;
        let automatic = retrieval::suggest(
            &root,
            &index,
            &resources,
            &engine,
            q["text"].as_str().unwrap(),
            3,
            true,
        )
        .unwrap();
        if gold.is_empty() {
            assert!(
                automatic.is_empty(),
                "An unrelated query produced an automatic suggestion"
            );
        }
        let query_vector = engine
            .lock()
            .unwrap()
            .embed(&resources, q["text"].as_str().unwrap(), true)
            .unwrap();
        let lexical = retrieval::search(
            &root,
            &index,
            &resources,
            &engine,
            q["text"].as_str().unwrap(),
            false,
        )
        .unwrap();
        let mut dimensions = vec![];
        for dimension in [768, 512, 256] {
            let reduced = |v: &[f32]| {
                let norm = v[..dimension].iter().map(|x| x * x).sum::<f32>().sqrt();
                v[..dimension].iter().map(|x| x / norm).collect::<Vec<_>>()
            };
            let query = reduced(&query_vector);
            let mut candidates: Vec<_> = doc_vectors
                .iter()
                .map(|(id, v)| (id, crate::inference::cosine(&query, &reduced(v))))
                .collect();
            candidates.sort_by(|a, b| b.1.total_cmp(&a.1));
            let rrf: Vec<_> = candidates
                .iter()
                .enumerate()
                .filter(|(_, (id, score))| {
                    *score >= retrieval::ranking::SOURCE_THRESHOLD
                        || lexical.iter().any(|s| s.path == format!("{id}.md"))
                })
                .map(|(i, (id, score))| {
                    let lexical_rank = lexical.iter().position(|s| s.path == format!("{id}.md"));
                    (
                        id,
                        if *score >= retrieval::ranking::SOURCE_THRESHOLD {
                            1. / (60. + (i + 1) as f64)
                        } else {
                            0.
                        } + lexical_rank.map_or(0., |r| 1. / (60. + (r + 1) as f64)),
                        score,
                    )
                })
                .collect();
            let mut rrf = rrf;
            rrf.sort_by(|a, b| b.1.total_cmp(&a.1));
            dimensions.push(json!({"dimensions":dimension,"semantic":candidates,"rrf":rrf}));
        }
        rows.push(json!({"query":q,"rank":rank,"ranking":ranked,"scores":hits.iter().map(|s|s.score).collect::<Vec<_>>(),"elapsedMs":elapsed_ms,"automaticRanking":automatic.iter().map(|s|s.path.clone()).collect::<Vec<_>>(),"experiments":dimensions}));
    }
    let cleanup: Vec<_> = corpus["cleanup"].as_array().unwrap().iter().map(|c| json!({"case":c,"accepted":crate::voice::plausible_cleanup(c["raw"].as_str().unwrap(),c["cleaned"].as_str().unwrap())})).collect();
    let output =
        PathBuf::from(std::env::var("ARIANE_AI_REPORT").expect("ARIANE_AI_REPORT required"));
    std::fs::write(output, serde_json::to_vec_pretty(&json!({"indexed":indexed,"indexingMs":indexing_ms,"retrieval":rows,"cleanup":cleanup,"model":crate::inference::MODEL_ID})).unwrap()).unwrap();
}

#[test]
#[ignore = "postprocess recorded native GLiNER outputs with production Rust acceptance"]
fn entity_acceptance_evaluation() {
    let path = PathBuf::from(std::env::var("ARIANE_NER_REPORT").unwrap());
    let mut report: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    for row in report["rows"].as_array_mut().unwrap() {
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Entités synthétiques").unwrap();
        let text = row["case"]["text"].as_str().unwrap();
        let c = project::database(d.path()).unwrap();
        c.execute("DELETE FROM sections", []).unwrap();
        c.execute("INSERT INTO sections(id,title,kind,position,text,revision,mirror) VALUES('a','Témoin','scene',0,?,1,?)",rusqlite::params![text,project::hash(text)]).unwrap();
        crate::memory::sync(d.path()).unwrap();
        let p = crate::memory::passage(d.path(), "a", None)
            .unwrap()
            .unwrap();
        crate::memory::apply_entities(d.path(), &p, &row["output"]).unwrap();
        let mut q=c.prepare("SELECT DISTINCT e.title,e.kind FROM memory_entities e JOIN memory_mentions m ON m.entity_id=e.id").unwrap();
        let accepted: Vec<_> = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .unwrap()
            .map(|r| {
                let (title, kind) = r.unwrap();
                json!([
                    title,
                    if kind == "place" {
                        "location"
                    } else {
                        kind.as_str()
                    }
                ])
            })
            .collect();
        row["accepted"] = json!(accepted);
    }
    std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
}
