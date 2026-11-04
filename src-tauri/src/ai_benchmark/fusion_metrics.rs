use crate::{inference::Engine, project, retrieval, vaults};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Mutex},
    time::Instant,
};

pub fn evaluate() {
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../benchmarks/fixtures/ai/retrieval-fusion.json"
    ))
    .unwrap();
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("project");
    let vault = d.path().join("vault");
    std::fs::create_dir(&vault).unwrap();
    project::create(&root, "Fusion explicite").unwrap();
    vaults::connect(&root, &vault).unwrap();
    for doc in corpus["documents"].as_array().unwrap() {
        std::fs::write(
            vault.join(format!("{}.md", doc["id"].as_str().unwrap())),
            format!(
                "---\ntitle: {}\ntype: {}\naliases: {}\n---\n{}",
                doc["title"].as_str().unwrap(),
                doc["kind"].as_str().unwrap(),
                doc.get("aliases").unwrap_or(&json!([])),
                doc["text"].as_str().unwrap()
            ),
        )
        .unwrap();
    }
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let index = d.path().join("index.sqlite");
    let engine = Mutex::new(Engine::default());
    vaults::index(
        &root,
        &index,
        &resources,
        &engine,
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    let mut rows = vec![];
    let mut sums = [(0, 0.); 2];
    let mut timings = [vec![], vec![]];
    let mut exact_failures = 0;
    for (n, case) in corpus["queries"].as_array().unwrap().iter().enumerate() {
        let text = case["text"].as_str().unwrap();
        let gold = case["relevant"].as_array().unwrap();
        engine
            .lock()
            .unwrap()
            .embed(&resources, text, true)
            .unwrap();
        let mut variants = vec![Value::Null; 2];
        for mode in if n % 2 == 0 { [0, 1] } else { [1, 0] } {
            let mut output = vec![];
            let mut ms = vec![];
            for _ in 0..5 {
                let start = Instant::now();
                output = if mode == 0 {
                    retrieval::search_with_policy(
                        &root,
                        &index,
                        &resources,
                        &engine,
                        text,
                        true,
                        retrieval::ranking::DEFAULT,
                    )
                } else {
                    retrieval::search(&root, &index, &resources, &engine, text, true)
                }
                .unwrap();
                ms.push(start.elapsed().as_secs_f64() * 1000.);
            }
            let ids: Vec<_> = output
                .iter()
                .map(|s| {
                    Path::new(&s.path)
                        .file_stem()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned()
                })
                .collect();
            let rank = ids
                .iter()
                .position(|id| gold.iter().any(|v| v.as_str() == Some(id)))
                .map(|i| i + 1);
            if let Some(rank) = rank {
                sums[mode].0 += usize::from(rank == 1);
                sums[mode].1 += 1. / rank as f64;
            }
            if mode == 1 && case["exact"] == true && rank != Some(1) {
                exact_failures += 1;
            }
            timings[mode].extend(&ms);
            variants[mode] = json!({"fusion":if mode==0 {"weighted"}else{"rrf"},"ranking":ids,"rank":rank,"timingsMs":ms});
        }
        rows.push(json!({"case":case,"variants":variants}));
    }
    let positive = corpus["queries"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|q| !q["relevant"].as_array().unwrap().is_empty())
        .count();
    let metrics:Vec<_>=(0..2).map(|i| {timings[i].sort_by(f64::total_cmp);json!({"top1":sums[i].0,"positiveQueries":positive,"mrr":sums[i].1/positive as f64,"p95Ms":timings[i][(timings[i].len()*95).div_ceil(100)-1]})}).collect();
    let quality_passed = sums[1].0 >= sums[0].0
        && sums[1].1 / positive as f64 + 0.02 >= sums[0].1 / positive as f64
        && exact_failures == 0;
    let latency_passed =
        metrics[1]["p95Ms"].as_f64().unwrap() <= metrics[0]["p95Ms"].as_f64().unwrap() * 1.1;
    std::fs::write(std::env::var("ARIANE_AI_REPORT").unwrap(),serde_json::to_vec_pretty(&json!({"protocol":corpus["protocol"],"model":crate::inference::MODEL_ID,"metrics":metrics,"exactFailures":exact_failures,"qualityBudgetsPassed":quality_passed,"latencyBudgetPassed":latency_passed,"rows":rows})).unwrap()).unwrap();
    assert!(quality_passed, "RRF failed independent quality budgets");
}
