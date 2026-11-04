use crate::{
    ai_policy::{Classification, Policy, POLICY},
    memory, project, vaults,
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
};

type Span = (String, usize, usize);
#[derive(Clone, Default)]
struct Counts {
    tp: usize,
    fp: usize,
    missed: usize,
}
impl Counts {
    fn precision(&self) -> f64 {
        self.tp as f64 / (self.tp + self.fp).max(1) as f64
    }
    fn recall(&self) -> f64 {
        self.tp as f64 / (self.tp + self.missed).max(1) as f64
    }
    fn f1(&self) -> f64 {
        2. * self.tp as f64 / (2 * self.tp + self.fp + self.missed).max(1) as f64
    }
    fn value(&self) -> Value {
        json!({"tp":self.tp,"fp":self.fp,"fn":self.missed,"support":self.tp+self.missed,
            "precision":self.precision(),"recall":self.recall(),"f1":self.f1()})
    }
}
fn counts(gold: &BTreeSet<Span>, predicted: &BTreeSet<Span>, label: Option<&str>) -> Counts {
    let matches = |s: &&Span| label.is_none_or(|l| s.0 == l);
    Counts {
        tp: predicted.intersection(gold).filter(matches).count(),
        fp: predicted.difference(gold).filter(matches).count(),
        missed: gold.difference(predicted).filter(matches).count(),
    }
}
fn gold(row: &Value) -> BTreeSet<Span> {
    row["case"]["expected"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            (
                s["label"].as_str().unwrap().into(),
                s["start"].as_u64().unwrap() as usize,
                s["end"].as_u64().unwrap() as usize,
            )
        })
        .collect()
}
fn output(row: &Value, policy: &Policy) -> Value {
    let mut output = row["output"].clone();
    let types: Vec<vaults::EntityType> =
        serde_json::from_value(row["case"].get("types").cloned().unwrap_or(json!([]))).unwrap();
    for item in output["entities"].as_array_mut().unwrap() {
        if let Some(base) = item.get("baseLabel").cloned() {
            item["label"] = base;
            let result = json!({"classification":item["classification"]});
            if let Some(kind) =
                vaults::predicted_type_with_policy(&result, &types, &policy.classification).filter(
                    |kind| {
                        !["Personne", "Lieu", "Organisation", "Œuvre", "Événement"].contains(kind)
                    },
                )
            {
                item["label"] = json!(format!("custom:{kind}"));
            }
        }
    }
    output
}
fn accepted(row: &Value, policy: &Policy) -> BTreeSet<Span> {
    let text = row["case"]["text"].as_str().unwrap();
    memory::parse_mentions(text, &output(row, policy), &policy.ner)
        .unwrap()
        .into_iter()
        .map(|(_, kind, a, b)| (kind, text[..a].chars().count(), text[..b].chars().count()))
        .collect()
}
fn raw(row: &Value) -> BTreeSet<Span> {
    row["output"]["entities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            (
                s["label"].as_str().unwrap().into(),
                s["start"].as_u64().unwrap() as usize,
                s["end"].as_u64().unwrap() as usize,
            )
        })
        .collect()
}
fn summary(rows: &[Value], predictions: &[BTreeSet<Span>]) -> Value {
    let mut total = Counts::default();
    let labels: BTreeSet<_> = rows
        .iter()
        .flat_map(gold)
        .chain(predictions.iter().flat_map(|v| v.iter().cloned()))
        .map(|s| s.0)
        .collect();
    let mut per_category = BTreeMap::new();
    for label in labels {
        let mut sum = Counts::default();
        for (row, predicted) in rows.iter().zip(predictions) {
            let c = counts(&gold(row), predicted, Some(&label));
            sum.tp += c.tp;
            sum.fp += c.fp;
            sum.missed += c.missed;
        }
        total.tp += sum.tp;
        total.fp += sum.fp;
        total.missed += sum.missed;
        per_category.insert(label, sum.value());
    }
    let negatives = rows.iter().filter(|r| gold(r).is_empty()).count();
    let false_displays = rows
        .iter()
        .zip(predictions)
        .filter(|(r, p)| gold(r).is_empty() && !p.is_empty())
        .count();
    json!({"micro":total.value(),"perCategory":per_category,"negativeCases":negatives,"negativeCasesWithFalseDisplays":false_displays})
}
fn category_count(rows: &[Value], policy: &Policy, label: &str) -> Counts {
    let mut sum = Counts::default();
    for row in rows {
        let c = counts(&gold(row), &accepted(row, policy), Some(label));
        sum.tp += c.tp;
        sum.fp += c.fp;
        sum.missed += c.missed;
    }
    sum
}
fn classify(row: &Value, policy: &Classification) -> Option<String> {
    let types: Vec<vaults::EntityType> =
        serde_json::from_value(row["case"]["types"].clone()).unwrap();
    vaults::example_type(row["case"]["title"].as_str().unwrap(), &types)
        .or_else(|| vaults::predicted_type_with_policy(&row["output"], &types, policy))
        .map(str::to_owned)
}
fn classification_summary(rows: &[Value], policy: &Classification) -> Value {
    let mut tp = 0;
    let mut wrong = 0;
    let mut missed = 0;
    let mut abstained = 0;
    let mut per_category: BTreeMap<String, Counts> = BTreeMap::new();
    for row in rows {
        let expected = row["case"]["expected"].as_str();
        let predicted = classify(row, policy);
        if predicted.as_deref() == expected && expected.is_some() {
            tp += 1;
        } else if predicted.is_some() {
            wrong += 1;
        }
        if predicted.is_none() {
            abstained += 1;
        }
        if expected.is_some() && predicted.as_deref() != expected {
            missed += 1;
        }
        if let Some(label) = expected {
            let c = per_category.entry(label.into()).or_default();
            if predicted.as_deref() == Some(label) {
                c.tp += 1;
            } else {
                c.missed += 1;
            }
        }
        if let Some(label) = predicted.filter(|p| Some(p.as_str()) != expected) {
            per_category.entry(label).or_default().fp += 1;
        }
    }
    let c = Counts {
        tp,
        fp: wrong,
        missed,
    };
    json!({"micro":c.value(),"wrongAssignments":wrong,"abstentions":abstained,"cases":rows.len(),
        "perCategory":per_category.into_iter().map(|(k,c)|(k,c.value())).collect::<BTreeMap<_,_>>()})
}
pub fn evaluate() {
    let path = PathBuf::from(std::env::var("ARIANE_NER_REPORT").unwrap());
    let mut report: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let rows = report["rows"].as_array().unwrap().clone();
    let notes = report["classification"].as_array().unwrap().clone();
    let baseline: Policy = serde_json::from_value(
        report
            .get("referencePolicy")
            .unwrap_or(&report["policy"])
            .clone(),
    )
    .unwrap();
    let mut selected = baseline.clone();
    let calibration = report["split"] == "calibration";
    let mut decisions = vec![];
    if calibration {
        let base = classification_summary(&notes, &baseline.classification);
        let mut best = base.clone();
        for score in [0.55, 0.65, 0.75, 0.85, 0.95] {
            for margin in [0.2, 0.3, 0.4] {
                let candidate = Classification { score, margin };
                let s = classification_summary(&notes, &candidate);
                let safe = s["micro"]["fp"].as_u64() <= base["micro"]["fp"].as_u64()
                    && s["micro"]["precision"].as_f64().unwrap() >= 0.95;
                decisions.push(json!({"task":"classification","score":score,"margin":margin,"metrics":s,"eligible":safe}));
                if safe
                    && s["micro"]["f1"].as_f64().unwrap()
                        > best["micro"]["f1"].as_f64().unwrap() + 0.02
                {
                    selected.classification = candidate;
                    best = s;
                }
            }
        }
        for label in baseline.ner.thresholds.keys() {
            let base = category_count(&rows, &baseline, label);
            let mut best = base.clone();
            for threshold in [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95] {
                let mut candidate = selected.clone();
                candidate.ner.thresholds.insert(label.clone(), threshold);
                let c = category_count(&rows, &candidate, label);
                let safe = base.tp + base.missed >= 6
                    && c.fp <= base.fp
                    && c.precision() >= 0.95
                    && c.recall() + 0.05 >= base.recall();
                decisions.push(json!({"task":"ner","label":label,"threshold":threshold,"metrics":c.value(),"eligible":safe}));
                if safe && c.f1() > best.f1() + 0.02 {
                    selected.ner.thresholds.insert(label.clone(), threshold);
                    best = c;
                }
            }
        }
    } else {
        // The policy must have been committed to its bundle before seeing this split.
        selected = POLICY.clone();
        assert_eq!(
            serde_json::to_value(&selected).unwrap(),
            report["policy"],
            "validation policy changed after inference"
        );
    }
    let predictions: Vec<_> = rows.iter().map(|r| accepted(r, &selected)).collect();
    let raw_predictions: Vec<_> = rows.iter().map(raw).collect();
    report["metrics"] = summary(&rows, &predictions);
    report["rawMetrics"] = summary(&rows, &raw_predictions);
    report["baselineMetrics"] = summary(
        &rows,
        &rows
            .iter()
            .map(|r| accepted(r, &baseline))
            .collect::<Vec<_>>(),
    );
    report["classificationMetrics"] = classification_summary(&notes, &selected.classification);
    report["baselineClassificationMetrics"] =
        classification_summary(&notes, &baseline.classification);
    report["selectedPolicy"] = serde_json::to_value(&selected).unwrap();
    report["calibrationDecisions"] = json!(decisions);
    for (row, predicted) in report["rows"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .zip(predictions)
    {
        row["accepted"] = json!(predicted);
        let d = tempfile::tempdir().unwrap();
        project::create(d.path(), "Entités synthétiques").unwrap();
        let text = row["case"]["text"].as_str().unwrap();
        let c = project::database(d.path()).unwrap();
        c.execute("DELETE FROM sections", []).unwrap();
        c.execute("INSERT INTO sections(id,title,kind,position,text,revision,mirror) VALUES('a','Témoin','scene',0,?,1,?)",rusqlite::params![text,project::hash(text)]).unwrap();
        memory::sync(d.path()).unwrap();
        let p = memory::passage(d.path(), "a", None).unwrap().unwrap();
        // This is the actual publisher, including surviving deterministic rules.
        memory::apply_entities(d.path(), &p, &output(row, &POLICY)).unwrap();
        let mut q=c.prepare("SELECT e.title,e.kind,m.start,m.end,m.origin FROM memory_entities e JOIN memory_mentions m ON m.entity_id=e.id ORDER BY m.start,m.end,e.kind").unwrap();
        row["published"] = json!(q
            .query_map([], |r| Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, usize>(2)?,
                r.get::<_, usize>(3)?,
                r.get::<_, String>(4)?
            )))
            .unwrap()
            .map(Result::unwrap)
            .collect::<Vec<_>>());
    }
    let published: Vec<BTreeSet<Span>> = report["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            let text = row["case"]["text"].as_str().unwrap();
            row["published"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| {
                    let label = match p[1].as_str().unwrap() {
                        "place" => "location",
                        s => s,
                    };
                    (
                        label.into(),
                        text[..p[2].as_u64().unwrap() as usize].chars().count(),
                        text[..p[3].as_u64().unwrap() as usize].chars().count(),
                    )
                })
                .collect()
        })
        .collect();
    report["publishedMetrics"] = summary(&rows, &published);
    report["publishedPolicy"] = serde_json::to_value(&*POLICY).unwrap();
    if !calibration {
        let current = &report["metrics"]["micro"];
        let before = &report["baselineMetrics"]["micro"];
        let passed = current["fp"].as_u64() <= before["fp"].as_u64()
            && current["recall"].as_f64().unwrap() + 0.05 >= before["recall"].as_f64().unwrap()
            && report["metrics"]["negativeCasesWithFalseDisplays"].as_u64()
                <= report["baselineMetrics"]["negativeCasesWithFalseDisplays"].as_u64()
            && report["classificationMetrics"]["wrongAssignments"].as_u64()
                <= report["baselineClassificationMetrics"]["wrongAssignments"].as_u64();
        report["validationBudgetsPassed"] = json!(passed);
    }
    std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    if !calibration {
        assert_eq!(
            report["validationBudgetsPassed"], true,
            "frozen validation budgets failed"
        );
    }
}
