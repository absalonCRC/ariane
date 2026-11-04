//! The worker and the publisher share a versioned acceptance policy.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::LazyLock};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ner {
    pub thresholds: BTreeMap<String, f64>,
    pub custom: f64,
    pub lowercase_person: f64,
}
impl Ner {
    pub fn threshold(&self, label: &str) -> f64 {
        self.thresholds.get(label).copied().unwrap_or_else(|| {
            if label.starts_with("custom:") {
                self.custom
            } else {
                1.1
            }
        })
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Classification {
    pub score: f64,
    pub margin: f64,
}
impl Classification {
    pub fn accepts(&self, score: f64, next: f64) -> bool {
        score.is_finite()
            && next.is_finite()
            && (0.0..=1.0).contains(&score)
            && (0.0..=1.0).contains(&next)
            && score >= self.score
            && score - next >= self.margin
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Policy {
    pub version: String,
    pub ner: Ner,
    pub classification: Classification,
}
pub static POLICY: LazyLock<Policy> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../resources/engine/ai-policy.json"))
        .expect("bundled AI policy")
});

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_confidence_never_publishes_a_classification() {
        for score in [f64::NAN, f64::INFINITY, -1., 1.01] {
            assert!(!POLICY.classification.accepts(score, 0.));
            assert!(!POLICY.classification.accepts(0.9, score));
        }
        assert!(!POLICY.classification.accepts(0.8, 0.7));
        assert!(POLICY.classification.accepts(0.9, 0.1));
        assert_eq!(POLICY.ner.threshold("unknown"), 1.1);
        assert!(POLICY.ner.threshold("custom:Institution") >= 0.8);
    }
}
