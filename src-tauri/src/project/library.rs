use crate::{
    error::{AppResult, Result},
    model::{Project, Section},
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub action: String,
    #[serde(default)]
    pub ids: Vec<String>,
    pub target: Option<String>,
    pub placement: Option<String>,
    pub role: Option<String>,
    pub title: Option<String>,
    pub kind: Option<String>,
    pub included: Option<bool>,
}
#[derive(Serialize, Deserialize)]
struct Position {
    id: String,
    parent: Option<String>,
    position: i64,
    role: String,
    trashed: bool,
    #[serde(default = "crate::model::default_included")]
    included: bool,
}
fn snapshot(all: &[Section]) -> Result<String> {
    serde_json::to_string(
        &all.iter()
            .map(|s| Position {
                id: s.id.clone(),
                parent: s.parent.clone(),
                position: s.position,
                role: s.role.clone(),
                trashed: s.trashed,
                included: s.included,
            })
            .collect::<Vec<_>>(),
    )
    .app()
}
fn branch(all: &[Section], roots: &HashSet<String>) -> HashSet<String> {
    super::tree::descendant_ids(all, roots.iter().map(String::as_str))
}
pub(super) fn validate_parent(
    all: &[Section],
    parent: Option<&str>,
    roots: &HashSet<String>,
    kind: Option<&str>,
) -> Result<()> {
    let affected = branch(all, roots);
    let contains_chapter = kind == Some("chapter")
        || all
            .iter()
            .any(|s| affected.contains(&s.id) && s.kind == "chapter");
    let mut cursor = parent;
    let mut seen = HashSet::new();
    while let Some(id) = cursor {
        if affected.contains(id) || !seen.insert(id) {
            return Err("Une section ne peut pas être placée dans sa propre branche.".into());
        }
        let item = all
            .iter()
            .find(|s| s.id == id && !s.trashed)
            .ok_or("Parent introuvable")?;
        if contains_chapter && item.kind == "chapter" {
            return Err("Un chapitre ne peut pas être placé dans un autre chapitre.".into());
        }
        cursor = item.parent.as_deref();
    }
    Ok(())
}
pub fn apply(root: &Path, op: Operation) -> Result<Project> {
    super::with_lock(root, || apply_unlocked(root, op))
}
fn apply_unlocked(root: &Path, op: Operation) -> Result<Project> {
    let mut c = super::database(root)?;
    let tx = c
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .app()?;
    let mut all = super::all_sections(&tx)?;
    if op.action == "undo" {
        let (id, raw): (i64, String) = tx
            .query_row(
                "SELECT id,payload FROM structure_history ORDER BY id DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "Aucune opération à annuler.".to_string())?;
        let before: Vec<Position> = serde_json::from_str(&raw).app()?;
        // New documents are recoverable in Trash, even if their text changed after creation.
        let old_ids: HashSet<_> = before.iter().map(|p| p.id.as_str()).collect();
        for s in &all {
            if !old_ids.contains(s.id.as_str()) {
                tx.execute("UPDATE sections SET trashed=1 WHERE id=?", [&s.id])
                    .app()?;
            }
        }
        for p in before {
            tx.execute(
                "UPDATE sections SET parent=?,position=?,role=?,trashed=?,included=? WHERE id=?",
                params![p.parent, p.position, p.role, p.trashed, p.included, p.id],
            )
            .app()?;
        }
        tx.execute("DELETE FROM structure_history WHERE id=?", [id])
            .app()?;
    } else {
        let selected: HashSet<String> = op.ids.iter().cloned().collect();
        if op.action != "add"
            && (selected.is_empty() || selected.iter().any(|id| !all.iter().any(|s| &s.id == id)))
        {
            return Err("Sélection introuvable.".into());
        }
        let restoring = op.action == "restore";
        if selected
            .iter()
            .any(|id| all.iter().any(|s| &s.id == id && s.trashed != restoring))
        {
            return Err("Cette sélection n’est plus disponible.".into());
        }
        let roots: HashSet<_> = selected
            .iter()
            .filter(|id| {
                let mut parent = all
                    .iter()
                    .find(|s| &s.id == *id)
                    .and_then(|s| s.parent.clone());
                let mut seen = HashSet::new();
                while let Some(p) = parent {
                    if selected.contains(&p) || !seen.insert(p.clone()) {
                        return false;
                    }
                    parent = all
                        .iter()
                        .find(|s| s.id == p)
                        .and_then(|s| s.parent.clone());
                }
                true
            })
            .cloned()
            .collect();
        let affected = branch(&all, &roots);
        let before = snapshot(&all)?;
        match op.action.as_str() {
            "move" | "add" => {
                let placement = op.placement.as_deref().unwrap_or("inside");
                if !["before", "after", "inside"].contains(&placement) {
                    return Err("Position invalide.".into());
                }
                let target = op
                    .target
                    .as_ref()
                    .map(|id| {
                        all.iter()
                            .find(|s| &s.id == id && !s.trashed)
                            .cloned()
                            .ok_or("Destination introuvable.".to_string())
                    })
                    .transpose()?;
                if target.as_ref().is_some_and(|s| affected.contains(&s.id)) {
                    return Err("Impossible de déplacer un dossier dans sa propre branche.".into());
                }
                if placement == "inside" && target.as_ref().is_some_and(|s| s.kind == "scene") {
                    return Err("Choisissez un dossier ou un chapitre.".into());
                }
                let parent = target.as_ref().and_then(|s| {
                    if placement == "inside" {
                        Some(s.id.clone())
                    } else {
                        s.parent.clone()
                    }
                });
                validate_parent(
                    &all,
                    parent.as_deref(),
                    &roots,
                    if op.action == "add" {
                        op.kind.as_deref()
                    } else {
                        None
                    },
                )?;
                let role = target.as_ref().map(|s| s.role.clone()).unwrap_or_else(|| {
                    op.role
                        .clone()
                        .unwrap_or_else(crate::model::manuscript_role)
                });
                if !["manuscript", "note"].contains(&role.as_str()) {
                    return Err("Emplacement invalide.".into());
                }
                let mut moving = if op.action == "add" {
                    let kind = op.kind.as_deref().unwrap_or("scene");
                    if !["scene", "folder", "chapter"].contains(&kind) {
                        return Err("Type inconnu.".into());
                    }
                    vec![Section {
                        id: uuid::Uuid::new_v4().to_string(),
                        parent: parent.clone(),
                        title: op.title.unwrap_or_default(),
                        kind: kind.into(),
                        position: 0,
                        text: String::new(),
                        revision: 0,
                        synopsis: String::new(),
                        status: "Brouillon".into(),
                        goal: 0,
                        outline: None,
                        role: role.clone(),
                        trashed: false,
                        included: true,
                    }]
                } else {
                    all.iter()
                        .filter(|s| roots.contains(&s.id))
                        .cloned()
                        .collect::<Vec<_>>()
                };
                for s in &mut moving {
                    s.parent = parent.clone();
                    s.role = role.clone();
                }
                all.retain(|s| !roots.contains(&s.id));
                let index = target
                    .as_ref()
                    .filter(|_| placement != "inside")
                    .and_then(|t| all.iter().position(|s| s.id == t.id))
                    .map(|i| i + usize::from(placement == "after"))
                    .unwrap_or(all.len());
                all.splice(index..index, moving);
                for s in &mut all {
                    if affected.contains(&s.id) {
                        s.role = role.clone();
                    }
                }
            }
            "include" => {
                let included = op.included.ok_or("Inclusion manquante.")?;
                for s in &mut all {
                    if affected.contains(&s.id) && s.kind == "scene" && !s.trashed { s.included = included; }
                }
            }
            "trash" => {
                for s in &mut all {
                    if affected.contains(&s.id) {
                        s.trashed = true;
                    }
                }
            }
            "restore" => {
                let mut restore = affected;
                for id in &roots {
                    let mut parent = all
                        .iter()
                        .find(|s| &s.id == id)
                        .and_then(|s| s.parent.clone());
                    let mut seen = HashSet::new();
                    while let Some(p) = parent {
                        if !seen.insert(p.clone()) {
                            break;
                        }
                        restore.insert(p.clone());
                        parent = all
                            .iter()
                            .find(|s| s.id == p)
                            .and_then(|s| s.parent.clone());
                    }
                }
                for s in &mut all {
                    if restore.contains(&s.id) {
                        s.trashed = false;
                    }
                }
            }
            "duplicate" => {
                let ids: HashMap<_, _> = all
                    .iter()
                    .filter(|s| affected.contains(&s.id) && !s.trashed)
                    .map(|s| (s.id.clone(), uuid::Uuid::new_v4().to_string()))
                    .collect();
                let mut copies = Vec::new();
                for s in all.iter().filter(|s| ids.contains_key(&s.id)) {
                    let mut copy = s.clone();
                    copy.id = ids[&s.id].clone();
                    copy.revision = 0;
                    copy.parent = s.parent.as_ref().map(|p| ids.get(p).unwrap_or(p).clone());
                    if roots.contains(&s.id) {
                        copy.title = format!("{} — copie", s.title);
                    }
                    if let Some(outline) = &mut copy.outline {
                        let node_ids: HashMap<_, _> = outline
                            .nodes
                            .iter()
                            .map(|n| (n.id.clone(), uuid::Uuid::new_v4().to_string()))
                            .collect();
                        for n in &mut outline.nodes {
                            n.id = node_ids[&n.id].clone();
                            n.parent = n.parent.as_ref().and_then(|p| node_ids.get(p).cloned());
                        }
                    }
                    tx.execute("INSERT INTO links(section,source,payload) SELECT ?,source,payload FROM links WHERE section=?", params![copy.id,s.id]).app()?;
                    copies.push(copy);
                }
                // Insert each copied root directly after its original; descendants keep their sibling order.
                for copy in copies.into_iter().rev() {
                    let original = ids
                        .iter()
                        .find(|(_, new)| **new == copy.id)
                        .map(|(old, _)| old)
                        .unwrap();
                    let i = all.iter().position(|s| &s.id == original).unwrap() + 1;
                    all.insert(i, copy);
                }
            }
            _ => return Err("Opération inconnue.".into()),
        }
        for (i, s) in all.iter().enumerate() {
            tx.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent=excluded.parent,position=excluded.position,role=excluded.role,trashed=excluded.trashed,included=excluded.included", params![s.id,s.parent,s.title,s.kind,i as i64,s.text,s.revision,s.synopsis,s.status,s.goal,s.outline.as_ref().map(serde_json::to_string).transpose().app()?,s.role,s.trashed,s.included]).app()?;
        }
        tx.execute("INSERT INTO structure_history(payload) VALUES(?)", [before])
            .app()?;
    }
    tx.commit().app()?;
    super::load_unlocked(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{model::TextPatch, project};
    fn op(
        action: &str,
        ids: &[&str],
        target: Option<&str>,
        placement: Option<&str>,
        role: Option<&str>,
    ) -> Operation {
        Operation {
            action: action.into(),
            ids: ids.iter().map(|s| s.to_string()).collect(),
            target: target.map(str::to_owned),
            placement: placement.map(str::to_owned),
            role: role.map(str::to_owned),
            title: None,
            kind: None,
            included: None,
        }
    }
    fn fixture() -> (tempfile::TempDir, String, String, String) {
        let d = tempfile::tempdir().unwrap();
        let first = project::create(d.path(), "Livre").unwrap().sections[0]
            .id
            .clone();
        let all = project::add(d.path(), None, "Chapitre", "chapter").unwrap();
        let folder = all
            .iter()
            .find(|s| s.title == "Chapitre")
            .unwrap()
            .id
            .clone();
        let all = project::add(d.path(), Some(folder.clone()), "Enfant", "scene").unwrap();
        let child = all.iter().find(|s| s.title == "Enfant").unwrap().id.clone();
        (d, first, folder, child)
    }
    #[test]
    fn working_texts_survive_reload_history_copy_undo_and_scoped_export() {
        let (d, first, folder, child) = fixture();
        let mut exclude = op("include", &[&folder], None, None, None);
        exclude.included = Some(false);
        let changed = apply(d.path(), exclude).unwrap();
        assert!(changed.sections.iter().find(|s| s.id == first).unwrap().included);
        assert!(!project::load(d.path()).unwrap().sections.iter().find(|s| s.id == child).unwrap().included);
        project::save(d.path(), vec![TextPatch { id: child.clone(), text: "Texte de travail conservé".into(), revision: 0, outline: None }]).unwrap();
        let version = crate::history::capture(d.path(), "Travail", None).unwrap();
        let output = d.path().join("manuscrit.md");
        crate::export::export(d.path(), d.path(), &output, "md", None).unwrap();
        assert!(!std::fs::read_to_string(&output).unwrap().contains("Texte de travail conservé"));
        assert!(!std::fs::read_to_string(&output).unwrap().contains("Chapitre"));
        crate::export::export(d.path(), d.path(), &output, "md", Some(child.clone())).unwrap();
        assert!(std::fs::read_to_string(&output).unwrap().contains("Texte de travail conservé"));
        let duplicate = apply(d.path(), op("duplicate", &[&child], None, None, None)).unwrap();
        assert!(!duplicate.sections.iter().find(|s| s.title == "Enfant — copie").unwrap().included);
        apply(d.path(), op("undo", &[], None, None, None)).unwrap();
        let restored = apply(d.path(), op("undo", &[], None, None, None)).unwrap();
        let text = restored.sections.iter().find(|s| s.id == child).unwrap();
        assert!(text.included);
        assert_eq!(text.text, "Texte de travail conservé");
        let historical = crate::history::restore(d.path(), &version.id).unwrap();
        assert!(!historical.sections.iter().find(|s| s.id == child).unwrap().included);
        let c = project::database(d.path()).unwrap();
        c.execute_batch("PRAGMA user_version=0; ALTER TABLE sections DROP COLUMN included").unwrap();
        drop(c);
        assert!(project::load(d.path()).unwrap().sections.iter().all(|s| s.included));
        let mut legacy = serde_json::to_value(&historical.sections[0]).unwrap();
        legacy.as_object_mut().unwrap().remove("included");
        assert!(serde_json::from_value::<Section>(legacy).unwrap().included);
    }
    #[test]
    fn chapters_cannot_nest_but_scenes_can_move_in_and_out() {
        let (d, scene, chapter, child) = fixture();
        let all = project::add(d.path(), None, "Autre", "chapter").unwrap();
        let other = all.iter().find(|s| s.title == "Autre").unwrap().id.clone();
        let before = serde_json::to_string(&project::load(d.path()).unwrap().sections).unwrap();
        for (target, placement) in [(&chapter, None), (&child, Some("before"))] {
            assert!(apply(
                d.path(),
                op("move", &[&other], Some(target), placement, None)
            )
            .err()
            .unwrap()
            .contains("Un chapitre ne peut pas"));
        }
        let mut add = op("add", &[], Some(&chapter), None, None);
        add.kind = Some("chapter".into());
        assert!(apply(d.path(), add).is_err());
        assert!(project::add(d.path(), Some(chapter.clone()), "Interdit", "chapter").is_err());
        let ids = all.iter().map(|s| s.id.clone()).collect::<Vec<_>>();
        assert!(project::reorder(d.path(), &ids, &other, Some(chapter.clone())).is_err());
        assert_eq!(
            serde_json::to_string(&project::load(d.path()).unwrap().sections).unwrap(),
            before
        );
        let inside = apply(d.path(), op("move", &[&scene], Some(&chapter), None, None)).unwrap();
        assert_eq!(
            inside
                .sections
                .iter()
                .find(|s| s.id == scene)
                .unwrap()
                .parent
                .as_deref(),
            Some(chapter.as_str())
        );
        let outside = apply(d.path(), op("move", &[&scene], None, None, None)).unwrap();
        assert!(outside
            .sections
            .iter()
            .find(|s| s.id == scene)
            .unwrap()
            .parent
            .is_none());
        let all = project::add(d.path(), None, "Partie", "folder").unwrap();
        let part = all.iter().find(|s| s.title == "Partie").unwrap().id.clone();
        apply(d.path(), op("move", &[&other], Some(&part), None, None)).unwrap();
        assert!(apply(d.path(), op("move", &[&part], Some(&chapter), None, None)).is_err());
        assert!(apply(
            d.path(),
            op("move", &[&other], Some(&chapter), Some("after"), None)
        )
        .is_ok());
    }
    #[test]
    fn batch_moves_normalize_nested_selection_and_reject_cycles_atomically() {
        let (d, first, folder, child) = fixture();
        let before = serde_json::to_string(&project::load(d.path()).unwrap().sections).unwrap();
        assert!(apply(
            d.path(),
            op("move", &[&folder], Some(&child), Some("before"), None)
        )
        .is_err());
        assert_eq!(
            serde_json::to_string(&project::load(d.path()).unwrap().sections).unwrap(),
            before
        );
        let p = apply(
            d.path(),
            op("move", &[&folder, &child, &first], None, None, Some("note")),
        )
        .unwrap();
        assert!(p.sections.iter().all(|s| s.role == "note"));
        assert_eq!(
            p.sections
                .iter()
                .find(|s| s.id == child)
                .unwrap()
                .parent
                .as_deref(),
            Some(folder.as_str())
        );
        assert!(p.can_undo_structure);
    }
    #[test]
    fn before_after_and_root_keep_sibling_order() {
        let (d, first, folder, child) = fixture();
        let p = apply(
            d.path(),
            op("move", &[&child], Some(&first), Some("before"), None),
        )
        .unwrap();
        assert_eq!(
            p.sections
                .iter()
                .filter(|s| s.parent.is_none())
                .map(|s| s.id.as_str())
                .collect::<Vec<_>>(),
            vec![child.as_str(), first.as_str(), folder.as_str()]
        );
        let p = apply(
            d.path(),
            op(
                "move",
                &[&child, &first],
                Some(&folder),
                Some("after"),
                None,
            ),
        )
        .unwrap();
        assert_eq!(
            p.sections.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            vec![folder.as_str(), child.as_str(), first.as_str()]
        );
    }
    #[test]
    fn undo_survives_reopen_and_preserves_new_text() {
        let (d, first, folder, _) = fixture();
        apply(d.path(), op("move", &[&first], Some(&folder), None, None)).unwrap();
        project::save(
            d.path(),
            vec![TextPatch {
                id: first.clone(),
                revision: 0,
                text: "Texte après déplacement".into(),
                outline: None,
            }],
        )
        .unwrap();
        let reopened = project::load(d.path()).unwrap();
        assert!(reopened.can_undo_structure);
        let p = apply(d.path(), op("undo", &[], None, None, None)).unwrap();
        let s = p.sections.iter().find(|s| s.id == first).unwrap();
        assert_eq!(s.parent, None);
        assert_eq!(s.text, "Texte après déplacement");
        assert_eq!(s.revision, 1);
    }
    #[test]
    fn trash_restore_keeps_links_text_and_history_and_restores_only_required_ancestors() {
        let (d, _, folder, child) = fixture();
        project::add(d.path(), Some(folder.clone()), "Autre enfant", "scene").unwrap();
        project::save(
            d.path(),
            vec![TextPatch {
                id: child.clone(),
                revision: 0,
                text: "À conserver".into(),
                outline: None,
            }],
        )
        .unwrap();
        let c = project::database(d.path()).unwrap();
        c.execute("INSERT INTO links VALUES(?, 'source', '{}')", [&child])
            .unwrap();
        crate::history::capture(d.path(), "Avant", None).unwrap();
        let p = apply(d.path(), op("trash", &[&folder], None, None, None)).unwrap();
        assert_eq!(p.trash.len(), 3);
        assert!(!p.sections.iter().any(|s| s.id == child));
        let p = apply(d.path(), op("restore", &[&child], None, None, None)).unwrap();
        assert_eq!(p.trash.len(), 1);
        assert!(p.sections.iter().any(|s| s.id == folder));
        assert_eq!(
            p.sections.iter().find(|s| s.id == child).unwrap().text,
            "À conserver"
        );
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM links WHERE section=?",
                [&child],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert!(!crate::history::list(d.path()).unwrap().is_empty());
    }
    #[test]
    fn duplicate_branch_copies_links_and_undo_retains_edited_copy_in_trash() {
        let (d, _, folder, child) = fixture();
        let c = project::database(d.path()).unwrap();
        c.execute("INSERT INTO links VALUES(?, 'source', '{}')", [&child])
            .unwrap();
        let p = apply(
            d.path(),
            op("duplicate", &[&folder, &child], None, None, None),
        )
        .unwrap();
        assert_eq!(p.sections.len(), 5);
        let copy_folder = p
            .sections
            .iter()
            .find(|s| s.title.ends_with("— copie"))
            .unwrap();
        let copy = p
            .sections
            .iter()
            .find(|s| s.parent.as_ref() == Some(&copy_folder.id))
            .unwrap();
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM links WHERE section=?",
                [&copy.id],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        project::save(
            d.path(),
            vec![TextPatch {
                id: copy.id.clone(),
                revision: 0,
                text: "Copie retravaillée".into(),
                outline: None,
            }],
        )
        .unwrap();
        let p = apply(d.path(), op("undo", &[], None, None, None)).unwrap();
        assert_eq!(p.sections.len(), 3);
        assert_eq!(p.trash.len(), 2);
        assert!(p.trash.iter().any(|s| s.text == "Copie retravaillée"));
    }
    #[test]
    fn manuscript_export_includes_legacy_notes_but_excludes_trash() {
        let (d, first, folder, child) = fixture();
        apply(d.path(), op("move", &[&folder], None, None, Some("note"))).unwrap();
        project::save(
            d.path(),
            vec![TextPatch {
                id: child,
                revision: 0,
                text: "Secret des notes".into(),
                outline: None,
            }],
        )
        .unwrap();
        apply(d.path(), op("trash", &[&first], None, None, None)).unwrap();
        let dest = d.path().join("export.md");
        crate::export::export_with_cancel(
            d.path(),
            Path::new("resources"),
            &dest,
            "md",
            None,
            &std::sync::atomic::AtomicBool::new(false),
        )
        .unwrap();
        let text = std::fs::read_to_string(dest).unwrap();
        assert!(text.contains("Secret des notes"));
        assert!(!text.contains("Sans titre"));
        assert!(text.contains("Chapitre"));
    }
    #[test]
    fn history_restore_keeps_library_roles_and_clears_obsolete_undo() {
        let (d, first, folder, _) = fixture();
        apply(d.path(), op("move", &[&folder], None, None, Some("note"))).unwrap();
        apply(d.path(), op("trash", &[&first], None, None, None)).unwrap();
        let version = crate::history::capture(d.path(), "Notes", None).unwrap();
        apply(d.path(), op("restore", &[&first], None, None, None)).unwrap();
        let p = crate::history::restore(d.path(), &version.id).unwrap();
        assert_eq!(p.trash.len(), 1);
        assert!(p.sections.iter().all(|s| s.role == "note"));
        assert!(!p.can_undo_structure);
    }
}
