use regex::Regex;
use std::{collections::HashMap, sync::LazyLock};
use unicode_normalization::UnicodeNormalization;

pub(super) type Counts = HashMap<(String, String), u32>;
static WORD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\p{L}[\p{L}\p{M}]*(?:['’\-]\p{L}[\p{L}\p{M}]*)*").unwrap());
pub(super) const MAX_WORD: usize = 96;

pub(super) fn language(raw: &str) -> Option<&str> {
    match raw.split(['-', '_']).next()? {
        language @ ("fr" | "en" | "es") => Some(language),
        _ => None,
    }
}

pub(super) fn normalize(word: &str) -> String {
    word.replace('’', "'").to_lowercase().nfc().collect()
}

pub(super) fn complete_word(word: &str) -> bool {
    word.len() <= MAX_WORD && WORD.find(word).is_some_and(|m| m.as_str() == word)
}

fn sentence_break(text: &str) -> bool {
    text.contains(['.', ':', ';', '!', '?', '…', '\n', '`'])
}

pub(super) fn prefix(text: &str) -> Vec<String> {
    let matches: Vec<_> = WORD.find_iter(text).collect();
    let mut words = matches.into_iter().rev();
    let Some(last) = words.next() else {
        return vec![];
    };
    if !text[last.end()..].chars().all(char::is_whitespace)
        || sentence_break(&text[last.end()..])
        || last.as_str().len() > MAX_WORD
    {
        return vec![];
    }
    let last_word = normalize(last.as_str());
    if let Some(previous) = words.next() {
        if !sentence_break(&text[previous.end()..last.start()])
            && previous.as_str().len() <= MAX_WORD
        {
            return vec![
                format!("{} {last_word}", normalize(previous.as_str())),
                last_word,
            ];
        }
    }
    vec![last_word]
}

pub(super) fn counts(text: &str) -> Counts {
    let mut counts = Counts::new();
    let mut fenced = None::<(char, usize)>;
    for line in text.lines() {
        let head = line.trim_start();
        if let Some(marker @ ('`' | '~')) = head.chars().next() {
            let width = head.chars().take_while(|c| *c == marker).count();
            if width >= 3 {
                match fenced {
                    None => {
                        fenced = Some((marker, width));
                        continue;
                    }
                    Some((kind, opening))
                        if marker == kind
                            && width >= opening
                            && head[width..].trim().is_empty() =>
                    {
                        fenced = None;
                        continue;
                    }
                    _ => {}
                }
            }
        }
        if fenced.is_some() || line.starts_with("    ") || line.starts_with('\t') {
            continue;
        }
        let mut word = String::new();
        let mut before = String::new();
        for plain in line.split('`').step_by(2) {
            let mut end = 0;
            for next in WORD.find_iter(plain) {
                if sentence_break(&plain[end..next.start()]) || next.as_str().len() > MAX_WORD {
                    word.clear();
                    before.clear();
                }
                end = next.end();
                if next.as_str().len() > MAX_WORD {
                    continue;
                }
                for key in [
                    (!before.is_empty() && !word.is_empty()).then(|| format!("{before} {word}")),
                    (!word.is_empty()).then(|| word.clone()),
                ]
                .into_iter()
                .flatten()
                {
                    let value = counts
                        .entry((key, next.as_str().nfc().collect()))
                        .or_default();
                    *value = value.saturating_add(1);
                }
                before = word;
                word = normalize(next.as_str());
            }
            word.clear();
            before.clear();
        }
    }
    counts
}

pub(super) static BASE: LazyLock<HashMap<&'static str, Counts>> = LazyLock::new(|| {
    include_str!("base.txt")
        .trim()
        .split('\n')
        .collect::<Vec<_>>()
        .chunks_exact(2)
        .map(|pair| (pair[0].trim_matches(['[', ']']), counts(pair[1])))
        .collect()
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_curly_apostrophes_accents_and_skips_code() {
        assert_eq!(
            prefix("😺 Le chat d’Éloïse "),
            ["chat d'éloïse", "d'éloïse"]
        );
        assert!(prefix("Maëlys. ").is_empty());
        let result = counts(
            "Maëlys pousse l’écluse. Elle pousse la porte.\n```rs\nMaëlys pousse secret\n```",
        );
        assert_eq!(
            result.get(&("maëlys pousse".into(), "l’écluse".into())),
            Some(&1)
        );
        assert!(!result.keys().any(|(_, word)| word == "secret"));
        assert_eq!(BASE.len(), 3);
    }
}
