use super::*;
use crate::{model::TextPatch, project};
use serde::Deserialize;
use std::time::Instant;

fn scene(root: &Path, text: &str, language: &str) -> String {
    let p = project::create(root, "Corpus synthétique").unwrap();
    project::settings(root, serde_json::json!({"language":language})).unwrap();
    let id = p.sections[0].id.clone();
    replace(root, &id, text);
    id
}

fn replace(root: &Path, id: &str, text: &str) {
    let c = project::database(root).unwrap();
    let revision = project::section(&c, id).unwrap().unwrap().revision;
    project::save(
        root,
        vec![TextPatch {
            writing_aids: None,
            id: id.into(),
            revision,
            text: text.into(),
            outline: None,
        }],
    )
    .unwrap();
}

fn enabled(c: &Connection) {
    c.execute("UPDATE preferences SET enabled=1", []).unwrap();
}

fn word(c: &Connection, language: &str, context: &str, project: &str) -> Option<String> {
    store::suggest(c, language, context, project, &Default::default(), true)
        .unwrap()
        .map(|s| s.word)
}

#[test]
fn correction_removal_reopen_reset_and_opt_out_are_idempotent() {
    let data = tempfile::tempdir().unwrap();
    let root = data.path().join("primary");
    let id = scene(&root, "Dans le vieux moulin. Dans le vieux moulin.", "fr");
    let mut c = store::open(data.path()).unwrap();
    assert!(store::train(&mut c, &root).unwrap().is_none());
    enabled(&c);
    let key = store::train(&mut c, &root).unwrap().unwrap();
    assert_eq!(word(&c, "fr", "le vieux ", &key).as_deref(), Some("moulin"));
    store::train(&mut c, &root).unwrap();
    let count: i64 = c
        .query_row(
            "SELECT count FROM lexemes WHERE prefix='le vieux' AND word='moulin'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 2);
    replace(&root, &id, "Dans le vieux phare.");
    store::train(&mut c, &root).unwrap();
    assert_eq!(word(&c, "fr", "le vieux ", &key).as_deref(), Some("phare"));
    drop(c);
    let mut c = store::open(data.path()).unwrap();
    assert_eq!(word(&c, "fr", "le vieux ", &key).as_deref(), Some("phare"));

    let choice = store::suggest(&c, "fr", "le vieux ", &key, &Default::default(), true)
        .unwrap()
        .unwrap();
    store::feedback(&mut c, &key, &choice.feedback, choice.epoch, false).unwrap();
    assert_eq!(word(&c, "fr", "le vieux ", &key), None);
    store::reset(&mut c).unwrap();
    store::feedback(&mut c, &key, &choice.feedback, choice.epoch, true).unwrap();
    store::train(&mut c, &root).unwrap();
    assert_eq!(word(&c, "fr", "le vieux ", &key), None);
    assert_eq!(
        c.query_row("SELECT count(*) FROM feedback", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );

    replace(&root, &id, "Dans le vieux village.");
    store::train(&mut c, &root).unwrap();
    assert_eq!(
        word(&c, "fr", "le vieux ", &key).as_deref(),
        Some("village")
    );
    store::forget(&mut c, &key, true).unwrap();
    assert!(store::blocked(&c, &key).unwrap());
    store::train(&mut c, &root).unwrap();
    assert_eq!(word(&c, "fr", "le vieux ", &key), None);
    store::forget(&mut c, &key, false).unwrap();
    store::train(&mut c, &root).unwrap();
    assert_eq!(
        word(&c, "fr", "le vieux ", &key).as_deref(),
        Some("village")
    );
    project::database(&root)
        .unwrap()
        .execute("UPDATE sections SET trashed=1", [])
        .unwrap();
    store::train(&mut c, &root).unwrap();
    assert_eq!(word(&c, "fr", "le vieux ", &key), None);
}

#[test]
fn common_profile_needs_support_from_two_distinct_projects() {
    let data = tempfile::tempdir().unwrap();
    let a = data.path().join("a");
    let b = data.path().join("b");
    scene(
        &a,
        "La clef ouvre la trappe. Cette étoile s’appelle Vésale.",
        "fr",
    );
    scene(
        &b,
        "La clef ouvre la trappe. Au marché, la vendeuse plie la toile.",
        "fr",
    );
    let mut c = store::open(data.path()).unwrap();
    enabled(&c);
    let a = store::train(&mut c, &a).unwrap().unwrap();
    let b = store::train(&mut c, &b).unwrap().unwrap();
    assert_eq!(word(&c, "fr", "ouvre la ", "").as_deref(), Some("trappe"));
    assert_eq!(
        word(&c, "fr", "étoile s’appelle ", &a).as_deref(),
        Some("Vésale")
    );
    assert_ne!(
        word(&c, "fr", "étoile s’appelle ", &b).as_deref(),
        Some("Vésale")
    );
    assert_ne!(
        word(&c, "fr", "étoile s’appelle ", "").as_deref(),
        Some("Vésale")
    );
    let aliases = words::counts("Éloïse Desmarais\nLola des Îles");
    let name = store::suggest(&c, "fr", "Éloïse ", &a, &aliases, true)
        .unwrap()
        .unwrap();
    assert_eq!(name.word, "Desmarais");
    assert_ne!(word(&c, "fr", "Éloïse ", "").as_deref(), Some("Desmarais"));
}

#[derive(Deserialize)]
struct Corpus {
    language: String,
    learn: [String; 2],
    test: [String; 2],
    isolation: [String; 4],
}

#[test]
fn held_out_literary_and_documentary_prediction_quality() {
    let corpus: Vec<Corpus> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/prediction-corpus.json"
    ))
    .unwrap();
    let data = tempfile::tempdir().unwrap();
    let mut c = store::open(data.path()).unwrap();
    enabled(&c);
    let mut total = [0usize; 5];
    let mut durations = Vec::new();
    for item in corpus {
        let mut ids = Vec::new();
        for (i, text) in item.learn.iter().enumerate() {
            let root = data.path().join(format!("{}-{i}", item.language));
            scene(&root, text, &item.language);
            ids.push(store::train(&mut c, &root).unwrap().unwrap());
        }
        let mut stats = [0usize; 5];
        for (i, text) in item.test.iter().enumerate() {
            for (at, target) in text.split_whitespace().enumerate().skip(1) {
                let before = text
                    .split_whitespace()
                    .take(at)
                    .collect::<Vec<_>>()
                    .join(" ")
                    + " ";
                if words::prefix(&before).is_empty() {
                    continue;
                }
                let target = target.trim_matches(|ch: char| !ch.is_alphabetic() && ch != '’');
                if !words::complete_word(target) {
                    continue;
                }
                stats[0] += 1;
                for personal in [false, true] {
                    let before = before
                        .chars()
                        .rev()
                        .take(256)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<String>();
                    let start = Instant::now();
                    let result = store::suggest(
                        &c,
                        &item.language,
                        &before,
                        &ids[i],
                        &Default::default(),
                        personal,
                    )
                    .unwrap();
                    if personal {
                        durations.push(start.elapsed().as_micros())
                    }
                    if let Some(result) = result {
                        let offset = if personal { 3 } else { 1 };
                        stats[offset] += 1;
                        stats[offset + 1] +=
                            usize::from(words::normalize(&result.word) == words::normalize(target));
                    }
                }
            }
            let [ctx, expected] = &item.isolation[i * 2..i * 2 + 2] else {
                unreachable!()
            };
            assert_eq!(
                word(&c, &item.language, ctx, &ids[i]).as_ref(),
                Some(expected)
            );
            assert_ne!(
                word(&c, &item.language, ctx, &ids[1 - i]).as_ref(),
                Some(expected)
            );
            assert_ne!(word(&c, &item.language, ctx, "").as_ref(), Some(expected));
        }
        for (target, count) in total.iter_mut().zip(stats) {
            *target += count;
        }
        eprintln!(
            "{} positions={} base couverture={} exact={} appris couverture={} exact={}",
            item.language, stats[0], stats[1], stats[2], stats[3], stats[4]
        );
        assert!(
            stats[4] > stats[2],
            "le corpus {} doit bénéficier de l’apprentissage",
            item.language
        );
    }
    durations.sort_unstable();
    let p50 = durations[durations.len() / 2];
    let p95 = durations[durations.len() * 95 / 100];
    let pages: i64 = c
        .pragma_query_value(None, "page_count", |row| row.get(0))
        .unwrap();
    let size: i64 = c
        .pragma_query_value(None, "page_size", |row| row.get(0))
        .unwrap();
    eprintln!(
        "total {:?}; p50 {p50} µs; p95 {p95} µs; SQLite {} octets; 6 contextes isolés",
        total,
        pages * size
    );
    assert!(
        (total[4] - total[2]) * 100 >= total[0] * 8,
        "gain minimal de 8 points sur les positions éligibles"
    );
}
