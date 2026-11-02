use crate::{model::Source, vaults::parse::normalize};
use aho_corasick::AhoCorasick;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    sync::LazyLock,
};
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    pub field: String,
    pub value: String,
    pub target: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Related {
    pub id: String,
    pub title: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub id: String,
    pub source: String,
    pub fingerprint: String,
    pub section: String,
    pub node: Option<String>,
    #[serde(skip)]
    pub line: usize,
    #[serde(skip)]
    pub quote: String,
    pub uncertain: bool,
    pub facts: Vec<Fact>,
    pub related: Vec<Related>,
}

// Byte mapping keeps evidence values faithful to accented / decomposed Unicode input.
struct Folded<'a> {
    original: &'a str,
    text: String,
    positions: Vec<(usize, usize)>,
}
impl<'a> Folded<'a> {
    fn new(original: &'a str) -> Self {
        let mut text = String::new();
        let mut positions = vec![];
        for (start, c) in original.char_indices() {
            let end = start + c.len_utf8();
            for folded in c
                .to_string()
                .nfd()
                .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
                .flat_map(char::to_lowercase)
            {
                text.push(folded);
                positions.extend(std::iter::repeat_n((start, end), folded.len_utf8()));
            }
        }
        Self {
            original,
            text,
            positions,
        }
    }
    fn original_range(&self, start: usize, end: usize) -> &str {
        if start == end {
            return "";
        }
        &self.original[self.positions[start].0..self.positions[end - 1].1]
    }
}

