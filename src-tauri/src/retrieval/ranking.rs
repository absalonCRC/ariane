//! Keep lexical evidence immutable across chunks of the same source.
pub const SOURCE_THRESHOLD: f64 = 0.44;
pub const RECALL_THRESHOLD: f64 = 0.45;
#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    pub semantic_threshold: f64,
    pub suggestion_score: f64,
    pub deep_suggestion_score: f64,
    pub suggestion_margin: f64,
}
pub const DEFAULT: Policy = Policy {
    semantic_threshold: SOURCE_THRESHOLD,
    suggestion_score: 2.4,
    deep_suggestion_score: 1.9,
    suggestion_margin: 0.,
};
#[cfg(test)]
pub const BASELINE: Policy = Policy {
    semantic_threshold: 0.48,
    suggestion_score: 2.2,
    ..DEFAULT
};
pub fn hybrid(lexical: f64, semantic: f64, threshold: f64) -> f64 {
    if semantic < threshold {
        lexical
    } else {
        lexical.max(semantic * 4. + lexical.min(2.))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn duplicate_or_weaker_chunks_never_accumulate_a_bonus() {
        let best = [0.6f64, 0.6, 0.5]
            .into_iter()
            .map(|s| hybrid(0., s, SOURCE_THRESHOLD))
            .fold(0., f64::max);
        assert!(hybrid(0., 0.7, SOURCE_THRESHOLD) > best);
        assert_eq!(best, hybrid(0., 0.6, SOURCE_THRESHOLD));
    }
}
