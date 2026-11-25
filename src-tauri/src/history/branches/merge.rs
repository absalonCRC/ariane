use super::{
    active, branch, draft, ensure_clean, load_applied, replace, save_draft, validate, Branch,
};
use crate::{
    error::{AppResult, Result},
    history::{insert, unpack, Snapshot},
    model::{Project, Section},
    project,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    path::Path,
};

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
pub(super) fn merge_text(base: &str, current: &str, incoming: &str) -> Option<String> {
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
pub(super) fn entry(
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
        let normalized = |section: &Section| {
            let mut value = normal(section);
            value["writingAids"] = json!(section.writing_aids);
            value
        };
        let b = normalized(b);
        let a = normalized(a);
        let z = normalized(z);
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
        if ![&a, &z]
            .iter()
            .any(|side| r["writingAids"] == side["writingAids"] && r["text"] == side["text"])
        {
            let mut aids: Vec<crate::model::WritingAid> =
                serde_json::from_value(r["writingAids"].clone()).app()?;
            project::writing_aids::detach(&mut aids);
            r["writingAids"] = json!(aids);
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
    if let Some(catalog) = &s.entity_catalog {
        for e in &catalog.entities {
            map.insert(
                format!("identity:{}", e.id),
                serde_json::to_value(e).expect("identity"),
            );
        }
        for r in &catalog.relations {
            map.insert(
                format!("entityRelation:{}", r.id),
                serde_json::to_value(r).expect("relation"),
            );
        }
    }
    for tag in &s.smart_tags {
        map.insert(
            format!("smartTag:{}", tag.id),
            serde_json::to_value(tag).expect("serializable tag"),
        );
    }
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
    state.entity_catalog = Some(Default::default());
    state.smart_tags.clear();
    state.settings = json!({});
    state.citations.clear();
    state.links.clear();
    state.pins.clear();
    state.annotations = Some(vec![]);
    for (key, value) in map {
        if key.starts_with("identity:") {
            state
                .entity_catalog
                .as_mut()
                .expect("catalog")
                .entities
                .push(serde_json::from_value(value).app()?);
        } else if key.starts_with("entityRelation:") {
            state
                .entity_catalog
                .as_mut()
                .expect("catalog")
                .relations
                .push(serde_json::from_value(value).app()?);
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
                        if section.text != side.text {
                            project::writing_aids::detach(&mut section.writing_aids);
                        }
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
                    project::writing_aids::detach(&mut section.writing_aids);
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