pub struct Catalog<'a> {
    sources: &'a [Source],
    matcher: AhoCorasick,
    owners: Vec<Option<usize>>,
}
#[derive(Clone)]
struct Mention {
    start: usize,
    end: usize,
    owner: Option<usize>,
}
impl<'a> Catalog<'a> {
    pub fn new(sources: &'a [Source]) -> Result<Self, String> {
        let mut names: BTreeMap<String, BTreeSet<usize>> = BTreeMap::new();
        for (i, s) in sources.iter().enumerate() {
            let stem = std::path::Path::new(&s.path)
                .file_stem()
                .and_then(|p| p.to_str())
                .unwrap_or("");
            let path = s.path.strip_suffix(".md").unwrap_or(&s.path);
            for name in std::iter::once(s.title.as_str())
                .chain(s.aliases.iter().map(String::as_str))
                .chain([stem, path])
            {
                let name = normalize(name.trim());
                if name.chars().count() >= 3 {
                    names.entry(name).or_default().insert(i);
                }
            }
        }
        let owners = names
            .values()
            .map(|ids| (ids.len() == 1).then(|| *ids.first().unwrap()))
            .collect();
        let matcher = AhoCorasick::new(names.keys()).map_err(|e| e.to_string())?;
        Ok(Self {
            sources,
            matcher,
            owners,
        })
    }
    fn mentions(&self, text: &str) -> Vec<Mention> {
        let links: Vec<_> = WIKI
            .captures_iter(text)
            .map(|c| {
                let whole = c.get(0).unwrap();
                let target = c.get(1).unwrap();
                (whole.start(), whole.end(), target.start(), target.end())
            })
            .collect();
        let mut found: Vec<_> = self
            .matcher
            .find_overlapping_iter(text)
            .filter_map(|m| {
                // A link's displayed caption is not a second entity mention.
                if links.iter().any(|&(start, end, target_start, target_end)| {
                    m.start() >= start
                        && m.end() <= end
                        && (m.start() != target_start || m.end() != target_end)
                }) {
                    return None;
                }
                let before = text[..m.start()].chars().next_back();
                let after = text[m.end()..].chars().next();
                (before.is_none_or(|c| !c.is_alphanumeric())
                    && after.is_none_or(|c| !c.is_alphanumeric()))
                .then(|| Mention {
                    start: m.start(),
                    end: m.end(),
                    owner: self.owners[m.pattern().as_usize()],
                })
            })
            .collect();
        found.sort_by_key(|m| (m.start, std::cmp::Reverse(m.end)));
        let mut end = 0;
        found
            .into_iter()
            .filter(|m| {
                if m.start < end {
                    false
                } else {
                    end = m.end;
                    true
                }
            })
            .collect()
    }
    /// Exact, unambiguous catalog names with byte offsets in the original text.
    pub(crate) fn inline_mentions(&self, text: &str) -> Vec<(usize, usize, usize)> {
        let folded = Folded::new(text);
        self.mentions(&folded.text)
            .into_iter()
            .filter_map(|mention| {
                let owner = mention.owner?;
                let start = folded.positions.get(mention.start)?.0;
                let mut end = folded.positions.get(mention.end.checked_sub(1)?)?.1;
                // Keep trailing decomposed accents attached to the marked name.
                end += text[end..]
                    .chars()
                    .take_while(|c| unicode_normalization::char::is_combining_mark(*c))
                    .map(char::len_utf8)
                    .sum::<usize>();
                Some((start, end, owner))
            })
            .collect()
    }
    pub fn extract(&self, section: &str, text: &str, fence: &mut Option<char>) -> Vec<Evidence> {
        let mut out = vec![];
        let mut seen = HashSet::new();
        for (line, raw) in text.lines().enumerate() {
            let trimmed = raw.trim_start();
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                let marker = trimmed.chars().next().unwrap();
                if *fence == Some(marker) {
                    *fence = None;
                } else if fence.is_none() {
                    *fence = Some(marker);
                }
                continue;
            }
            if fence.is_some() {
                continue;
            }
            // Bound each unit. Long lines remain processable through sentence splitting.
            for sentence in raw.split_inclusive(['.', '!', '?']) {
                let quote = sentence.trim();
                if quote.is_empty() || quote.chars().count() > 4000 {
                    continue;
                }
                let folded = Folded::new(quote);
                let mentions = self.mentions(&folded.text);
                let owners: BTreeSet<_> = mentions.iter().filter_map(|m| m.owner).collect();
                let uncertain = UNCERTAIN.is_match(&folded.text)
                    || trimmed.starts_with('>')
                    || quote.contains(['«', '»', '“', '”', '"', '?']);
                for &owner in &owners {
                    let source = &self.sources[owner];
                    let mut facts = vec![];
                    if !uncertain {
                        if let Some(m) = mentions.iter().find(|m| {
                            m.owner == Some(owner) && subject_prefix(&folded.text[..m.start])
                        }) {
                            facts = self.facts(source, &folded, m.end);
                        }
                    }
                    let related = owners
                        .iter()
                        .filter(|&&i| i != owner)
                        .map(|&i| Related {
                            id: self.sources[i].id.clone(),
                            title: self.sources[i].title.clone(),
                        })
                        .collect();
                    let id = crate::project::hash(&format!("{section}\0{}\0{quote}", source.id));
                    if !seen.insert(id.clone()) {
                        continue;
                    }
                    out.push(Evidence {
                        id,
                        source: source.id.clone(),
                        fingerprint: source.fingerprint.clone(),
                        section: section.into(),
                        node: None,
                        line: line + 1,
                        quote: quote.into(),
                        uncertain,
                        facts,
                        related,
                    });
                }
            }
        }
        out
    }
    fn facts(&self, source: &Source, folded: &Folded<'_>, offset: usize) -> Vec<Fact> {
        let mut tail = &folded.text[offset..];
        if tail.starts_with(['|', '#']) {
            if let Some((_, rest)) = tail.split_once("]]") {
                tail = rest;
            }
        }
        let tail = tail.trim_start_matches(|c: char| {
            c.is_whitespace()
                || c == ']'
                || c == '*'
                || c == '—'
                || c == '–'
                || c == ':'
                || c == ','
        });
        let offset = folded.text.len() - tail.len();
        let Some(fields) = source.fields.as_object() else {
            return vec![];
        };
        // Explicit field notation also works for custom note types and custom schemas.
        for field in fields.keys().filter(|key| writable(key)) {
            let label = format!("{} :", normalize(field));
            let compact = format!("{}:", normalize(field));
            if let Some(value) = tail
                .strip_prefix(&label)
                .or_else(|| tail.strip_prefix(&compact))
            {
                let start = folded.text.len() - value.len();
                if let Some(fact) =
                    self.fact(field, folded.original_range(start, folded.text.len()))
                {
                    return vec![fact];
                }
            }
        }
        let mut facts = vec![];
        for (field, rule) in RULES.iter() {
            let Some(key) = fields.keys().find(|key| normalize(key) == *field) else {
                continue;
            };
            let Some(capture) = rule.captures(tail).and_then(|m| m.get(1)) else {
                continue;
            };
            let raw = folded.original_range(offset + capture.start(), offset + capture.end());
            if let Some(fact) = self.fact(key, raw) {
                facts.push(fact);
            }
        }
        facts
    }
    fn fact(&self, field: &str, raw: &str) -> Option<Fact> {
        let value = raw.trim().trim_end_matches(['.', '!', ';']).trim();
        if value.is_empty()
            || value.chars().count() > 240
            || value.contains(';')
            || CLAUSE.is_match(&normalize(value))
        {
            return None;
        }
        let normalized = normalize(value.trim_start_matches("[[").trim_end_matches("]]"));
        let mentions = self.mentions(&normalized);
        let target = mentions
            .iter()
            .find(|m| m.start == 0 && m.end == normalized.len())
            .and_then(|m| m.owner)
            .map(|i| self.sources[i].id.clone());
        Some(Fact {
            field: field.into(),
            value: value.into(),
            target,
        })
    }
}
fn writable(key: &str) -> bool {
    ![
        "type",
        "nom",
        "title",
        "titre",
        "alias",
        "aliases",
        "tags",
        "sources",
        "fiabilite",
        "fictif",
        "prenom",
    ]
    .contains(&normalize(key).as_str())
}
fn subject_prefix(prefix: &str) -> bool {
    matches!(
        prefix.trim_start_matches(|c: char| c.is_whitespace() || "#-*[[".contains(c)),
        "" | "le " | "la " | "les " | "l'" | "l’"
    )
}
static WIKI: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]").unwrap());
static CLAUSE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:mais|puis|tandis|alors|car|lorsque|quand|ou|et)\b").unwrap()
});
static UNCERTAIN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?x)\b(?:selon|peut[- ]etre|probablement|possiblement|suppose|supposee|hypothese|legende|mythe|rumeur|pretend|pretendument|semble|semblerait|serait|seraient|aurait|auraient|pourrait|pourraient|devrait|supposition|controverse|incertain|faux|fausse|pas|jamais|aucun|aucune|sans|si)\b|n['’]|dit[- ]on").unwrap()
});
static RULES: LazyLock<Vec<(&'static str, Regex)>> = LazyLock::new(|| {
    let date = r"(?:[0-3]?\d(?:er)?\s+(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{3,4}|\d{4}-\d{2}-\d{2}|\d{3,4})";
    let entries = vec![
        ("date de naissance", format!(r"^(?:(?:est|etait)\s+)?ne(?:e)?\s+(?:le|en)\s+({date})(?:[.,;]|\s|$)")),
        ("date de deces", format!(r"^(?:(?:est|etait)\s+)?(?:mort(?:e)?|decede(?:e)?)\s+(?:le|en)\s+({date})(?:[.,;]|\s|$)")),
        ("date de publication", format!(r"^(?:(?:est|a ete|fut)\s+)?publi(?:e|ee)\s+(?:le|en)\s+({date})(?:[.,;]|\s|$)")),
        ("date de fondation", format!(r"^(?:(?:est|a ete|fut)\s+)?fond(?:e|ee)\s+(?:le|en)\s+({date})(?:[.,;]|\s|$)")),
        ("date d'apparition", format!(r"^(?:apparait|est apparu|est apparue)\s+(?:le|en)\s+({date})(?:[.,;]|\s|$)")),
        ("date", format!(r"^(?:a lieu|se deroule|s'est deroule|s’est deroule)\s+(?:le|en)\s+({date})(?:[.,;]|\s|$)")),
        ("auteur", r"^(?:a pour auteur|est ecrit par|est ecrite par|a ete ecrit par|a ete ecrite par)\s+(.+?)\.?$".into()),
        ("fondateur", r"^(?:a pour fondateur|est fonde par|est fondee par|a ete fonde par|a ete fondee par)\s+(.+?)\.?$".into()),
        ("pays", r"^(?:a pour pays|se situe dans le pays|est situe dans le pays|est situee dans le pays)\s+(.+?)\.?$".into()),
        ("capitale", r"^a pour capitale\s+(.+?)\.?$".into()),
        ("lieu de naissance", format!(r"^(?:est )?ne(?:e)? (?:le {date} )?a\s+(.+?)\.?$")),
        ("lieu de deces", format!(r"^(?:est )?(?:mort(?:e)?|decede(?:e)?) (?:le {date} )?a\s+(.+?)\.?$")),
        ("editeur", r"^(?:a pour editeur|est publie chez|est publiee chez)\s+(.+?)\.?$".into()),
        ("religion", r"^a pour religion\s+(.+?)\.?$".into()),
        ("nature", r"^a pour nature\s+(.+?)\.?$".into()),
        ("description", r"^est\s+((?:un|une)\s+.+?)\.?$".into()),
    ];
    entries
        .into_iter()
        .map(|(field, pattern)| (field, Regex::new(&pattern).unwrap()))
        .collect()
});
