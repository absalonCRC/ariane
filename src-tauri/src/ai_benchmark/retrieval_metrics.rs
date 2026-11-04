use crate::{
    inference::{cosine, encoding, Engine},
    model::Source,
    project,
    retrieval::{
        self,
        ranking::{self, Policy},
    },
    vaults,
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Mutex},
    time::Instant,
};

fn id(source: &Source) -> String {
    Path::new(&source.path)
        .file_stem()
        .unwrap()
        .to_string_lossy()
        .into_owned()
}
fn metrics(rows: &[Value]) -> Value {
    let mut tp = 0;
    let mut fp = 0;
    let mut missed = 0;
    let mut no_answer = 0;
    let mut false_displays = 0;
    let mut positive = 0;
    let mut top1 = 0;
    let mut mrr = 0.;
    for row in rows {
        let expected: BTreeSet<_> = row["case"]["automaticRelevant"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s.as_str().unwrap())
            .collect();
        let predicted: BTreeSet<_> = row["automatic"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s.as_str().unwrap())
            .collect();
        tp += expected.intersection(&predicted).count();
        fp += predicted.difference(&expected).count();
        missed += expected.difference(&predicted).count();
        if expected.is_empty() {
            no_answer += 1;
            if !predicted.is_empty() {
                false_displays += 1;
            }
        }
        let relevant = row["case"]["relevant"].as_array().unwrap();
        if !relevant.is_empty() {
            positive += 1;
            if let Some(rank) = row["ranking"]
                .as_array()
                .unwrap()
                .iter()
                .position(|id| relevant.contains(id))
            {
                mrr += 1. / (rank + 1) as f64;
                if rank == 0 {
                    top1 += 1;
                }
            }
        }
    }
    json!({"cases":rows.len(),"positiveQueries":positive,"top1":top1,"mrr":mrr/positive.max(1) as f64,
        "automatic":{"tp":tp,"fp":fp,"fn":missed,"precision":tp as f64/(tp+fp).max(1) as f64,"recall":tp as f64/(tp+missed).max(1) as f64,"f1":2.*tp as f64/(2*tp+fp+missed).max(1) as f64,"negativeCases":no_answer,"negativeCasesWithFalseDisplays":false_displays}})
}
fn reduced(v: &[f32], dimensions: usize) -> Vec<f32> {
    let norm = v[..dimensions].iter().map(|x| x * x).sum::<f32>().sqrt();
    v[..dimensions].iter().map(|x| x / norm).collect()
}
fn ranks(query: &[f32], chunks: &[(String, Vec<f32>)], dimensions: usize) -> Vec<(String, f64)> {
    let query = reduced(query, dimensions);
    let mut best: BTreeMap<String, f64> = BTreeMap::new();
    for (id, vector) in chunks {
        let score = cosine(&query, &reduced(vector, dimensions));
        best.entry(id.clone())
            .and_modify(|s| *s = s.max(score))
            .or_insert(score);
    }
    let mut out: Vec<_> = best.into_iter().collect();
    out.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    out
}
pub fn evaluate() {
    let split = std::env::var("ARIANE_AI_SPLIT").unwrap();
    assert!(["calibration", "validation"].contains(&split.as_str()));
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../benchmarks/fixtures/ai/retrieval-v2.json"
    ))
    .unwrap();
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("project");
    let vault = d.path().join("vault");
    std::fs::create_dir(&vault).unwrap();
    project::create(&root, "Recherche synthétique").unwrap();
    vaults::connect(&root, &vault).unwrap();
    for doc in corpus["documents"].as_array().unwrap() {
        std::fs::write(
            vault.join(format!("{}.md", doc["id"].as_str().unwrap())),
            format!(
                "---\ntitle: {}\ntype: {}\n---\n{}",
                doc["title"].as_str().unwrap(),
                doc["kind"].as_str().unwrap(),
                doc["text"].as_str().unwrap()
            ),
        )
        .unwrap();
    }
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let index = d.path().join("index.sqlite");
    let engine = Mutex::new(Engine::default());
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
    let c = vaults::index_db(&index).unwrap();
    let mut q=c.prepare("SELECT s.payload,ch.text,ch.vector FROM chunks ch JOIN sources s ON s.id=ch.source ORDER BY ch.id").unwrap();
    let records: Vec<_> = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                crate::vectors::decode(r.get_ref(2)?).unwrap(),
            ))
        })
        .unwrap()
        .map(Result::unwrap)
        .collect();
    let chunks: Vec<_> = records
        .iter()
        .map(|(s, _, v)| (id(&serde_json::from_str::<Source>(s).unwrap()), v.clone()))
        .collect();
    let mut profiles = vec![];
    if split == "calibration" {
        for (title, tokens, overlap) in [(false, 512, 64), (true, 256, 64), (true, 512, 0)] {
            let mut vectors = vec![];
            let start = Instant::now();
            let mut model = engine.lock().unwrap();
            let before = model.embedding_requests;
            for (source, text, _) in &records {
                let source: Source = serde_json::from_str(source).unwrap();
                let title = title.then_some(source.title.as_str());
                let ranges = encoding::split_with_overlap(text, overlap, |p| {
                    model
                        .token_count(&resources, &encoding::prompt(p, title, false))
                        .map(|n| n <= tokens)
                })
                .unwrap();
                let prompts: Vec<_> = ranges
                    .iter()
                    .map(|r| encoding::prompt(&text[r.clone()], title, false))
                    .collect();
                let mut sum = vec![0.; 768];
                for (range, vector) in ranges
                    .iter()
                    .zip(model.embed_batch(&resources, &prompts).unwrap())
                {
                    for (n, v) in sum.iter_mut().zip(vector) {
                        *n += v * (range.end - range.start) as f32;
                    }
                }
                let norm = sum.iter().map(|v| v * v).sum::<f32>().sqrt();
                for v in &mut sum {
                    *v /= norm;
                }
                vectors.push((id(&source), sum));
            }
            profiles.push((
                format!("title={};tokens={tokens};overlap={overlap}", title),
                vectors,
                start.elapsed().as_secs_f64() * 1000.,
                model.embedding_requests - before,
            ));
        }
    }
    let policies = if split == "calibration" {
        let mut p = vec![ranking::BASELINE];
        for threshold in [0.44, 0.48, 0.52, 0.56] {
            for score in [2.2, 2.4, 2.6, 2.8] {
                for margin in [0., 0.15] {
                    p.push(Policy {
                        semantic_threshold: threshold,
                        suggestion_score: score,
                        deep_suggestion_score: 1.9,
                        suggestion_margin: margin,
                    });
                }
            }
        }
        p
    } else {
        vec![ranking::DEFAULT, ranking::BASELINE]
    };
    let queries: Vec<_> = corpus["queries"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|q| q["split"] == split)
        .collect();
    let mut evaluations = vec![];
    let mut experiments = vec![];
    for (n, policy) in policies.iter().enumerate() {
        let mut rows = vec![];
        for query in &queries {
            let text = query["text"].as_str().unwrap();
            let mut times = vec![];
            let mut hits = vec![];
            let mut automatic = vec![];
            for _ in 0..if n == 0 { 3 } else { 1 } {
                let start = Instant::now();
                hits = retrieval::search_with_policy(
                    &root, &index, &resources, &engine, text, true, *policy,
                )
                .unwrap();
                times.push(start.elapsed().as_secs_f64() * 1000.);
                automatic = retrieval::suggest_with_policy(
                    &root, &index, &resources, &engine, text, 3, true, *policy,
                )
                .unwrap();
            }
            rows.push(json!({"case":query,"ranking":hits.iter().map(id).collect::<Vec<_>>(),"scores":hits.iter().map(|s|s.score).collect::<Vec<_>>(),"automatic":automatic.iter().map(id).collect::<Vec<_>>(),"searchTimingsMs":times}));
            if n == 0 {
                let vector = engine
                    .lock()
                    .unwrap()
                    .embed(&resources, text, true)
                    .unwrap();
                let lexical =
                    retrieval::search(&root, &index, &resources, &engine, text, false).unwrap();
                let mut variants = vec![];
                for dim in [768, 512, 256] {
                    let semantic = ranks(&vector, &chunks, dim);
                    let mut rrf: BTreeMap<String, f64> = BTreeMap::new();
                    for (rank, (id, _)) in semantic
                        .iter()
                        .filter(|(_, s)| *s >= policy.semantic_threshold)
                        .take(20)
                        .enumerate()
                    {
                        rrf.insert(id.clone(), 1. / (60. + (rank + 1) as f64));
                    }
                    for (rank, s) in lexical.iter().take(20).enumerate() {
                        *rrf.entry(id(s)).or_default() += 1. / (60. + (rank + 1) as f64);
                    }
                    let mut rrf: Vec<_> = rrf.into_iter().collect();
                    rrf.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
                    rrf.truncate(20);
                    variants.push(json!({"dimensions":dim,"semantic":semantic,"rrf":rrf,"vectorBytesPerChunk":8+4*dim}));
                }
                experiments.push(json!({"query":query,"variants":variants,"encodingProfiles":profiles.iter().map(|(name,v,ms,forwards)|json!({"profile":name,"ranking":ranks(&vector,v,768),"encodingMs":ms,"forwards":forwards})).collect::<Vec<_>>()}));
            }
        }
        evaluations.push(json!({"policy":policy,"metrics":metrics(&rows),"rows":rows}));
    }
    let baseline = &evaluations[0]["metrics"]["automatic"];
    let mut selected = 0;
    for (i, e) in evaluations
        .iter()
        .enumerate()
        .skip(1)
        .filter(|_| split == "calibration")
    {
        let m = &e["metrics"]["automatic"];
        let best = &evaluations[selected]["metrics"]["automatic"];
        if m["fp"].as_u64() <= baseline["fp"].as_u64()
            && m["recall"].as_f64().unwrap() + 0.05 >= baseline["recall"].as_f64().unwrap()
            && e["metrics"]["top1"].as_u64() >= evaluations[0]["metrics"]["top1"].as_u64()
            && e["metrics"]["mrr"].as_f64().unwrap() + 0.02
                >= evaluations[0]["metrics"]["mrr"].as_f64().unwrap()
            && m["f1"].as_f64().unwrap() > best["f1"].as_f64().unwrap() + 0.02
        {
            selected = i;
        }
    }
    let model = engine.lock().unwrap();
    let validation_budgets = if split == "validation" {
        let current = &evaluations[0]["metrics"];
        let base = &evaluations[1]["metrics"];
        current["automatic"]["fp"].as_u64() <= base["automatic"]["fp"].as_u64()
            && current["automatic"]["recall"].as_f64().unwrap() + 0.05
                >= base["automatic"]["recall"].as_f64().unwrap()
            && current["top1"].as_u64() >= base["top1"].as_u64()
            && current["mrr"].as_f64().unwrap() + 0.02 >= base["mrr"].as_f64().unwrap()
    } else {
        true
    };
    let report = json!({"split":split,"protocol":corpus["protocol"],"model":crate::inference::MODEL_ID,"indexed":indexed,"chunks":chunks.len(),"indexingMs":indexing_ms,
        "validationBudgetsPassed":validation_budgets,
        "forwards":model.embedding_requests,"cacheHits":model.cache_hits,"evaluations":evaluations,"selectedPolicy":policies[selected],"experiments":experiments});
    std::fs::write(
        std::env::var("ARIANE_AI_REPORT").unwrap(),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    assert!(
        validation_budgets,
        "frozen retrieval validation budgets failed"
    );
}
