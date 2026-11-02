use crate::error::Result;
use std::collections::HashSet;

/// Footnote labels are local to a scene, while Pandoc sees one compiled document.
pub(crate) fn namespace(text: &str, scene_id: &str, title: &str) -> Result<String> {
    let prefix = format!("ariane-{}-", scene_id.replace('-', ""));
    let mut definitions = HashSet::new();
    let mut references = HashSet::new();
    let mut output = String::with_capacity(text.len() + 32);
    let mut fence: Option<(u8, usize)> = None;
    for line in text.split_inclusive('\n') {
        let bytes = line.as_bytes();
        let indent = bytes.iter().take_while(|&&b| b == b' ').count();
        let start = if indent <= 3 { indent } else { 0 };
        let marker = bytes.get(start).copied().unwrap_or_default();
        let count = if marker == b'`' || marker == b'~' {
            bytes[start..].iter().take_while(|&&b| b == marker).count()
        } else { 0 };
        if let Some((open, minimum)) = fence {
            output.push_str(line);
            if marker == open && count >= minimum && bytes[start + count..].iter().all(|b| b.is_ascii_whitespace()) {
                fence = None;
            }
            continue;
        }
        if count >= 3 {
            fence = Some((marker, count));
            output.push_str(line);
            continue;
        }
        if indent >= 4 || line.starts_with('\t') {
            output.push_str(line);
            continue;
        }
        let definition = if indent <= 3 && bytes.get(indent..indent + 2) == Some(b"[^" as &[u8]) {
            bytes[indent + 2..].iter().position(|&b| b == b']').and_then(|end| {
                let end = indent + 2 + end;
                (bytes.get(end + 1) == Some(&b':')).then_some((indent, end + 1))
            })
        } else { None };
        let mut rewritten = String::with_capacity(line.len() + 32);
        let mut i = 0;
        let mut code_ticks = 0;
        while i < bytes.len() {
            if bytes[i] == b'`' {
                let count = bytes[i..].iter().take_while(|&&b| b == b'`').count();
                if code_ticks == 0 { code_ticks = count; }
                else if code_ticks == count { code_ticks = 0; }
                rewritten.push_str(&line[i..i + count]);
                i += count;
                continue;
            }
            if code_ticks == 0 && bytes.get(i..i + 2) == Some(b"[^" as &[u8]) &&
                bytes[..i].iter().rev().take_while(|&&b| b == b'\\').count() % 2 == 0 {
                if let Some(offset) = bytes[i + 2..].iter().position(|&b| b == b']') {
                    let end = i + 2 + offset;
                    let label = &line[i + 2..end];
                    if !label.is_empty() && !label.contains(['[', '\n']) {
                        if definition == Some((i, end + 1)) {
                            if !definitions.insert(label.to_owned()) {
                                return Err(format!("La scène « {title} » définit deux fois la note [^{label}]."));
                            }
                        } else {
                            references.insert(label.to_owned());
                        }
                        rewritten.push_str("[^");
                        rewritten.push_str(&prefix);
                        rewritten.push_str(label);
                        rewritten.push(']');
                        i = end + 1;
                        continue;
                    }
                }
            }
            let character = line[i..].chars().next().expect("valid UTF-8 boundary");
            rewritten.push(character);
            i += character.len_utf8();
        }
        output.push_str(&rewritten);
    }
    if let Some(missing) = references.difference(&definitions).next() {
        return Err(format!("La scène « {title} » utilise la note [^{missing}] sans définition."));
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scopes_notes_and_skips_code() {
        let text = "Une note[^1] et `[^code]`.\n\n```md\n[^fence]: Exemple\n```\n\n[^1]: Une note.\n";
        let out = namespace(text, "a-b", "Une scène").unwrap();
        assert!(out.contains("note[^ariane-ab-1]"));
        assert!(out.contains("[^ariane-ab-1]: Une note."));
        assert!(out.contains("`[^code]`"));
        assert!(out.contains("[^fence]: Exemple"));
    }
    #[test]
    fn rejects_missing_and_duplicate_definitions() {
        assert!(namespace("Texte[^1]", "a", "A").unwrap_err().contains("sans définition"));
        assert!(namespace("[^1]: A\n[^1]: B", "a", "A").unwrap_err().contains("deux fois"));
    }
}
