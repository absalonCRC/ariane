//! Conservative checks, not a semantic equivalence proof. Uncertainty keeps ASR text.
use std::sync::LazyLock;
static WORDS: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"[\p{L}\p{N}]+(?:[.,][\p{N}]+)?").unwrap());
fn words(text: &str) -> Vec<String> {
    WORDS
        .find_iter(text)
        .map(|m| m.as_str().to_lowercase())
        .collect()
}
fn spoken_number(word: &str) -> Option<i64> {
    match word {
        "zéro" | "zero" => Some(0),
        "un" | "une" => Some(1),
        "deux" => Some(2),
        "trois" => Some(3),
        "quatre" => Some(4),
        "cinq" => Some(5),
        "six" => Some(6),
        "sept" => Some(7),
        "huit" => Some(8),
        "neuf" => Some(9),
        "dix" => Some(10),
        "onze" => Some(11),
        "douze" => Some(12),
        "treize" => Some(13),
        "quatorze" => Some(14),
        "quinze" => Some(15),
        "seize" => Some(16),
        "vingt" => Some(20),
        "trente" => Some(30),
        "quarante" => Some(40),
        "cinquante" => Some(50),
        "soixante" => Some(60),
        "cent" | "cents" => Some(100),
        "mille" => Some(1000),
        _ => None,
    }
}
fn numbers(words: &[String]) -> Vec<String> {
    let mut output = vec![];
    let mut group = vec![];
    for word in words {
        if spoken_number(word).is_some() {
            group.push(word.as_str());
        } else {
            if !group.is_empty() {
                output.push(number_group(&group));
                group.clear();
            }
            if word.chars().any(char::is_numeric) {
                output.push(word.replace(',', "."));
            }
        }
    }
    if !group.is_empty() {
        output.push(number_group(&group));
    }
    output
}
fn number_group(words: &[&str]) -> String {
    let values: Vec<_> = words.iter().filter_map(|w| spoken_number(w)).collect();
    // Normalize only these unambiguous forms. More complex quantities and
    // spoken sequences stay literal; adding/multiplying them invents amounts
    // ("mille deux cents" is not 100200, "quatre vingt" is not 24).
    let number = match values.as_slice() {
        [n] => Some(*n),
        [100, n] if (1..100).contains(n) => Some(100 + n),
        [n, 100] if (2..10).contains(n) => Some(n * 100),
        _ => None,
    };
    number
        .map(|n| n.to_string())
        .unwrap_or_else(|| format!("spoken:{}", words.join("|")))
}
pub fn plausible(raw: &str, cleaned: &str) -> bool {
    let mut original = words(raw);
    let result = words(cleaned);
    // Only the immediately corrected spoken term is exempt, not the whole sentence.
    for marker in ["non plutôt", "non plutot", "non pardon", "non attendez"] {
        if raw.to_lowercase().contains(marker) {
            let marker_words = words(marker);
            if let Some(i) = original.windows(2).position(|w| w == marker_words) {
                original.drain(i.saturating_sub(1)..i + 2);
            }
        }
    }
    if original.is_empty() || result.is_empty() || result.len() > original.len() * 2 + 4 {
        return false;
    }
    let negatives = |ws: &[String]| {
        ws.iter()
            .filter(|w| {
                [
                    "ne", "n", "pas", "jamais", "plus", "aucun", "aucune", "ni", "sans",
                ]
                .contains(&w.as_str())
            })
            .cloned()
            .collect::<Vec<_>>()
    };
    if negatives(&original) != negatives(&result) || numbers(&original) != numbers(&result) {
        return false;
    }
    let dates = |ws: &[String]| {
        ws.iter()
            .filter(|w| {
                [
                    "lundi",
                    "mardi",
                    "mercredi",
                    "jeudi",
                    "vendredi",
                    "samedi",
                    "dimanche",
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
                    "hier",
                    "demain",
                ]
                .contains(&w.as_str())
            })
            .cloned()
            .collect::<Vec<_>>()
    };
    if dates(&original) != dates(&result) {
        return false;
    }
    for word in WORDS
        .find_iter(raw)
        .map(|m| m.as_str())
        .filter(|w| w.chars().next().is_some_and(char::is_uppercase))
    {
        if [
            "Je", "J", "Le", "La", "Les", "Un", "Une", "Il", "Elle", "Nous", "Vous", "Ils",
            "Elles", "Bonjour", "C", "Ce", "Cette", "Ces",
        ]
        .contains(&word)
        {
            continue;
        }
        let lower = word.to_lowercase();
        if original.contains(&lower) && !result.contains(&lower) {
            return false;
        }
    }
    let shared = result.iter().filter(|w| original.contains(w)).count();
    let filler = |w: &str| ["euh", "heu", "hum", "eh", "ben", "um", "uh"].contains(&w);
    let numeric = |w: &str| spoken_number(w).is_some() || w.chars().any(char::is_numeric);
    let content: Vec<_> = original
        .iter()
        .filter(|w| !filler(w) && !numeric(w))
        .collect();
    let output: Vec<_> = result
        .iter()
        .filter(|w| !filler(w) && !numeric(w))
        .collect();
    let mut cursor = 0;
    for word in &output {
        let Some(position) = content[cursor..].iter().position(|w| w == word) else {
            return false;
        };
        cursor += position + 1;
    }
    shared * 2 >= result.len()
        && shared * 3 >= original.len()
        && content.iter().all(|w| output.contains(w))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uncertain_composed_amounts_never_validate_an_invented_number() {
        assert!(!plausible(
            "Le montant est de mille deux cents euros.",
            "Le montant est de 100200 euros."
        ));
        assert!(!plausible(
            "Le montant est de quatre vingt euros.",
            "Le montant est de 24 euros."
        ));
        assert!(plausible(
            "Le montant est de mille deux cents euros",
            "Le montant est de mille deux cents euros."
        ));
    }
    #[test]
    fn preserves_negations_names_amounts_and_explicit_spoken_corrections() {
        assert!(!plausible(
            "Je ne veux pas publier ce texte.",
            "Je veux publier ce texte."
        ));
        assert!(!plausible(
            "Le montant est de 120 euros.",
            "Le montant est de 900 euros."
        ));
        assert!(!plausible("Marie arrive lundi.", "Pierre arrive lundi."));
        assert!(!plausible("Marie aime Pierre.", "Pierre aime Marie."));
        assert!(!plausible("Marie arrive lundi.", "Marie arrive mardi."));
        assert!(plausible(
            "Le montant est de cent vingt euros.",
            "Le montant est de 120 euros."
        ));
        assert!(plausible(
            "Bonjour je voudrais le rapport vendredi non plutôt lundi matin",
            "Bonjour, je voudrais le rapport lundi matin."
        ));
    }
}
