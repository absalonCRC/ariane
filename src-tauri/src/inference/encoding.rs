//! Token budgets include prompts. Ranges always refer to the unchanged source.
use crate::error::Result;
use std::ops::Range;

pub const VERSION: &str = "sentence-tokens-v2";
pub const TOKENS: usize = 512;
pub fn prompt(text: &str, title: Option<&str>, query: bool) -> String {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if query {
        format!("task: search result | query: {text}")
    } else {
        format!(
            "title: {} | text: {text}",
            title
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("none")
                .chars()
                .take(160)
                .collect::<String>()
        )
    }
}

pub fn split(text: &str, mut fits: impl FnMut(&str) -> Result<bool>) -> Result<Vec<Range<usize>>> {
    split_with_overlap(text, 64, &mut fits)
}
pub fn split_with_overlap(
    text: &str,
    overlap_chars: usize,
    mut fits: impl FnMut(&str) -> Result<bool>,
) -> Result<Vec<Range<usize>>> {
    let mut out = vec![];
    let mut start = 0;
    while start < text.len() {
        let tail = &text[start..];
        if fits(tail)? {
            out.push(start..text.len());
            break;
        }
        let boundaries: Vec<_> = tail
            .char_indices()
            .map(|(i, _)| i)
            .chain([tail.len()])
            .collect();
        let (mut low, mut high) = (1, boundaries.len() - 1);
        while low < high {
            let middle = (low + high).div_ceil(2);
            if fits(&tail[..boundaries[middle]])? {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        let maximum = boundaries[low];
        if !fits(&tail[..maximum])? {
            return Err("Budget de tokens insuffisant.".into());
        }
        let preferred = tail[..maximum]
            .char_indices()
            .filter(|(i, c)| *i > maximum / 2 && matches!(c, '.' | '!' | '?' | ';' | '\n'))
            .map(|(i, c)| i + c.len_utf8())
            .next_back()
            .or_else(|| {
                tail[..maximum]
                    .char_indices()
                    .filter(|(i, c)| *i > maximum / 2 && c.is_whitespace())
                    .map(|(i, c)| i + c.len_utf8())
                    .next_back()
            })
            .unwrap_or(maximum);
        // BPE token counts of prefixes are not strictly monotone. A shorter
        // sentence boundary still has to satisfy the full prompt budget.
        let cut = if fits(&tail[..preferred])? {
            preferred
        } else {
            maximum
        };
        out.push(start..start + cut);
        // A short overlap preserves boundary context without changing ownership.
        let overlap = tail[..cut]
            .char_indices()
            .rev()
            .take(overlap_chars)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(0);
        start += if overlap > cut / 2 { overlap } else { cut };
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_ranges_cover_every_unicode_byte_with_no_gap() {
        let text = format!("{} {}", "Élise arrive. 🙂 ".repeat(30), "x".repeat(300));
        let ranges = split(&text, |s| Ok(s.chars().count() <= 80)).unwrap();
        let mut covered = 0;
        for r in ranges {
            assert!(r.start <= covered);
            assert!(text[r.clone()].chars().count() <= 80);
            covered = r.end;
        }
        assert_eq!(covered, text.len());
    }
    #[test]
    fn a_preferred_sentence_boundary_is_rechecked_against_the_tokenizer() {
        let text = "abcdefgh. ijklmnopqrs";
        let fits = |s: &str| s.len() <= 12 && !s.ends_with('.');
        let ranges = split_with_overlap(text, 0, |s| Ok(fits(s))).unwrap();
        assert!(ranges.iter().all(|r| fits(&text[r.clone()])));
        assert_eq!(ranges[0], 0..12);
        assert_eq!(ranges.last().unwrap().end, text.len());
    }
}
