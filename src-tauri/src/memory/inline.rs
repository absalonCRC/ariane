use super::*;
use crate::{enrichment::extract::Catalog, model::Source, vaults};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    from: usize,
    to: usize,
    title: String,
    kind: String,
    source_id: Option<String>,
    entity_id: Option<String>,
}
#[derive(Serialize)]
pub struct InlineEntities {
    text: String,
    mentions: Vec<Mention>,
}
fn sources_generation(root: &Path, index: &Path) -> Result<(Vec<Source>,String)> {
    let snapshot = crate::retrieval::cache::snapshot(root,index,false)?;
    Ok((snapshot.sources.all.iter().filter(|s|s.path.to_lowercase().ends_with(".md")).cloned().collect(),snapshot.sources.token.clone()))
}
#[cfg(test)]
fn sources(root: &Path,index: &Path) -> Result<Vec<Source>> { Ok(sources_generation(root,index)?.0) }
fn matches_name(source: &Source, name: &str) -> bool {
    let normalized = vaults::parse::normalize(name);
    std::iter::once(source.title.as_str())
        .chain(source.aliases.iter().map(String::as_str))
        .chain(
            std::path::Path::new(&source.path)
                .file_stem()
                .and_then(|s| s.to_str()),
        )
        .any(|n| vaults::parse::normalize(n) == normalized)
}
fn prose_range(text: &str, start: usize, end: usize) -> bool {
    static NON_PROSE: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"`[^`]*`|<[^>]*>|\]\([^)]*\)").unwrap());
    !NON_PROSE
        .find_iter(text)
        .any(|m| start < m.end() && end > m.start())
}
fn collect(
    root: &Path,
    section: &str,
    revision: i64,
    index: &Path,
    sources: &[Source],
    generation: &str,
) -> Result<InlineEntities> {
    let c = storage::database(root)?;
    let section = project::section(&c, section)?
        .filter(|s| s.revision == revision)
        .ok_or("Le passage a changé. Attendez sa prochaine analyse.")?;
    let mut catalog = None;
    results::reconcile(root, index)?;
    let mut mentions = Vec::new();
    // Use the same code-fence exclusion and durable passage boundaries as NER.
    for passage in section_passages(&section)? {
        let offset = passage
            .node
            .as_ref()
            .and_then(|id| section.outline.as_ref()?.nodes.iter().find(|n| &n.id == id))
            .map_or(0, |n| n.start);
        let key = format!("inline:{}", passage.key);
        let ner: Option<String> = c.query_row("SELECT hash || model FROM memory_ner WHERE passage_key=?",[&passage.key],|r|r.get(0)).optional().app()?;
        let mentions_hash: Option<String> = c.query_row("SELECT group_concat(id || ':' || kind || ':' || start || ':' || end) FROM (SELECT e.id,e.kind,m.start,m.end FROM memory_mentions m JOIN memory_entities e ON e.id=m.entity_id WHERE m.passage_key=? ORDER BY e.id,m.start)",[&passage.key],|r|r.get(0)).app()?;
        let hash = storage::fingerprint(&format!("{}:{ner:?}:{mentions_hash:?}",passage.hash));
        if let Some(value) = results::get(root,&key,&hash)? {
            let saved: Vec<Mention> = serde_json::from_value(value).app()?;
            mentions.extend(saved.into_iter().map(|mut m| { m.from += offset; m.to += offset; m }));
            continue;
        }
        let first = mentions.len();
        if catalog.is_none() { catalog = Some(Catalog::new(sources)?); }
        for (start, end, owner) in catalog.as_ref().unwrap().inline_mentions(&passage.text) {
            if !prose_range(&passage.text, start, end) {
                continue;
            }
            let source = &sources[owner];
            mentions.push(Mention {
                from: offset + passage.text[..start].encode_utf16().count(),
                to: offset + passage.text[..end].encode_utf16().count(),
                title: source.title.clone(),
                kind: source.kind.clone(),
                source_id: Some(source.id.clone()),
                entity_id: None,
            });
        }
        let mut q = c.prepare("SELECT e.id,e.title,e.kind,m.start,m.end FROM memory_mentions m JOIN memory_entities e ON e.id=m.entity_id JOIN memory_passages p ON p.key=m.passage_key WHERE m.passage_key=? AND p.hash=?").app()?;
        let rows = q
            .query_map(params![passage.key, passage.hash], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, usize>(3)?,
                    r.get::<_, usize>(4)?,
                ))
            })
            .app()?;
        for row in rows {
            let (id, title, kind, start, end) = row.app()?;
            if passage.text.get(start..end) != Some(title.as_str())
                || !prose_range(&passage.text, start, end)
            {
                continue;
            }
            let from = offset + passage.text[..start].encode_utf16().count();
            let to = offset + passage.text[..end].encode_utf16().count();
            // Ambiguous catalog aliases must not become duplicate creation proposals.
            if sources.iter().any(|s| matches_name(s, &title))
                || mentions.iter().any(|m| from < m.to && to > m.from)
            {
                continue;
            }
            mentions.push(Mention {
                from,
                to,
                title,
                kind,
                source_id: None,
                entity_id: Some(id),
            });
        }
        let relative: Vec<_> = mentions[first..].iter().cloned().map(|mut m| { m.from -= offset; m.to -= offset; m }).collect();
        results::put_if_current(root,index,&key,&hash,&passage.text,&serde_json::to_value(relative).app()?,generation)?;
    }
    if results::catalog(root,index)? != generation { return Err("Les sources ont changé. Relancez la recherche.".into()); }
    mentions.sort_by_key(|m| (m.from, std::cmp::Reverse(m.to)));
    Ok(InlineEntities {
        text: section.text,
        mentions,
    })
}
pub fn inline_entities(
    root: &Path,
    index: &Path,
    section: &str,
    revision: i64,
) -> Result<InlineEntities> {
    sync_preferred(root, Some(section))?;
    let (sources,generation) = sources_generation(root,index)?;
    collect(root, section, revision, index, &sources, &generation)
}
pub fn create_detected_entity(
    root: &Path,
    index: &Path,
    section: &str,
    revision: i64,
    from: usize,
    to: usize,
    kind: &str,
) -> Result<Source> {
    sync_preferred(root, Some(section))?;
    let (sources,generation) = sources_generation(root, index)?;
    let result = collect(root, section, revision, index, &sources, &generation)?;
    let candidate = result
        .mentions
        .iter()
        .find(|m| m.from == from && m.to == to)
        .ok_or("Cette entité n’est plus proposée. Relancez son analyse.")?;
    if let Some(id) = &candidate.source_id {
        return sources
            .iter()
            .find(|s| &s.id == id)
            .cloned()
            .ok_or("Fiche introuvable.".into());
    }
    if kind != candidate.kind {
        return Err("Le type de cette entité a changé.".into());
    }
    if let Some(kind) = candidate.kind.strip_prefix("custom:") {
        if !vaults::classification_types(root, index)?
            .iter()
            .any(|t| t.name == kind)
        {
            return Err("Type d’entité désactivé.".into());
        }
        let note = vaults::create_quick_note(root, index, &candidate.title)?;
        return Ok(vaults::apply_note_type(root, index, &note, kind)?.unwrap_or(note));
    }
    let category = match candidate.kind.as_str() {
        "person" => "personne",
        "place" => "lieu",
        "organization" => "organisation",
        "work" => "oeuvre",
        "event" => "evenement",
        _ => return Err("Type de fiche inconnu.".into()),
    };
    let start = utf16_byte(&result.text, from)?;
    let end = utf16_byte(&result.text, to)?;
    let quote = temporal::sentence(&result.text, start, end);
    let quote_start = result.text[..start]
        .rfind(['.', '!', '?', '\n'])
        .map_or(0, |p| p + 1);
    let quote_end = end
        + result.text[end..]
            .find(['.', '!', '?', '\n'])
            .unwrap_or(result.text.len() - end);
    let mut related = Vec::new();
    for mention in &result.mentions {
        let a = utf16_byte(&result.text, mention.from)?;
        if a < quote_start || a >= quote_end {
            continue;
        }
        if let Some(source) = mention
            .source_id
            .as_ref()
            .and_then(|id| sources.iter().find(|s| &s.id == id))
        {
            // A qualified path avoids homonymous filenames; labels are literal Markdown.
            let target = source.path.trim_end_matches(".md");
            if !target.contains(['[', ']', '|', '\n', '\r'])
                && !source.title.contains(['[', ']', '|', '\n', '\r'])
            {
                let link = format!("[[{target}|{}]]", source.title);
                if !related.contains(&link) {
                    related.push(link);
                }
            }
        }
    }
    let description = format!(
        "Passage du manuscrit :\n\n> {}{}",
        quote.trim().replace('\n', "\n> "),
        if related.is_empty() {
            String::new()
        } else {
            format!(
                "\n\nMentionnés dans le même passage : {}",
                related.join(", ")
            )
        }
    );
    let available = vaults::list(root, index)?;
    if !available.iter().any(|v| v.owned && v.available) {
        vaults::create_owned(root)?;
    }
    let path = vaults::create_entity(root, category, &candidate.title, &description)?;
    vaults::index_created_entity(root, index, &path)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup(text: &str) -> (tempfile::TempDir, std::path::PathBuf, String, i64) {
        let temp = tempfile::tempdir().unwrap();
        vaults::create_project(temp.path(), "Test", None).unwrap();
        let section = project::load(temp.path())
            .unwrap()
            .sections
            .into_iter()
            .find(|s| s.kind == "scene")
            .unwrap();
        let c = project::database(temp.path()).unwrap();
        c.execute(
            "UPDATE sections SET text=?,mirror=?,revision=revision+1 WHERE id=?",
            params![text, project::hash(text), section.id],
        )
        .unwrap();
        let revision = section.revision + 1;
        let index = temp.path().join("sources.sqlite");
        (temp, index, section.id, revision)
    }
    #[test]
    fn detects_unicode_aliases_and_creates_a_linked_fiche_without_duplicates() {
        let text = "😀 Claude Nougaro est né à la Ville rose.";
        let (temp, index, section, revision) = setup(text);
        let path = vaults::create_entity(temp.path(), "lieu", "Toulouse", "").unwrap();
        let content = std::fs::read_to_string(&path)
            .unwrap()
            .replace("Alias: []", "Alias: [Ville rose]");
        std::fs::write(&path, content).unwrap();
        let toulouse = vaults::index_created_entity(temp.path(), &index, &path).unwrap();
        let detected = inline_entities(temp.path(), &index, &section, revision).unwrap();
        assert_eq!(detected.mentions.len(), 2);
        let person = &detected.mentions[0];
        assert_eq!((person.from, person.to), (3, 17));
        assert!(person.source_id.is_none());
        assert_eq!(
            detected.mentions[1].source_id.as_deref(),
            Some(toulouse.id.as_str())
        );
        let created = create_detected_entity(
            temp.path(),
            &index,
            &section,
            revision,
            person.from,
            person.to,
            "person",
        )
        .unwrap();
        assert!(created.text.contains("[[Lieux/Toulouse|Toulouse]]"));
        assert!(created.text.contains(text));
        let again = create_detected_entity(
            temp.path(),
            &index,
            &section,
            revision,
            person.from,
            person.to,
            "person",
        )
        .unwrap();
        assert_eq!(created.id, again.id);
        assert_eq!(sources(temp.path(), &index).unwrap().len(), 2);
        assert_eq!(
            project::section(&project::database(temp.path()).unwrap(), &section)
                .unwrap()
                .unwrap()
                .text,
            text
        );
        assert!(inline_entities(temp.path(), &index, &section, revision + 1).is_err());
    }
    #[test]
    fn ambiguous_aliases_and_code_are_not_creation_proposals() {
        let (temp, index, section, revision) = setup("Claude Nougaro est né à Toulouse.");
        for title in ["Premier", "Second"] {
            let path = vaults::create_entity(temp.path(), "personne", title, "").unwrap();
            let raw = std::fs::read_to_string(&path)
                .unwrap()
                .replace("Alias: []", "Alias: [Claude Nougaro]");
            std::fs::write(&path, raw).unwrap();
            vaults::index_created_entity(temp.path(), &index, &path).unwrap();
        }
        assert!(inline_entities(temp.path(), &index, &section, revision)
            .unwrap()
            .mentions
            .is_empty());
        assert!(
            create_detected_entity(temp.path(), &index, &section, revision, 0, 14, "person")
                .is_err()
        );
        let (temp, index, section, revision) = setup("`Claude Nougaro est né à Toulouse.`");
        assert!(inline_entities(temp.path(), &index, &section, revision)
            .unwrap()
            .mentions
            .is_empty());
        let (temp, index, section, revision) = setup("```\nClaude Nougaro est né à Toulouse.\n```");
        assert!(inline_entities(temp.path(), &index, &section, revision)
            .unwrap()
            .mentions
            .is_empty());
    }
    #[test]
    fn new_card_keeps_external_vault_unchanged_and_enriches_birthplace() {
        let (temp, index, section, revision) = setup("Claude Nougaro est né à Toulouse.");
        let external = tempfile::tempdir().unwrap();
        let raw = "---\ntype: lieu\nNom: Toulouse\n---\nVille.";
        let file = external.path().join("Toulouse.md");
        std::fs::write(&file, raw).unwrap();
        vaults::connect(temp.path(), external.path()).unwrap();
        vaults::index(
            temp.path(),
            &index,
            &temp.path().join("no-model"),
            &Default::default(),
            &Default::default(),
            |_| {},
        )
        .unwrap();
        let mut source =
            create_detected_entity(temp.path(), &index, &section, revision, 0, 14, "person")
                .unwrap();
        crate::enrichment::run(temp.path(), &index).unwrap();
        crate::enrichment::decorate(temp.path(), &index, std::slice::from_mut(&mut source))
            .unwrap();
        assert_eq!(source.fields["Lieu de naissance"], "Toulouse");
        assert_eq!(std::fs::read_to_string(file).unwrap(), raw);
    }
}
