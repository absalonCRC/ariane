use crate::model::Source;
use unicode_normalization::UnicodeNormalization;
pub fn normalize(s: &str) -> String {
    s.nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}
fn field<'a>(fields: &'a serde_json::Value, key: &str) -> &'a serde_json::Value {
    fields
        .as_object()
        .and_then(|map| {
            map.iter()
                .find(|(k, _)| normalize(k) == normalize(key))
                .map(|(_, value)| value)
        })
        .unwrap_or(&serde_json::Value::Null)
}
pub fn parse(vault: &str, path: &str, raw: &str) -> Source {
    let (fields, text) = if let Some(t) = raw.strip_prefix("---\n") {
        if let Some((yaml, body)) = t.split_once("\n---") {
            let val: serde_json::Value = crate::yaml::from_str(yaml).unwrap_or_default();
            (
                val,
                body.trim().to_owned(),
            )
        } else {
            (serde_json::json!({}), raw.to_owned())
        }
    } else {
        (serde_json::json!({}), raw.to_owned())
    };
    let filename = std::path::Path::new(path)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let title = field(&fields, "title")
        .as_str()
        .or(field(&fields, "titre").as_str());
    let name = field(&fields, "nom")
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            fields.as_object().and_then(|map| {
                map.iter().find_map(|(key, value)| {
                    let key = normalize(key);
                    (key.starts_with("nom de ") || key.starts_with("nom du "))
                        .then(|| value.as_str().filter(|s| !s.trim().is_empty()))
                        .flatten()
                })
            })
        });
    let first = field(&fields, "prénom")
        .as_str()
        .filter(|s| !s.trim().is_empty());
    let title = title
        .filter(|s| !s.trim().is_empty())
        .map(str::to_owned)
        .or_else(|| match (first, name) {
            (Some(first), Some(name)) if !normalize(name).starts_with(&normalize(first)) => {
                Some(format!("{} {}", first.trim(), name.trim()))
            }
            (_, Some(name)) => Some(name.to_owned()),
            (Some(first), None) => Some(first.to_owned()),
            _ => None,
        })
        .unwrap_or(filename);
    let mut aliases = as_list(field(&fields, "aliases"));
    for alias in as_list(field(&fields, "alias")) {
        if !aliases.contains(&alias) {
            aliases.push(alias);
        }
    }
    let mut tags = as_list(field(&fields, "tags"));
    let re = regex::Regex::new(r"(?:^|\s)#([\p{L}\p{N}_/-]+)").unwrap();
    for c in re.captures_iter(&text) {
        let tag = c[1].to_owned();
        if !tags.contains(&tag) {
            tags.push(tag)
        }
    }
    let specified = field(&fields, "type").as_str().unwrap_or("");
    let joined = normalize(&format!("{} {}", specified, tags.join(" ")));
    let kind = if joined.contains("personne") || joined.contains("person") {
        "Personne"
    } else if joined.contains("lieu") || joined.contains("place") {
        "Lieu"
    } else if joined.contains("concept") {
        "Concept"
    } else if joined.contains("evenement") || joined.contains("event") {
        "Événement"
    } else if !specified.is_empty() {
        specified
    } else {
        "Note"
    }
    .to_owned();
    Source {
        fingerprint: crate::project::hash(raw),
        id: crate::project::hash(&format!("{vault}/{path}")),
        vault_id: vault.into(),
        path: path.into(),
        title,
        kind,
        aliases,
        tags,
        fields,
        text,
        page: None,
        matched: None,
        score: 0.,
        enrichment: None,
    }
}
pub fn as_list(v: &serde_json::Value) -> Vec<String> {
    if let Some(a) = v.as_array() {
        a.iter()
            .filter_map(|x| x.as_str().map(|s| s.trim_start_matches('#').to_owned()))
            .collect()
    } else if let Some(s) = v.as_str() {
        s.split(',')
            .map(|s| s.trim().trim_start_matches('#').to_owned())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        vec![]
    }
}
/// Inputs are normalized once by the caller, shared across all candidate aliases.
#[cfg(test)]
pub fn exact_mention_normalized(t: &str, n: &str, allow_end: bool) -> bool {
    if n.trim().is_empty() {
        return false;
    }
    for (start, _) in t.match_indices(n) {
        let end = start + n.len();
        let before = t[..start].chars().next_back();
        let after = t[end..].chars().next();
        if before.is_none_or(|c| !c.is_alphanumeric())
            && after.is_none_or(|c| !c.is_alphanumeric())
            && (allow_end || end < t.len())
        {
            return true;
        }
    }
    false
}
pub fn chunks(text: &str) -> Vec<String> {
    let mut chunks = vec![];
    let mut buf = String::new();
    for paragraph in text.split("\n\n") {
        if buf.len() + paragraph.len() > 1800 && !buf.is_empty() {
            chunks.push(std::mem::take(&mut buf))
        }
        if paragraph.len() > 3500 {
            let words: Vec<_> = paragraph.split_whitespace().collect();
            for part in words.chunks(250) {
                chunks.push(part.join(" "))
            }
        } else {
            buf.push_str(paragraph);
            buf.push_str("\n\n")
        }
    }
    if !buf.trim().is_empty() {
        chunks.push(buf.trim().into())
    }
    chunks
}
#[cfg(test)]
mod tests {
    use super::*;
    fn exact_mention(text: &str, name: &str, allow_end: bool) -> bool {
        exact_mention_normalized(&normalize(text), &normalize(name), allow_end)
    }
    #[test]
    fn normalized_mentions_preserve_unicode_boundaries() {
        assert!(exact_mention("À ÉVRY, puis à Lyon.", "Evry", false));
        assert!(!exact_mention("Évryenne", "Evry", true));
        assert!(!exact_mention("préÉvry", "Evry", true));
        assert!(exact_mention("l’Évry", "Evry", true));
        assert!(!exact_mention("Évry", "Evry", false));
        assert!(!exact_mention("texte", "", true));
    }
    #[test]
    fn partial_person_does_not_match() {
        assert!(!exact_mention("Pierre ", "Pierre Plantard", true));
        assert!(!exact_mention("Pierre Pl", "Pierre Perret", true));
        assert!(exact_mention(
            "Pierre Plantard est né",
            "Pierre Plantard",
            false
        ));
        assert!(!exact_mention("Pierre Plantard", "Pierre Plantard", false));
        assert!(!exact_mention(
            "JeanPierre Plantardx ",
            "Pierre Plantard",
            true
        ));
    }
    #[test]
    fn parses_types_and_aliases() {
        let s = parse(
            "v",
            "Pierre.md",
            "---\ntags: [personne]\naliases: [P. Plantard]\nactivite: écrivain\n---\nTexte",
        );
        assert_eq!(s.kind, "Personne");
        assert_eq!(s.aliases[0], "P. Plantard");
    }
    #[test]
    fn parses_rlc_french_frontmatter_names_and_aliases() {
        let s = parse(
            "v",
            "inconnu.md",
            "---\nPrénom: Marie\nNom: Curie\nAlias: [M. Curie]\nType: Personne\n---\nScientifique",
        );
        assert_eq!(s.title, "Marie Curie");
        assert_eq!(s.kind, "Personne");
        assert_eq!(s.aliases, ["M. Curie"]);
        let book = parse(
            "v",
            "inconnu.md",
            "---\nTitre: Un livre\nType: ouvrage\n---\nDescription",
        );
        assert_eq!(book.title, "Un livre");
        let place = parse(
            "v",
            "inconnu.md",
            "---\nNom de la région: Occitanie\n---\n#lieu",
        );
        assert_eq!(place.title, "Occitanie");
        assert_eq!(place.kind, "Lieu");
    }
}
