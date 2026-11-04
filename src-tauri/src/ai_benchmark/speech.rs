use crate::{memory_engine, project, vaults, voice};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

pub fn evaluate() {
    let manifest = PathBuf::from(std::env::var("ARIANE_SPEECH_MANIFEST").unwrap());
    let corpus: Value = serde_json::from_slice(&std::fs::read(&manifest).unwrap()).unwrap();
    let report = PathBuf::from(std::env::var("ARIANE_SPEECH_REPORT").unwrap());
    let data = PathBuf::from(std::env::var("ARIANE_VOICE_TEST_DATA").unwrap());
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("project");
    let index = temporary.path().join("index.sqlite");
    project::create(&root, "Voix synthétiques — vérification").unwrap();
    let mut names = std::collections::BTreeSet::new();
    for case in corpus["cases"].as_array().unwrap() {
        for name in case["names"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            names.insert(name.to_owned());
        }
    }
    for name in names {
        let source = vaults::create_quick_note(&root, &index, &name).unwrap();
        vaults::apply_note_type(
            &root,
            &index,
            &source,
            if [
                "Saint-Malo",
                "Clairval",
                "Hamburg",
                "London",
                "Sevilla",
                "Firenze",
            ]
            .contains(&name.as_str())
            {
                "Lieu"
            } else {
                "Personne"
            },
        )
        .unwrap();
    }
    let mut engine = voice::VoiceEngine::default();
    let mut rows = vec![];
    let duration = corpus["runSeconds"].as_f64().unwrap_or(0.);
    let started = Instant::now();
    let mut iteration = 0;
    loop {
        for case in corpus["cases"].as_array().unwrap() {
            if iteration > 0 && duration > 0. && started.elapsed().as_secs_f64() >= duration {
                break;
            }
            let path = PathBuf::from(case["wav"].as_str().unwrap());
            let bytes = std::fs::read(path).unwrap();
            let names = voice::lexicon::snapshot(&root, &index).unwrap();
            println!("speech-start {} iteration {}", case["id"], iteration);
            if case["killWorkerAfterMs"].is_u64() {
                engine.prepare(&data, &resources).unwrap();
            }
            let fault_pid = case["killWorkerAfterMs"].is_u64().then(||engine.diagnostics()["workerPid"].clone());
            let crash = case["killWorkerAfterMs"].as_u64().and_then(|ms| {
                engine.diagnostics()["workerPid"].as_u64().map(|pid| {
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(ms.min(1000)));
                        unsafe {
                            libc::kill(pid as i32, libc::SIGKILL);
                        }
                    })
                })
            });
            let start = Instant::now();
            let selected_data = if case["unavailableData"].as_bool() == Some(true) {
                temporary.path()
            } else {
                data.as_path()
            };
            let result = engine.transcribe_context(
                selected_data,
                &resources,
                &STANDARD.encode(bytes),
                case["language"].as_str().unwrap(),
                !case["cleanup"].as_bool().unwrap_or(false),
                case["before"].as_str().unwrap_or(""),
                case["after"].as_str().unwrap_or(""),
                &names,
            );
            if let Some(crash) = crash {
                crash.join().unwrap();
            }
            let elapsed = start.elapsed().as_secs_f64() * 1000.;
            let row = match result {
                Ok(output) => {
                    json!({"case":case,"iteration":iteration,"output":output,"elapsedMs":elapsed,"faultInjectedPid":fault_pid,"pressureCritical":memory_engine::critical_memory_pressure(),"diagnostics":engine.diagnostics()})
                }
                Err(error) => {
                    json!({"case":case,"iteration":iteration,"error":error,"elapsedMs":elapsed,"faultInjectedPid":fault_pid,"pressureCritical":memory_engine::critical_memory_pressure(),"diagnostics":engine.diagnostics()})
                }
            };
            println!(
                "speech-case {} iteration {} {:.0}ms",
                case["id"], iteration, elapsed
            );
            rows.push(row);
            checkpoint(
                &report,
                &json!({"manifest":manifest,"elapsedSeconds":started.elapsed().as_secs_f64(),"complete":false,"rows":rows}),
            );
            engine.shutdown_if_idle();
            if let Some(ms) = corpus["pauseMs"].as_u64() {
                std::thread::sleep(Duration::from_millis(ms.min(10000)));
            }
        }
        iteration += 1;
        if duration <= 0. || started.elapsed().as_secs_f64() >= duration {
            break;
        }
    }
    let mut idle = vec![];
    let idle_start = Instant::now();
    let idle_seconds = corpus["idleObserveSeconds"].as_u64().unwrap_or(0).min(360);
    while idle_start.elapsed().as_secs() < idle_seconds {
        engine.shutdown_if_idle();
        idle.push(json!({"seconds":idle_start.elapsed().as_secs_f64(),"diagnostics":engine.diagnostics()}));
        std::thread::sleep(Duration::from_secs(2));
    }
    engine.shutdown();
    let unexpected = rows
        .iter()
        .filter(|r| r["error"].is_string() != r["case"]["expectedError"].as_bool().unwrap_or(false))
        .count();
    checkpoint(
        &report,
        &json!({"manifest":manifest,"elapsedSeconds":started.elapsed().as_secs_f64(),"complete":true,"iterations":iteration,"unexpectedErrors":unexpected,"idle":idle,"finalDiagnostics":engine.diagnostics(),"rows":rows}),
    );
    assert_eq!(
        unexpected, 0,
        "speech cases failed; recorded outputs retained"
    );
}
fn checkpoint(path: &std::path::Path, report: &Value) {
    let temporary = path.with_extension("checkpoint.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(report).unwrap()).unwrap();
    std::fs::rename(temporary, path).unwrap();
}
