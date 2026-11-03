//! Frontmatter has no include, interpolation or file access capabilities.
use crate::error::{AppResult, Result};
pub fn from_str<T: serde::de::DeserializeOwned>(input: &str) -> Result<T> {
    if input.len() > 1024 * 1024 {
        return Err("En-tête YAML trop volumineux".into());
    }
    let mut budget = serde_saphyr::Budget::default();
    budget.max_depth = 32;
    budget.flow_nesting_limit = 32;
    budget.max_events = 100_000;
    budget.max_nodes = 25_000;
    budget.max_aliases = 128;
    budget.max_anchors = 128;
    budget.max_recorded_anchor_events = 25_000;
    budget.max_recorded_anchor_bytes = 1024 * 1024;
    budget.max_inclusion_depth = 0;
    let mut options = serde_saphyr::Options::default();
    options.budget = Some(budget);
    serde_saphyr::from_str_with_options(input, options).app()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_french_fields_and_limits_hostile_documents() {
        let value: serde_json::Value =
            from_str("Prénom: Émilie\nAlias: &a [Mimi]\nAutres: *a").unwrap();
        assert_eq!(value["Autres"][0], "Mimi");
        assert!(
            from_str::<serde_json::Value>(&format!("{}0{}", "[".repeat(100), "]".repeat(100)))
                .is_err()
        );
        assert!(from_str::<serde_json::Value>(&"a".repeat(1024 * 1024 + 1)).is_err());
    }
}
