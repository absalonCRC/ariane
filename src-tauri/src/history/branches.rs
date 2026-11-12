use super::{insert, snapshot, unpack, Snapshot};
use crate::{
    error::{AppResult, Result},
    model::{Project, Section, Version},
    project,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    path::Path,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub id: String,
    pub name: String,
    pub created: String,
    pub is_main: bool,
    pub base_version: Option<String>,
    pub head_version: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryState {
    pub active_branch: String,
    pub branches: Vec<Branch>,
}
#[derive(Serialize)]
pub struct MergeEntry {
    pub id: String,
    pub title: String,
    pub base: Option<Section>,
    pub current: Option<Section>,
    pub incoming: Option<Section>,
    pub result: Option<Section>,
    pub changed: bool,
    pub conflict: bool,
    pub fields: Vec<String>,
}
#[derive(Serialize)]
pub struct AuxiliaryConflict {
    pub id: String,
    pub label: String,
    pub current: String,
    pub incoming: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePreview {
    pub source: Branch,
    pub target: Branch,
    pub token: String,
    pub entries: Vec<MergeEntry>,
    pub auxiliary_conflicts: Vec<AuxiliaryConflict>,
    pub auxiliary_changes: usize,
}
#[derive(Clone, Deserialize)]
pub struct MergeResolution {
    pub id: String,
    pub choice: String,
    pub text: Option<String>,
}

pub(crate) fn active(c: &Connection) -> Result<String> {
    c.query_row(
        "SELECT value FROM meta WHERE key='active_branch'",
        [],
        |r| r.get(0),
    )
    .app()
}

/// Versions from the current branch and its recorded ancestors are valid restore targets.
pub(super) fn can_restore(c: &Connection, version: &Version) -> Result<bool> {
    let branch = active(c)?;
    if version.branch_id.as_deref().unwrap_or("main") == branch {
        return Ok(true);
    }
    c.query_row(
        "WITH RECURSIVE lineage(id) AS (
            SELECT head_version FROM history_branches WHERE id=?1 AND head_version IS NOT NULL
            UNION SELECT base_version FROM history_branches WHERE id=?1 AND base_version IS NOT NULL
            UNION SELECT v.parent_id FROM versions v JOIN lineage l ON v.id=l.id WHERE v.parent_id IS NOT NULL
            UNION SELECT v.merge_parent_id FROM versions v JOIN lineage l ON v.id=l.id WHERE v.merge_parent_id IS NOT NULL
        ) SELECT EXISTS(SELECT 1 FROM lineage WHERE id=?2)",
        params![branch, version.id],
        |r| r.get(0),
    ).app()
}

/// The pending Markdown writes were created by this operation, not by a crash.
pub(super) fn load_applied(root: &Path) -> Result<Project> {
    let mut project = project::load(root)?;
    if project.conflicts.is_empty() {
        project.recovered = false;
    }
    Ok(project)
}
fn branch(c: &Connection, id: &str) -> Result<Branch> {
    c.query_row(
        "SELECT id,name,created,is_main,base_version,head_version FROM history_branches WHERE id=?",
        [id],
        |r| {
            Ok(Branch {
                id: r.get(0)?,
                name: r.get(1)?,
                created: r.get(2)?,
                is_main: r.get(3)?,
                base_version: r.get(4)?,
                head_version: r.get(5)?,
            })
        },
    )
    .app()
}
pub fn history_state(root: &Path) -> Result<HistoryState> {
    let c = project::database(root)?;
    let mut q = c
        .prepare("SELECT id FROM history_branches ORDER BY is_main DESC,created,id")
        .app()?;
    let ids = q
        .query_map([], |r| r.get::<_, String>(0))
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?;
    Ok(HistoryState {
        active_branch: active(&c)?,
        branches: ids.iter().map(|id| branch(&c, id)).collect::<Result<_>>()?,
    })
}
fn ensure_clean(root: &Path) -> Result<()> {
    if let Some(id) = project::load(root)?.conflicts.first() {
        return Err(format!("EXTERNAL:{id}"));
    }
    Ok(())
}
fn draft(c: &Connection, id: &str) -> Result<Snapshot> {
    if active(c)? == id {
        return snapshot(c, &None);
    }
    let payload: String = c
        .query_row("SELECT draft FROM history_branches WHERE id=?", [id], |r| {
            r.get(0)
        })
        .app()?;
    unpack(&payload)
}
fn save_draft(c: &Connection) -> Result<()> {
    c.execute(
        "UPDATE history_branches SET draft=? WHERE id=?",
        params![
            serde_json::to_string(&snapshot(c, &None)?).app()?,
            active(c)?
        ],
    )
    .app()?;
    Ok(())
}
pub(super) fn validate(state: &Snapshot) -> Result<()> {
    let ids: HashSet<_> = state.sections.iter().map(|s| s.id.as_str()).collect();
    if ids.len() != state.sections.len() {
        return Err("Identifiants de sections en double.".into());
    }
    if let Some(catalog)=&state.entity_catalog {project::entities::validate(catalog)?;}
    for tag in &state.smart_tags { project::tags::validate_tag(tag, &state.smart_tags)?; }
    for s in &state.sections {
        project::tags::validate_ids(&s.tag_ids, &state.smart_tags)?;
        if let Some(o) = &s.outline { for n in &o.nodes { project::tags::validate_ids(&n.tag_ids, &state.smart_tags)?; } }
        project::validate_id(&s.id)?;
        if !["scene", "chapter", "folder"].contains(&s.kind.as_str()) {
            return Err("Type de section invalide.".into());
        }
        if let Some(o) = &s.outline {
            project::validate_outline(o, &s.text)?;
        }
        let mut seen = HashSet::new();
        let mut parent = s.parent.as_deref();
        seen.insert(s.id.as_str());
        while let Some(id) = parent {
            if !seen.insert(id) || !ids.contains(id) {
                return Err("Cette intégration crée une arborescence incompatible. Revoyez les déplacements et suppressions.".into());
            }
            parent = state
                .sections
                .iter()
                .find(|p| p.id == id)
                .and_then(|p| p.parent.as_deref());
        }
    }
    Ok(())
}
// All DB changes, outgoing draft and pending mirror bases share one transaction.
// load() finishes/retries the Markdown mirrors after commit, using their actual old contents.
pub(super) fn replace(c: &Connection, root: &Path, state: &Snapshot) -> Result<()> {
    validate(state)?;
    if let Some(catalog)=&state.entity_catalog { project::entities::write(c,catalog)?; }
    let old = project::all_sections(c)?;
    let previous_epoch:i64=c.query_row("SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM meta WHERE key='workspace_revision'),0)",[],|r|r.get(0)).app()?;
    let revision_floor = old
        .iter()
        .chain(&state.sections)
        .map(|s| s.revision)
        .max()
        .unwrap_or(0)
        .max(previous_epoch)
        + 1;
    c.execute(
        "INSERT OR REPLACE INTO meta VALUES('workspace_revision',?)",
        [revision_floor.to_string()],
    )
    .app()?;
    let dir = project::io::Dir::open(root)?;
    let mut bases = BTreeMap::new();
    for s in &state.sections {
        bases.insert(
            s.id.clone(),
            project::scene_disk(&dir, &s.id)?
                .map(|text| project::hash(&text))
                .unwrap_or_default(),
        );
    }
    c.execute_batch("DELETE FROM mirror_pending; DELETE FROM sections; DELETE FROM links; DELETE FROM citations; DELETE FROM structure_history;
CREATE TABLE IF NOT EXISTS margin_pins(section TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(section,source)); DELETE FROM margin_pins;").app()?;
    for s in &state.sections {
        let revision = revision_floor;
        c.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,synopsis,status,goal,mirror,outline,role,trashed,included,tag_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",params![s.id,s.parent,s.title,s.kind,s.position,s.text,revision,s.synopsis,s.status,s.goal,bases[&s.id],s.outline.as_ref().map(serde_json::to_string).transpose().app()?,s.role,s.trashed,s.included,serde_json::to_string(&s.tag_ids).app()?]).app()?;
        if s.kind == "scene" && !s.trashed {
            c.execute(
                "INSERT INTO mirror_pending(id,base) VALUES(?,?)",
                params![s.id, bases[&s.id]],
            )
            .app()?;
        }
    }
    c.execute(
        "INSERT OR REPLACE INTO meta VALUES('settings',?)",
        [state.settings.to_string()],
    )
    .app()?;
    c.execute("INSERT OR REPLACE INTO meta VALUES('smart_tags',?)",[serde_json::to_string(&state.smart_tags).app()?]).app()?;
    if let Some(annotations) = &state.annotations {
        c.execute_batch("CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY,payload TEXT NOT NULL); DELETE FROM annotations;").app()?;
        for (id, payload) in annotations {
            c.execute("INSERT INTO annotations VALUES(?,?)", params![id, payload])
                .app()?;
        }
    }
    for (id, payload) in &state.citations {
        c.execute("INSERT INTO citations VALUES(?,?)", params![id, payload])
            .app()?;
    }
    for (section, source, payload) in &state.links {
        if state.sections.iter().any(|s| s.id == *section) {
            c.execute(
                "INSERT INTO links VALUES(?,?,?)",
                params![section, source, payload],
            )
            .app()?;
        }
    }
    for (section, source) in &state.pins {
        if state.sections.iter().any(|s| s.id == *section) {
            c.execute(
                "INSERT INTO margin_pins VALUES(?,?)",
                params![section, source],
            )
            .app()?;
        }
    }
    Ok(())
}
pub fn create_branch(root: &Path, name: &str, from: Option<String>) -> Result<Project> {
    project::with_lock(root, || {
        ensure_clean(root)?;
        if name.trim().is_empty() {
            return Err("Nommez cette variante.".into());
        }
        let mut c = project::database(root)?;
        let exists: bool = c
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM history_branches WHERE lower(name)=lower(?))",
                [name.trim()],
                |r| r.get(0),
            )
            .app()?;
        if exists {
            return Err("Une variante porte déjà ce nom.".into());
        }
        let tx = c.transaction().app()?;
        let state = if let Some(id) = &from {
            let scope: Option<String> = tx
                .query_row("SELECT scope FROM versions WHERE id=?", [id], |r| r.get(0))
                .app()?;
            if scope.is_some() {
                return Err(
                    "Choisissez une version de tout le projet pour créer une variante.".into(),
                );
            }
            let payload: String = tx
                .query_row("SELECT payload FROM versions WHERE id=?", [id], |r| {
                    r.get(0)
                })
                .app()?;
            unpack(&payload)?
        } else {
            snapshot(&tx, &None)?
        };
        validate(&state)?;
        let origin_branch = if let Some(id) = &from {
            tx.query_row(
                "SELECT COALESCE(branch_id,'main') FROM versions WHERE id=?",
                [id],
                |r| r.get::<_, String>(0),
            )
            .app()?
        } else {
            active(&tx)?
        };
        let merge_base = if origin_branch == "main" {
            serde_json::to_string(&state).app()?
        } else {
            tx.query_row(
                "SELECT base_payload FROM history_branches WHERE id=?",
                [origin_branch],
                |r| r.get::<_, String>(0),
            )
            .app()?
        };
        save_draft(&tx)?;
        // This named origin is an explicit consequence of creating a variant, and cannot be pruned.
        let base = insert(&tx, "Origine de la variante", None, state.clone())?;
        let id = uuid::Uuid::new_v4().to_string();
        let payload = serde_json::to_string(&state).app()?;
        tx.execute(
            "INSERT INTO history_branches VALUES(?,?,?,0,?,?,?,?)",
            params![
                id,
                name.trim(),
                chrono::Utc::now().to_rfc3339(),
                base.id,
                base.id,
                payload,
                merge_base
            ],
        )
        .app()?;
        replace(&tx, root, &state)?;
        tx.execute("UPDATE meta SET value=? WHERE key='active_branch'", [id])
            .app()?;
        tx.commit().app()?;
        load_applied(root)
    })
}
pub fn switch_branch(root: &Path, id: &str) -> Result<Project> {
    project::with_lock(root, || {
        ensure_clean(root)?;
        let mut c = project::database(root)?;
        branch(&c, id)?;
        if active(&c)? == id {
            return project::load(root);
        }
        let state = draft(&c, id)?;
        let tx = c.transaction().app()?;
        save_draft(&tx)?;
        replace(&tx, root, &state)?;
        tx.execute("UPDATE meta SET value=? WHERE key='active_branch'", [id])
            .app()?;
        tx.commit().app()?;
        load_applied(root)
    })
}
pub fn promote_version(root: &Path, id: &str, name: &str) -> Result<Version> {
    project::with_lock(root, || {
        if name.trim().is_empty() {
            return Err("Nommez cette version.".into());
        }
        let mut c = project::database(root)?;
        let tx = c.transaction().app()?;
        if tx
            .execute(
                "UPDATE versions SET name=? WHERE id=? AND COALESCE(branch_id,'main')=?",
                params![name.trim(), id, active(&tx)?],
            )
            .app()?
            != 1
        {
            return Err("Version introuvable.".into());
        }
        tx.execute("DELETE FROM automatic_versions WHERE id=?", [id])
            .app()?;
        tx.commit().app()?;
        super::get(root, id)
    })
}
fn normal(s: &Section) -> Value {
    let mut s = s.clone();
    s.revision = 0;
    serde_json::to_value(s).expect("section serialization")
}
fn equal(a: Option<&Section>, b: Option<&Section>) -> bool {
    a.map(normal) == b.map(normal)
}
// A single contiguous paragraph edit on each side. Ambiguous or interleaved edits
// stay conflicts, never guessed. Keeps punctuation and whitespace verbatim.
fn merge_text(base: &str, current: &str, incoming: &str) -> Option<String> {
    let split = |s: &str| s.split("\n\n").map(str::to_owned).collect::<Vec<_>>();
    let b = split(base);
    let a = split(current);
    let z = split(incoming);
    let edit = |v: &Vec<String>| {
        let prefix = b.iter().zip(v).take_while(|(a, b)| a == b).count();
        let suffix = b[prefix..]
            .iter()
            .rev()
            .zip(v[prefix..].iter().rev())
            .take_while(|(a, b)| a == b)
            .count();
        (
            prefix,
            b.len() - suffix,
            v[prefix..v.len() - suffix].to_vec(),
        )
    };
    let x = edit(&a);
    let y = edit(&z);
    if x.0 == y.0 || (x.0 < y.1 && y.0 < x.1) {
        return None;
    }
    let mut result = b;
    let (first, last) = if x.0 < y.0 { (x, y) } else { (y, x) };
    result.splice(last.0..last.1, last.2);
    result.splice(first.0..first.1, first.2);
    Some(result.join("\n\n"))
}
fn entry(
    base: Option<&Section>,
    current: Option<&Section>,
    incoming: Option<&Section>,
) -> Result<MergeEntry> {
    let exemplar = current
        .or(incoming)
        .or(base)
        .ok_or("Section introuvable.")?;
    let mut fields = vec![];
    let result = if equal(current, incoming) || equal(base, incoming) {
        current.cloned()
    } else if equal(base, current) {
        incoming.cloned()
    } else if current
        .zip(incoming)
        .is_some_and(|(a, z)| a.trashed != z.trashed)
    {
        fields.push("section".into());
        current.cloned()
    } else if let (Some(b), Some(a), Some(z)) = (base, current, incoming) {
        let b = normal(b);
        let a = normal(a);
        let z = normal(z);
        let mut r = a.clone();
        for key in a.as_object().ok_or("Section invalide.")?.keys() {
            if key == "revision" {
                continue;
            }
            if a[key] == z[key] || b[key] == z[key] {
                continue;
            }
            if b[key] == a[key] {
                r[key] = z[key].clone();
            } else if key == "text" {
                if let Some(text) = merge_text(
                    b[key].as_str().unwrap_or(""),
                    a[key].as_str().unwrap_or(""),
                    z[key].as_str().unwrap_or(""),
                ) {
                    r[key] = json!(text);
                } else {
                    fields.push(key.clone());
                }
            } else {
                fields.push(key.clone());
            }
        }
        // Outline offsets only apply to the text for which they were built.
        if r["text"] != a["text"] && r["text"] != z["text"] {
            r["outline"] = Value::Null;
        }
        let section: Section = serde_json::from_value(r).app()?;
        if section
            .outline
            .as_ref()
            .is_some_and(|o| project::validate_outline(o, &section.text).is_err())
            && !fields.iter().any(|f| f == "outline")
        {
            fields.push("outline".into());
        }
        Some(section)
    } else {
        fields.push("section".into());
        current.cloned()
    };
    Ok(MergeEntry {
        id: exemplar.id.clone(),
        title: result
            .as_ref()
            .or(current)
            .or(incoming)
            .unwrap_or(exemplar)
            .title
            .clone(),
        base: base.cloned(),
        current: current.cloned(),
        incoming: incoming.cloned(),
        changed: !equal(current, result.as_ref()) || !fields.is_empty(),
        result,
        conflict: !fields.is_empty(),
        fields,
    })
}
fn auxiliary(s: &Snapshot) -> BTreeMap<String, Value> {
    let mut map = BTreeMap::new();
    if let Some(catalog)=&s.entity_catalog {
        for e in &catalog.entities {map.insert(format!("identity:{}",e.id),serde_json::to_value(e).expect("identity"));}
        for r in &catalog.relations {map.insert(format!("entityRelation:{}",r.id),serde_json::to_value(r).expect("relation"));}
    }
    for tag in &s.smart_tags {map.insert(format!("smartTag:{}", tag.id), serde_json::to_value(tag).expect("serializable tag"));}
    if let Some(settings) = s.settings.as_object() {
        for (k, v) in settings {
            map.insert(format!("settings:{k}"), v.clone());
        }
    }
    if let Some(annotations) = &s.annotations {
        for (id, payload) in annotations {
            map.insert(format!("annotation:{id}"), json!(payload));
        }
    }
    for (id, payload) in &s.citations {
        map.insert(format!("citation:{id}"), json!(payload));
    }
    for (section, source, payload) in &s.links {
        map.insert(format!("link:{}", json!([section, source])), json!(payload));
    }
    for (section, source) in &s.pins {
        map.insert(format!("pin:{}", json!([section, source])), json!(true));
    }
    map
}
fn apply_aux(state: &mut Snapshot, map: BTreeMap<String, Value>) -> Result<()> {
    state.entity_catalog=Some(Default::default());
    state.smart_tags.clear();
    state.settings = json!({});
    state.citations.clear();
    state.links.clear();
    state.pins.clear();
    state.annotations = Some(vec![]);
    for (key, value) in map {
        if key.starts_with("identity:") {
            state.entity_catalog.as_mut().expect("catalog").entities.push(serde_json::from_value(value).app()?);
        } else if key.starts_with("entityRelation:") {
            state.entity_catalog.as_mut().expect("catalog").relations.push(serde_json::from_value(value).app()?);
        } else if key.starts_with("smartTag:") {
            state.smart_tags.push(serde_json::from_value(value).app()?);
        } else if let Some(k) = key.strip_prefix("settings:") {
            state.settings[k] = value;
        } else if let Some(k) = key.strip_prefix("annotation:") {
            state
                .annotations
                .as_mut()
                .expect("initialized annotations")
                .push((
                    k.into(),
                    value.as_str().ok_or("Annotation invalide.")?.into(),
                ));
        } else if let Some(k) = key.strip_prefix("citation:") {
            state.citations.push((
                k.into(),
                value.as_str().ok_or("Référence invalide.")?.into(),
            ));
        } else if let Some(k) = key.strip_prefix("link:") {
            let ids: Vec<String> = serde_json::from_str(k).app()?;
            state.links.push((
                ids[0].clone(),
                ids[1].clone(),
                value.as_str().ok_or("Lien invalide.")?.into(),
            ));
        } else if let Some(k) = key.strip_prefix("pin:") {
            let ids: Vec<String> = serde_json::from_str(k).app()?;
            state.pins.push((ids[0].clone(), ids[1].clone()));
        }
    }
    Ok(())
}
fn plan(c: &Connection, source: &str) -> Result<(MergePreview, Snapshot)> {
    let source = branch(c, source)?;
    if source.is_main {
        return Err("Choisissez une variante à intégrer.".into());
    }
    let target = branch(c, "main")?;
    let raw: String = c
        .query_row(
            "SELECT base_payload FROM history_branches WHERE id=?",
            [&source.id],
            |r| r.get(0),
        )
        .app()?;
    let base = unpack(&raw)?;
    let current = draft(c, "main")?;
    let incoming = draft(c, &source.id)?;
    let token = project::hash(
        &serde_json::to_string(&(&base, &current, &incoming, &source.id, active(c)?)).app()?,
    );
    let ids: BTreeSet<_> = base
        .sections
        .iter()
        .chain(&current.sections)
        .chain(&incoming.sections)
        .map(|s| s.id.clone())
        .collect();
    let entries = ids
        .iter()
        .map(|id| {
            entry(
                base.sections.iter().find(|s| s.id == *id),
                current.sections.iter().find(|s| s.id == *id),
                incoming.sections.iter().find(|s| s.id == *id),
            )
        })
        .collect::<Result<Vec<_>>>()?;
    let mut result = current.clone();
    result.sections = entries.iter().filter_map(|e| e.result.clone()).collect();
    let b = auxiliary(&base);
    let a = auxiliary(&current);
    let z = auxiliary(&incoming);
    let mut aux = a.clone();
    let mut conflicts = vec![];
    let keys: BTreeSet<_> = b.keys().chain(a.keys()).chain(z.keys()).cloned().collect();
    for k in keys {
        if a.get(&k) == z.get(&k) || b.get(&k) == z.get(&k) {
            continue;
        }
        if a.get(&k) == b.get(&k) {
            if let Some(v) = z.get(&k) {
                aux.insert(k, v.clone());
            } else {
                aux.remove(&k);
            }
        } else {
            conflicts.push(AuxiliaryConflict {
                id: k.clone(),
                label: if k.starts_with("settings:") {
                    "Réglage du projet"
                } else {
                    "Référence du texte"
                }
                .into(),
                current: serde_json::to_string(&a.get(&k)).app()?,
                incoming: serde_json::to_string(&z.get(&k)).app()?,
            });
        }
    }
    let auxiliary_changes = aux
        .keys()
        .chain(a.keys())
        .collect::<BTreeSet<_>>()
        .iter()
        .filter(|k| aux.get(**k) != a.get(**k))
        .count();
    apply_aux(&mut result, aux)?;
    Ok((
        MergePreview {
            source,
            target,
            token,
            entries,
            auxiliary_conflicts: conflicts,
            auxiliary_changes,
        },
        result,
    ))
}
pub fn merge_preview(root: &Path, source: &str) -> Result<MergePreview> {
    project::with_lock(root, || {
        ensure_clean(root)?;
        Ok(plan(&project::database(root)?, source)?.0)
    })
}
pub fn merge_branch(
    root: &Path,
    source: &str,
    token: &str,
    resolutions: Vec<MergeResolution>,
) -> Result<Project> {
    project::with_lock(root, || {
        ensure_clean(root)?;
        let mut c = project::database(root)?;
        let tx = c.transaction().app()?;
        let (preview, mut result) = plan(&tx, source)?;
        if preview.token != token {
            return Err("Le texte a changé depuis la relecture. Actualisez la comparaison.".into());
        }
        let mut seen = HashSet::new();
        for resolution in &resolutions {
            if !seen.insert(&resolution.id)
                || !["current", "incoming", "custom"].contains(&resolution.choice.as_str())
            {
                return Err("Choix de relecture invalide.".into());
            }
        }
        for e in &preview.entries {
            if !e.conflict && !resolutions.iter().any(|r| r.id == e.id) {
                continue;
            }
            let r = resolutions
                .iter()
                .find(|r| r.id == e.id)
                .ok_or("Choisissez une résolution pour chaque passage en divergence.")?;
            let chosen = match r.choice.as_str() {
                "current" | "incoming"
                    if e.conflict && e.fields.iter().all(|f| f == "text" || f == "outline") =>
                {
                    let side = if r.choice == "current" {
                        &e.current
                    } else {
                        &e.incoming
                    }
                    .as_ref()
                    .ok_or("Texte introuvable.")?;
                    let mut section = e.result.clone().ok_or("Texte introuvable.")?;
                    if e.fields.iter().any(|f| f == "text") {
                        section.text.clone_from(&side.text);
                    }
                    if e.fields.iter().any(|f| f == "outline") {
                        section.outline.clone_from(&side.outline);
                    }
                    if section
                        .outline
                        .as_ref()
                        .is_some_and(|o| project::validate_outline(o, &section.text).is_err())
                    {
                        return Err("Le plan ne correspond pas au texte choisi. Choisissez l’autre texte ou réécrivez le passage.".into());
                    }
                    Some(section)
                }
                "current" => e.current.clone(),
                "incoming" => e.incoming.clone(),
                "custom" => {
                    if e.fields.iter().any(|f| f != "text" && f != "outline") {
                        return Err("Choisissez un côté pour les changements de structure.".into());
                    }
                    let mut section = e.result.clone().ok_or("Texte introuvable.")?;
                    section.text = r.text.clone().ok_or("Saisissez le passage réécrit.")?;
                    section.outline = None;
                    Some(section)
                }
                _ => return Err("Choix invalide.".into()),
            };
            result.sections.retain(|s| s.id != e.id);
            if let Some(s) = chosen {
                result.sections.push(s);
            }
        }
        let mut aux = auxiliary(&result);
        for conflict in &preview.auxiliary_conflicts {
            let r = resolutions
                .iter()
                .find(|r| r.id == conflict.id)
                .ok_or("Choisissez une résolution pour chaque référence en divergence.")?;
            let value = match r.choice.as_str() {
                "current" => &conflict.current,
                "incoming" => &conflict.incoming,
                _ => return Err("Choisissez un côté pour cette référence.".into()),
            };
            let v: Option<Value> = serde_json::from_str(value).app()?;
            if let Some(v) = v {
                aux.insert(conflict.id.clone(), v);
            } else {
                aux.remove(&conflict.id);
            }
        }
        apply_aux(&mut result, aux)?;
        validate(&result)?;
        let source_snapshot = draft(&tx, source)?;
        let mut incoming = source_snapshot.clone();
        for e in preview.entries.iter().filter(|e| !e.conflict) {
            if resolutions
                .iter()
                .any(|r| r.id == e.id && (r.choice == "current" || r.choice == "custom"))
            {
                incoming.sections.retain(|s| s.id != e.id);
                if let Some(base) = &e.base {
                    incoming.sections.push(base.clone());
                }
            }
        }
        let before = draft(&tx, "main")?;
        save_draft(&tx)?;
        tx.execute(
            "UPDATE meta SET value=? WHERE key='active_branch'",
            [source],
        )
        .app()?;
        let source_version = insert(
            &tx,
            "Variante relue avant intégration",
            None,
            source_snapshot,
        )?;
        // Record recovery on the destination even when reviewing from the variant.
        tx.execute("UPDATE meta SET value='main' WHERE key='active_branch'", [])
            .app()?;
        insert(&tx, "Avant intégration", None, before)?;
        replace(&tx, root, &result)?;
        let merged = insert(
            &tx,
            &format!("Intégration · {}", preview.source.name),
            None,
            result.clone(),
        )?;
        tx.execute(
            "UPDATE versions SET merge_parent_id=? WHERE id=?",
            params![source_version.id, merged.id],
        )
        .app()?;
        tx.execute(
            "UPDATE history_branches SET draft=? WHERE id='main'",
            [serde_json::to_string(&result).app()?],
        )
        .app()?;
        tx.execute(
            "UPDATE history_branches SET base_payload=?,base_version=? WHERE id=?",
            params![
                serde_json::to_string(&incoming).app()?,
                source_version.id,
                source
            ],
        )
        .app()?;
        tx.commit().app()?;
        load_applied(root)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::TextPatch;
    fn setup() -> (tempfile::TempDir, String) {
        let d = tempfile::tempdir().unwrap();
        let p = project::create(d.path(), "Roman").unwrap();
        let id = p.sections[0].id.clone();
        (d, id)
    }
    fn write(root: &Path, id: &str, text: &str) {
        let p = project::load(root).unwrap();
        let s = p.sections.iter().find(|s| s.id == id).unwrap();
        project::save(
            root,
            vec![TextPatch {
                id: id.into(),
                revision: s.revision,
                text: text.into(),
                outline: None,
            }],
        )
        .unwrap();
    }
    fn variant(root: &Path) -> String {
        history_state(root)
            .unwrap()
            .branches
            .into_iter()
            .find(|b| !b.is_main)
            .unwrap()
            .id
    }
    #[test]
    fn variants_keep_unsaved_named_steps_drafts_and_automatic_history_across_reopen() {
        let (d, id) = setup();
        write(d.path(), &id, "Début principal.");
        create_branch(d.path(), "Autre fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "Variante en cours.");
        let versions = super::super::list(d.path()).unwrap();
        assert!(versions
            .iter()
            .all(|v| v.branch_id.as_deref() == Some(&branch)));
        assert!(versions.iter().any(|v| v.automatic));
        assert_eq!(
            switch_branch(d.path(), "main").unwrap().sections[0].text,
            "Début principal."
        );
        write(d.path(), &id, "Principal poursuivi.");
        assert_eq!(
            switch_branch(d.path(), &branch).unwrap().sections[0].text,
            "Variante en cours."
        );
        assert_eq!(
            project::load(d.path()).unwrap().sections[0].text,
            "Variante en cours."
        );
        assert_eq!(
            switch_branch(d.path(), "main").unwrap().sections[0].text,
            "Principal poursuivi."
        );
    }
    #[test]
    fn automatic_promotion_keeps_content_and_survives_retention() {
        let (d, id) = setup();
        write(d.path(), &id, "Un état à retenir.");
        let v = super::super::list(d.path())
            .unwrap()
            .into_iter()
            .find(|v| v.automatic)
            .unwrap();
        let named = promote_version(d.path(), &v.id, "Premier jet").unwrap();
        assert!(!named.automatic);
        assert_eq!(named.created, v.created);
        assert_eq!(named.sections[0].text, "Un état à retenir.");
        write(d.path(), &id, "La suite.");
        super::super::checkpoint(d.path(), &id).unwrap();
        assert_eq!(
            super::super::get(d.path(), &named.id).unwrap().name,
            "Premier jet"
        );
    }
    #[test]
    fn integrates_nonoverlapping_paragraph_edits_and_can_undo() {
        let (d, id) = setup();
        write(d.path(), &id, "Matin.\n\nMilieu.\n\nSoir.");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "Matin.\n\nMilieu.\n\nNuit.");
        switch_branch(d.path(), "main").unwrap();
        write(d.path(), &id, "Aube.\n\nMilieu.\n\nSoir.");
        let preview = merge_preview(d.path(), &branch).unwrap();
        assert!(!preview.entries[0].conflict);
        let p = merge_branch(d.path(), &branch, &preview.token, vec![]).unwrap();
        assert_eq!(p.sections[0].text, "Aube.\n\nMilieu.\n\nNuit.");
        let versions = super::super::list(d.path()).unwrap();
        let recovery = versions
            .iter()
            .find(|v| v.name == "Avant intégration")
            .unwrap();
        assert!(versions.iter().any(|v| v.merge_parent_id.is_some()));
        let again = merge_preview(d.path(), &branch).unwrap();
        assert!(!again.entries.iter().any(|e| e.changed));
        let p = super::super::restore(d.path(), &recovery.id).unwrap();
        assert_eq!(p.sections[0].text, "Aube.\n\nMilieu.\n\nSoir.");
    }
    #[test]
    fn refuses_stale_or_unresolved_merge_without_mutating_either_draft() {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "Variante.");
        switch_branch(d.path(), "main").unwrap();
        write(d.path(), &id, "Principal.");
        let preview = merge_preview(d.path(), &branch).unwrap();
        assert!(preview.entries[0].conflict);
        let count = super::super::list(d.path()).unwrap().len();
        assert!(merge_branch(d.path(), &branch, &preview.token, vec![]).is_err());
        assert_eq!(super::super::list(d.path()).unwrap().len(), count);
        write(d.path(), &id, "Principal récent.");
        assert!(merge_branch(
            d.path(),
            &branch,
            &preview.token,
            vec![MergeResolution {
                id: id.clone(),
                choice: "incoming".into(),
                text: None
            }]
        )
        .unwrap_err()
        .contains("changé"));
        assert_eq!(
            project::load(d.path()).unwrap().sections[0].text,
            "Principal récent."
        );
        let preview = merge_preview(d.path(), &branch).unwrap();
        let p = merge_branch(
            d.path(),
            &branch,
            &preview.token,
            vec![MergeResolution {
                id: id.clone(),
                choice: "custom".into(),
                text: Some("Réécriture choisie.".into()),
            }],
        )
        .unwrap();
        assert_eq!(p.sections[0].text, "Réécriture choisie.");
        assert_eq!(
            switch_branch(d.path(), &branch).unwrap().sections[0].text,
            "Variante."
        );
    }
    #[test]
    fn resolving_text_conflicts_preserves_independent_section_changes() {
        for choice in ["current", "incoming"] {
            let (d, id) = setup();
            write(d.path(), &id, "Origine.");
            create_branch(d.path(), "Fin", None).unwrap();
            let branch = variant(d.path());
            write(d.path(), &id, "Variante.");
            let mut section = project::load(d.path()).unwrap().sections.remove(0);
            section.synopsis = "Résumé de la variante".into();
            project::update(d.path(), &section).unwrap();
            switch_branch(d.path(), "main").unwrap();
            write(d.path(), &id, "Principal.");
            let mut section = project::load(d.path()).unwrap().sections.remove(0);
            section.title = "Titre principal".into();
            project::update(d.path(), &section).unwrap();

            let preview = merge_preview(d.path(), &branch).unwrap();
            assert_eq!(preview.entries[0].fields, vec!["text"]);
            assert_eq!(preview.entries[0].title, "Titre principal");
            let merged = merge_branch(
                d.path(),
                &branch,
                &preview.token,
                vec![MergeResolution {
                    id: id.clone(),
                    choice: choice.into(),
                    text: None,
                }],
            )
            .unwrap();
            assert_eq!(merged.sections[0].title, "Titre principal");
            assert_eq!(merged.sections[0].synopsis, "Résumé de la variante");
            assert_eq!(
                merged.sections[0].text,
                if choice == "current" {
                    "Principal."
                } else {
                    "Variante."
                }
            );
        }
    }
    #[test]
    fn incompatible_outline_blocks_text_resolution_without_changing_the_draft() {
        use crate::model::{Outline, OutlineNode};
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "Court.");
        switch_branch(d.path(), "main").unwrap();
        let s = project::load(d.path()).unwrap().sections.remove(0);
        project::save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: s.revision,
                text: "Long\nSuite.".into(),
                outline: Some(Outline {
                    version: 1,
                    nodes: vec![
                        OutlineNode { properties: Default::default(), property_conflicts: Default::default(), tag_ids: vec![],
                            id: "a".into(),
                            parent: None,
                            start: 0,
                        },
                        OutlineNode { properties: Default::default(), property_conflicts: Default::default(), tag_ids: vec![],
                            id: "b".into(),
                            parent: None,
                            start: 5,
                        },
                    ],
                }),
            }],
        )
        .unwrap();
        let preview = merge_preview(d.path(), &branch).unwrap();
        assert_eq!(preview.entries[0].fields, vec!["text"]);
        let err = merge_branch(
            d.path(),
            &branch,
            &preview.token,
            vec![MergeResolution {
                id: id.clone(),
                choice: "incoming".into(),
                text: None,
            }],
        )
        .unwrap_err();
        assert!(err.contains("plan ne correspond pas"));
        assert_eq!(
            project::load(d.path()).unwrap().sections[0].text,
            "Long\nSuite."
        );
        assert_eq!(
            switch_branch(d.path(), &branch).unwrap().sections[0].text,
            "Court."
        );
    }
    #[test]
    fn a_skipped_change_remains_available_for_later_integration() {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "Variante.");
        let preview = merge_preview(d.path(), &branch).unwrap();
        let p = merge_branch(
            d.path(),
            &branch,
            &preview.token,
            vec![MergeResolution {
                id: id.clone(),
                choice: "current".into(),
                text: None,
            }],
        )
        .unwrap();
        assert_eq!(p.sections[0].text, "Origine.");
        assert!(merge_preview(d.path(), &branch)
            .unwrap()
            .entries
            .iter()
            .any(|e| e.changed));
    }
    #[test]
    fn failed_workspace_replacement_rolls_back_outgoing_draft_and_active_branch() {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "Brouillon précieux.");
        let c = project::database(d.path()).unwrap();
        c.execute_batch("CREATE TRIGGER fail_replace BEFORE INSERT ON sections BEGIN SELECT RAISE(ABORT,'failure'); END;").unwrap();
        assert!(switch_branch(d.path(), "main").is_err());
        assert_eq!(active(&c).unwrap(), branch);
        assert_eq!(
            project::load(d.path()).unwrap().sections[0].text,
            "Brouillon précieux."
        );
    }
    #[test]
    fn references_settings_and_annotations_are_isolated_and_conflicts_explicit() {
        let (d, id) = setup();
        write(d.path(), &id, "Texte annoté.");
        let note = project::annotations::create(
            d.path(),
            &id,
            project::load(d.path()).unwrap().sections[0].revision,
            0,
            5,
            "À relire",
        )
        .unwrap();
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        project::annotations::update(d.path(), &note.id, 0, "Autre remarque", false).unwrap();
        project::database(d.path())
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO meta VALUES('settings','{\"font\":\"sans\"}')",
                [],
            )
            .unwrap();
        switch_branch(d.path(), "main").unwrap();
        assert_eq!(
            project::annotations::list(d.path()).unwrap()[0].note,
            "À relire"
        );
        project::database(d.path())
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO meta VALUES('settings','{\"font\":\"mono\"}')",
                [],
            )
            .unwrap();
        let preview = merge_preview(d.path(), &branch).unwrap();
        assert!(preview
            .auxiliary_conflicts
            .iter()
            .any(|e| e.id == "settings:font"));
        let p = merge_branch(
            d.path(),
            &branch,
            &preview.token,
            vec![MergeResolution {
                id: "settings:font".into(),
                choice: "incoming".into(),
                text: None,
            }],
        )
        .unwrap();
        assert_eq!(p.settings["font"], "sans");
        assert_eq!(
            project::annotations::list(d.path()).unwrap()[0].note,
            "Autre remarque"
        );
    }
    #[test]
    fn deletion_against_edit_and_incompatible_tree_are_never_guessed() {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        let mut b = project::load(d.path()).unwrap().sections[0].clone();
        let mut a = b.clone();
        a.text = "Modifié".into();
        assert!(entry(Some(&b), Some(&a), None).unwrap().conflict);
        let mut trashed = b.clone();
        trashed.trashed = true;
        assert!(entry(Some(&b), Some(&a), Some(&trashed)).unwrap().conflict);
        b.parent = Some(b.id.clone());
        assert!(validate(&Snapshot {
            sections: vec![b],
            ..Default::default()
        })
        .is_err());
        assert_eq!(
            merge_text("A\n\nB\n\nC", "X\n\nB\n\nC", "A\n\nB\n\nY"),
            Some("X\n\nB\n\nY".into())
        );
    }
    #[test]
    fn migration_preserves_legacy_payloads_without_fabricated_ancestry() {
        let (d, id) = setup();
        write(d.path(), &id, "Ancien état.");
        let c = project::database(d.path()).unwrap();
        let payload = serde_json::to_string(&snapshot(&c, &None).unwrap()).unwrap();
        c.execute_batch("DROP TABLE automatic_versions;DROP TABLE history_branches;DROP TABLE versions;CREATE TABLE versions(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL,scope TEXT,payload TEXT NOT NULL);DELETE FROM meta WHERE key='active_branch';PRAGMA user_version=1;").unwrap();
        c.execute(
            "INSERT INTO versions VALUES('old','Ancien','2020-01-01T00:00:00Z',NULL,?)",
            [payload],
        )
        .unwrap();
        drop(c);
        let old = super::super::get(d.path(), "old").unwrap();
        assert_eq!(old.sections[0].text, "Ancien état.");
        assert_eq!(old.parent_id, None);
        assert_eq!(old.branch_id.as_deref(), Some("main"));
        assert!(std::fs::read_dir(d.path().join("recuperation"))
            .unwrap()
            .any(|v| v
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("avant-versions")));
    }
    #[test]
    fn nested_variants_include_inherited_changes_when_integrated_into_main() {
        let (d, id) = setup();
        write(d.path(), &id, "A\n\nB\n\nC");
        create_branch(d.path(), "Mère", None).unwrap();
        write(d.path(), &id, "X\n\nB\n\nC");
        create_branch(d.path(), "Fille", None).unwrap();
        let child = history_state(d.path()).unwrap().active_branch;
        write(d.path(), &id, "X\n\nB\n\nZ");
        let preview = merge_preview(d.path(), &child).unwrap();
        assert_eq!(
            merge_branch(d.path(), &child, &preview.token, vec![])
                .unwrap()
                .sections[0]
                .text,
            "X\n\nB\n\nZ"
        );
    }
    #[test]
    fn partial_passage_choice_keeps_unintegrated_text_available() {
        let (d, id) = setup();
        write(d.path(), &id, "A\n\nB\n\nC");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        write(d.path(), &id, "X\n\nB\n\nZ");
        let preview = merge_preview(d.path(), &branch).unwrap();
        let p = merge_branch(
            d.path(),
            &branch,
            &preview.token,
            vec![MergeResolution {
                id: id.clone(),
                choice: "custom".into(),
                text: Some("X\n\nB\n\nC".into()),
            }],
        )
        .unwrap();
        assert_eq!(p.sections[0].text, "X\n\nB\n\nC");
        assert!(merge_preview(d.path(), &branch)
            .unwrap()
            .entries
            .iter()
            .any(|e| e.changed));
    }
    #[test]
    fn switching_never_overwrites_an_external_markdown_edit() {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        create_branch(d.path(), "Fin", None).unwrap();
        let branch = variant(d.path());
        let path = d.path().join("manuscrit").join(format!("{id}.md"));
        std::fs::write(&path, "Modification externe.").unwrap();
        assert!(switch_branch(d.path(), "main")
            .unwrap_err()
            .starts_with("EXTERNAL:"));
        assert_eq!(
            std::fs::read_to_string(path).unwrap(),
            "Modification externe."
        );
        assert_eq!(history_state(d.path()).unwrap().active_branch, branch);
    }
    #[test]
    fn origin_can_be_restored_in_the_variant_without_losing_the_current_draft() {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        let opened = create_branch(d.path(), "Piste", None).unwrap();
        assert!(!opened.recovered);
        let state = history_state(d.path()).unwrap();
        let variant = state.branches.iter().find(|b| !b.is_main).unwrap();
        let origin = variant.base_version.clone().unwrap();
        let variant_id = variant.id.clone();
        write(d.path(), &id, "Brouillon de la variante.");
        let restored = super::super::restore(d.path(), &origin).unwrap();
        assert!(!restored.recovered);
        assert_eq!(restored.sections[0].text, "Origine.");
        assert_eq!(history_state(d.path()).unwrap().active_branch, variant_id);
        let recovery = super::super::list(d.path())
            .unwrap()
            .into_iter()
            .find(|v| v.name == "Avant restauration")
            .unwrap();
        assert_eq!(
            super::super::get(d.path(), &recovery.id).unwrap().sections[0].text,
            "Brouillon de la variante."
        );
        assert!(!switch_branch(d.path(), "main").unwrap().recovered);
    }

    #[test]
    fn restore_rejects_a_version_from_an_unrelated_variant() {
        let (d, id) = setup();
        write(d.path(), &id, "Origine.");
        create_branch(d.path(), "Piste A", None).unwrap();
        write(d.path(), &id, "Texte A.");
        let v = super::super::capture(d.path(), "Fin A", None).unwrap();
        switch_branch(d.path(), "main").unwrap();
        create_branch(d.path(), "Piste B", None).unwrap();
        let error = super::super::restore(d.path(), &v.id).unwrap_err();
        assert!(error.contains("autre variante"));
        assert_eq!(
            project::load(d.path()).unwrap().sections[0].text,
            "Origine."
        );
    }
}
