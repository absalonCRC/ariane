use serde_json::{json, Value};
use std::sync::LazyLock;
static FULL: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\b(1er|[0-3]?[0-9])\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+([0-9]{3,4})\b").unwrap()
});
static YEARS: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\b[0-9]{4}\b").unwrap());
static RANGE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\b(?:entre\s+([0-9]{4})\s+et|de\s+([0-9]{4})\s+[àa])\s+([0-9]{4})\b")
        .unwrap()
});
static CENTURY: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\b([IVX]{1,6}|[0-9]{1,2})(?:e|ème|eme|er)?\s+siècle\b").unwrap()
});
static RELATIVE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\b(un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|[0-9]{1,2})\s+ans?\s+plus\s+(tard|tôt|tot)\b").unwrap()
});
static UNCERTAIN: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"(?i)\b(selon|aurait|serait|peut-être|probablement|rumeur|hypothèse|pas|jamais)\b",
    )
    .unwrap()
});
fn month(token: &str) -> Option<u32> {
    [
        "janvier",
        "février",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "août",
        "septembre",
        "octobre",
        "novembre",
        "décembre",
    ]
    .iter()
    .position(|m| {
        *m == token
            .to_lowercase()
            .replace("fevrier", "février")
            .replace("aout", "août")
            .replace("decembre", "décembre")
    })
    .map(|i| i as u32 + 1)
}
pub(super) fn uncertain(text: &str) -> bool {
    UNCERTAIN.is_match(text)
}
fn number(s: &str) -> Option<i32> {
    [
        "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
    ]
    .iter()
    .position(|v| *v == s.to_lowercase())
    .map(|v| v as i32)
    .or_else(|| s.parse().ok())
}
pub(super) fn dates(text: &str) -> Vec<Value> {
    let mut out = Vec::new();
    let mut occupied = Vec::new();
    for m in FULL.captures_iter(text) {
        let whole = m.get(0).unwrap();
        occupied.push((whole.start(), whole.end()));
        if let (Ok(day), Ok(year), Some(month)) = (
            m[1].replace("1er", "1").parse::<u32>(),
            m[3].parse::<i32>(),
            month(&m[2]),
        ) {
            if chrono::NaiveDate::from_ymd_opt(year, month, day).is_some() {
                out.push(json!({"date":format!("{year:04}-{month:02}-{day:02}"),"expression":whole.as_str(),"precision":"day","approximate":false,"start":whole.start(),"end":whole.end()}));
            }
        }
    }
    for m in RANGE.captures_iter(text) {
        let whole = m.get(0).unwrap();
        occupied.push((whole.start(), whole.end()));
        let first = m.get(1).or_else(|| m.get(2)).unwrap().as_str();
        let last = &m[3];
        if first <= last {
            out.push(json!({"date":format!("{first}–{last}"),"expression":whole.as_str(),"precision":"interval","approximate":false,"start":whole.start(),"end":whole.end()}));
        }
    }
    for m in YEARS.find_iter(text) {
        if occupied
            .iter()
            .any(|(a, b)| m.start() >= *a && m.end() <= *b)
        {
            continue;
        }
        let near = text[..m.start()]
            .chars()
            .rev()
            .take(14)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>()
            .to_lowercase();
        let approximate = ["vers", "environ", "autour de"]
            .iter()
            .any(|p| near.trim_end().ends_with(p));
        out.push(json!({"date":m.as_str(),"expression":m.as_str(),"precision":"year","approximate":approximate,"start":m.start(),"end":m.end()}));
    }
    for m in CENTURY.captures_iter(text) {
        let whole = m.get(0).unwrap();
        out.push(json!({"date":whole.as_str(),"expression":whole.as_str(),"precision":"century","approximate":false,"start":whole.start(),"end":whole.end()}));
    }
    out.sort_by_key(|v| v["start"].as_u64().unwrap_or(0));
    // Only an explicit, non-approximate preceding year in this node anchors a relative year.
    for m in RELATIVE.captures_iter(text) {
        let whole = m.get(0).unwrap();
        let previous = out.iter().rev().find(|v| {
            v["end"].as_u64().unwrap_or(u64::MAX) < whole.start() as u64
                && v["precision"] == "year"
                && v["approximate"] == false
        });
        let date = previous
            .and_then(|v| v["date"].as_str())
            .and_then(|y| y.parse::<i32>().ok())
            .zip(number(&m[1]))
            .map(|(year, n)| {
                year + if &m[2].to_lowercase() == "tard" {
                    n
                } else {
                    -n
                }
            });
        out.push(json!({"date":date.map(|y|y.to_string()).unwrap_or_else(||whole.as_str().to_owned()),"expression":whole.as_str(),"precision":if date.is_some(){"relative-year"}else{"unresolved"},"approximate":false,"start":whole.start(),"end":whole.end()}));
    }
    out.sort_by_key(|v| v["start"].as_u64().unwrap_or(0));
    out
}
pub(super) fn sentence(text: &str, start: usize, end: usize) -> &str {
    let before = text[..start]
        .rfind(['.', '!', '?', '\n'])
        .map_or(0, |i| i + 1);
    let after = text[end..]
        .find(['.', '!', '?', '\n'])
        .map_or(text.len(), |i| end + i + 1);
    text[before..after].trim()
}
