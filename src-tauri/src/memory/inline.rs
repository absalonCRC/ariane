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
    #[serde(default)]
    candidates: Vec<EntityCandidate>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct EntityCandidate { id: String, title: String, kind: String }
fn candidates(sources: &[Source], title: &str) -> Vec<EntityCandidate> {
    sources.iter().filter(|s| matches_name(s, title) ||
        std::iter::once(&s.title).chain(s.aliases.iter()).any(|name| {
            let a = vaults::parse::normalize(name);
            let b = vaults::parse::normalize(title);
            if a.chars().count() < 5 || b.chars().count() < 5 { return false; }
            let mut row: Vec<usize> = (0..=b.chars().count()).collect();
            for (i,x) in a.chars().enumerate() {
                let mut diagonal = row[0]; row[0] = i+1;
                for (j,y) in b.chars().enumerate() {
                    let before = row[j+1];
                    row[j+1] = (row[j]+1).min(before+1).min(diagonal+usize::from(x!=y));
                    diagonal = before;
                }
            }
            row[b.chars().count()] <= 1
        })
    ).map(|s| EntityCandidate { id:s.id.clone(),title:s.title.clone(),kind:s.kind.clone() }).collect()
}
#[derive(Serialize)]
pub struct InlineEntities {
    created: bool,
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
        let resolutions: Option<String> = c.query_row("SELECT group_concat(key || value) FROM meta WHERE key LIKE 'entity_resolution:%'",[],|r|r.get(0)).app()?;
        let hash = storage::fingerprint(&format!("{}:{ner:?}:{mentions_hash:?}:{resolutions:?}",passage.hash));
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
            let (title, kind, source_id, choices) = if let Some(owner) = owner {
                let source=&sources[owner];
                (source.title.clone(),source.kind.clone(),Some(source.id.clone()),vec![])
            } else {
                let title=passage.text[start..end].to_owned();
                let key=format!("entity_resolution:{}:{}:{}",section.id,passage.node.as_deref().unwrap_or(""),vaults::parse::normalize(&title));
                let resolved:Option<String>=c.query_row("SELECT value FROM meta WHERE key=?",[key],|r|r.get(0)).optional().app()?;
                let resolved=resolved.filter(|id|sources.iter().any(|s|&s.id==id));
                let choices=candidates(sources,&title);
                let kind=choices.first().map(|s| match vaults::parse::normalize(&s.kind).as_str() {
                    "personne"|"person" => "person".into(), "lieu"|"place"=>"place".into(),
                    "organisation"|"organization"=>"organization".into(),"oeuvre"|"œuvre"|"work"=>"work".into(),
                    "evenement"|"event"=>"event".into(),_=>format!("custom:{}",s.kind),
                }).unwrap_or_else(||"person".into());
                let kind=resolved.as_ref().and_then(|id|sources.iter().find(|s|&s.id==id)).map_or(kind,|s|s.kind.clone());
                (title,kind,resolved,choices)
            };
            mentions.push(Mention {
                from: offset + passage.text[..start].encode_utf16().count(),
                to: offset + passage.text[..end].encode_utf16().count(),
                title,kind,source_id,entity_id:None,candidates:choices,
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
            if mentions.iter().any(|m| from < m.to && to > m.from)
            {
                continue;
            }
            let key = format!("entity_resolution:{}:{}:{}", section.id, passage.node.as_deref().unwrap_or(""), vaults::parse::normalize(&title));
            let resolved: Option<String> = c.query_row("SELECT value FROM meta WHERE key=?",[&key],|r|r.get(0)).optional().app()?;
            let resolved = resolved.filter(|id| sources.iter().any(|s| &s.id == id));
            let choices = if resolved.is_some() { vec![] } else { candidates(sources, &title) };
            let kind=resolved.as_ref().and_then(|id|sources.iter().find(|s|&s.id==id)).map_or(kind,|s|s.kind.clone());
            mentions.push(Mention { from, to, title, kind, source_id: resolved, entity_id: Some(id), candidates: choices });
        }
        let relative: Vec<_> = mentions[first..].iter().cloned().map(|mut m| { m.from -= offset; m.to -= offset; m }).collect();
        results::put_if_current(root,index,&key,&hash,&passage.text,&serde_json::to_value(relative).app()?,generation)?;
    }
    if results::catalog(root,index)? != generation { return Err("Les sources ont changé. Relancez la recherche.".into()); }
    mentions.sort_by_key(|m| (m.from, std::cmp::Reverse(m.to)));
    Ok(InlineEntities {
        created: false,
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
pub fn resolve_inline_entities(root: &Path,index: &Path,section: &str,revision:i64) -> Result<InlineEntities> {
    let result = inline_entities(root,index,section,revision)?;
    let mut created = false;
    for mention in &result.mentions {
        let settings: String = storage::database(root)?.query_row("SELECT value FROM meta WHERE key='settings'",[],|r|r.get(0)).app()?;
        if serde_json::from_str::<serde_json::Value>(&settings).app()?["enrichment"].as_bool()==Some(false) { break; }
        if mention.source_id.is_none() && mention.candidates.is_empty() {
            create_detected_entity(root,index,section,revision,mention.from,mention.to,&mention.kind)?;
            created = true;
        }
    }
    if created {
        crate::enrichment::run(root,index)?;
        let mut result=inline_entities(root,index,section,revision)?;
        result.created=true; Ok(result)
    } else { Ok(result) }
}
fn remember_resolution(root:&Path,section:&str,from:usize,title:&str,source:&str) -> Result<()> {
    let c=storage::database(root)?;
    let current=project::section(&c,section)?.ok_or("Section introuvable.")?;
    let node=current.outline.as_ref().and_then(|o|o.nodes.iter().rev().find(|n|n.start<=from)).map(|n|n.id.as_str()).unwrap_or("");
    c.execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)",params![format!("entity_resolution:{section}:{node}:{}",vaults::parse::normalize(title)),source]).app()?;
    Ok(())
}
pub fn resolve_detected_entity(root: &Path,index: &Path,section:&str,revision:i64,from:usize,to:usize,source:&str) -> Result<Source> {
    let result=inline_entities(root,index,section,revision)?;
    let mention=result.mentions.iter().find(|m|m.from==from && m.to==to).ok_or("Cette mention a changé.")?;
    if !mention.candidates.iter().any(|c|c.id==source) { return Err("Cette fiche ne correspond plus aux choix proposés.".into()); }
    remember_resolution(root,section,from,&mention.title,source)?;
    vaults::source(index,source,&vaults::list(root,index)?)
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
    // An exact unique alias is an existing identity, never a new file.
    let exact: Vec<_> = sources.iter().filter(|s| matches_name(s, &candidate.title)).collect();
    if exact.len() == 1 { return Ok(exact[0].clone()); }
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
        let note = if exact.len()>1 {
            if !vaults::list(root,index)?.iter().any(|v|v.owned && v.available) { vaults::create_owned(root)?; }
            let path=vaults::create_entity(root,"note",&candidate.title,"")?;
            vaults::index_created_entity(root,index,&path)?
        } else { vaults::create_quick_note(root, index, &candidate.title)? };
        let source=vaults::apply_note_type(root, index, &note, kind)?.unwrap_or(note);
        if !candidate.candidates.is_empty() { remember_resolution(root,section,from,&candidate.title,&source.id)?; }
        return Ok(source);
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
    let source=vaults::index_created_entity(root, index, &path)?;
    if !candidate.candidates.is_empty() {
        remember_resolution(root,section,from,&candidate.title,&source.id)?;
    }
    Ok(source)
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
        let ambiguous = resolve_inline_entities(temp.path(), &index, &section, revision).unwrap();
        assert_eq!(ambiguous.mentions.len(), 1);
        assert_eq!(ambiguous.mentions[0].candidates.len(), 2);
        assert_eq!(sources(temp.path(), &index).unwrap().len(), 2);
        let chosen = ambiguous.mentions[0].candidates[0].id.clone();
        resolve_detected_entity(temp.path(), &index, &section, revision, 0, 14, &chosen).unwrap();
        assert_eq!(inline_entities(temp.path(), &index, &section, revision).unwrap().mentions[0].source_id.as_deref(), Some(chosen.as_str()));

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
    fn explicit_distinct_creation_resolves_a_shared_alias_without_automatic_duplicates() {
        let (temp,index,section,revision)=setup("Claude Nougaro est né à Toulouse.");
        for title in ["Premier","Second"] {
            let path=vaults::create_entity(temp.path(),"personne",title,"").unwrap();
            let source=vaults::index_created_entity(temp.path(),&index,&path).unwrap();
            vaults::update_aliases(temp.path(),&index,&source.id,&source.fingerprint,&["Claude Nougaro".into()]).unwrap();
        }
        let pending=resolve_inline_entities(temp.path(),&index,&section,revision).unwrap();
        assert!(!pending.created);
        assert_eq!(sources(temp.path(),&index).unwrap().len(),2);
        let created=create_detected_entity(temp.path(),&index,&section,revision,0,14,"person").unwrap();
        let result=resolve_inline_entities(temp.path(),&index,&section,revision).unwrap();
        assert_eq!(result.mentions[0].source_id.as_deref(),Some(created.id.as_str()));
        assert_eq!(sources(temp.path(),&index).unwrap().len(),3);
    }
    #[test]
    fn a_shared_catalog_alias_is_ambiguous_even_without_a_ner_result() {
        let (temp,index,section,revision)=setup("AZZ.");
        for title in ["Premier","Second"] {
            let path=vaults::create_entity(temp.path(),"personne",title,"").unwrap();
            let source=vaults::index_created_entity(temp.path(),&index,&path).unwrap();
            vaults::update_aliases(temp.path(),&index,&source.id,&source.fingerprint,&["AZZ".into()]).unwrap();
        }
        let result=resolve_inline_entities(temp.path(),&index,&section,revision).unwrap();
        assert_eq!(result.mentions.len(),1);
        assert!(result.mentions[0].entity_id.is_none());
        assert_eq!(result.mentions[0].candidates.len(),2);
        assert!(!result.created);
    }
    #[test]
    fn disabled_enrichment_does_not_create_files() {
        let (temp,index,section,revision)=setup("Claude Nougaro est né à Toulouse.");
        project::settings(temp.path(),serde_json::json!({"enrichment":false})).unwrap();
        let result=resolve_inline_entities(temp.path(),&index,&section,revision).unwrap();
        assert!(!result.created);
        assert!(sources(temp.path(),&index).unwrap().is_empty());
    }
    #[test]
    fn automatically_creates_once_and_reuses_person_and_place_aliases() {
        let (temp,index,section,revision)=setup("Claude Nougaro est né à Toulouse.");
        let first=resolve_inline_entities(temp.path(),&index,&section,revision).unwrap();
        assert!(first.created);
        assert!(first.mentions.iter().all(|m| m.source_id.is_some()));
        let count=sources(temp.path(),&index).unwrap().len();
        resolve_inline_entities(temp.path(),&index,&section,revision).unwrap();
        assert_eq!(sources(temp.path(),&index).unwrap().len(),count);
        for (kind,title,aliases) in [
            ("personne","Axel de Saint-Germain",vec!["Rosen Kreuz","Cult of Rosen","Axel Palombo"]),
            ("lieu","Toulouse",vec!["Tolosa","Ville rose"]),
        ] {
            let source = sources(temp.path(),&index).unwrap().into_iter().find(|s|s.title==title).unwrap_or_else(|| {
                let path=vaults::create_entity(temp.path(),kind,title,"").unwrap();
                vaults::index_created_entity(temp.path(),&index,&path).unwrap()
            });
            let updated=vaults::update_aliases(temp.path(),&index,&source.id,&source.fingerprint,&aliases.iter().map(|s|s.to_string()).collect::<Vec<_>>()).unwrap();
            let text=aliases.join(" rencontre ");
            let c=project::database(temp.path()).unwrap();
            c.execute("UPDATE sections SET text=?,revision=revision+1 WHERE id=?",params![text,section]).unwrap();
            let current=project::section(&c,&section).unwrap().unwrap();
            let detected=resolve_inline_entities(temp.path(),&index,&section,current.revision).unwrap();
            assert_eq!(detected.mentions.len(),aliases.len());
            assert!(detected.mentions.iter().all(|m|m.source_id.as_deref()==Some(updated.id.as_str())));
        }
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
