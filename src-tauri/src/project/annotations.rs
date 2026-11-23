use crate::{error::{AppResult, Result}, model::Section};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
pub(crate) use super::document_anchor::DocumentAnchor;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub document: Option<DocumentAnchor>,
    pub id: String, pub section: String, pub quote: String, pub before: String, pub after: String,
    pub note: String, pub done: bool, pub created: String, pub revision: i64,
}
fn check_branch(tx: &Connection, branch: Option<&str>, linked: bool) -> Result<()> {
    if branch.is_some() || linked {
        let active = crate::history::active_id(tx)?;
        if Some(active.as_str()) != branch { return Err("La variante active a changé.".into()); }
    }
    Ok(())
}
fn database(root: &Path) -> Result<Connection> {
    let c = super::database(root)?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY, payload TEXT NOT NULL);").app()?;
    Ok(c)
}
pub fn list(root: &Path) -> Result<Vec<Annotation>> {
    let c = super::database(root)?;
    let exists: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='table' AND name='annotations')",
        [], |row| row.get(0),
    ).app()?;
    if !exists { return Ok(Vec::new()); }
    let values: Vec<String> = c.prepare("SELECT payload FROM annotations ORDER BY rowid").app()?.query_map([], |r| r.get(0)).app()?.collect::<std::result::Result<_,_>>().app()?;
    values.into_iter().map(|v| serde_json::from_str(&v).app()).collect()
}
fn anchor(section: &Section, from: usize, to: usize) -> Result<(String,String,String)> {
    let units: Vec<u16> = section.text.encode_utf16().collect();
    if from >= to || to > units.len() || to-from > 10000 { return Err("Sélection invalide ou trop longue (10 000 caractères maximum).".into()); }
    let quote = String::from_utf16(&units[from..to]).app()?;
    let prefix = String::from_utf16(&units[..from]).app()?;
    let suffix = String::from_utf16(&units[to..]).app()?;
    let before = prefix.chars().rev().take(48).collect::<Vec<_>>().into_iter().rev().collect();
    let after = suffix.chars().take(48).collect();
    Ok((quote,before,after))
}
#[cfg(test)]
pub fn create(root: &Path, section: &str, revision: i64, from: usize, to: usize, note: &str) -> Result<Annotation> {
    create_linked(root,section,revision,from,to,note,None,None,None)
}
#[allow(clippy::too_many_arguments)]
pub fn create_linked(root: &Path, section: &str, revision: i64, from: usize, to: usize, note: &str, document: Option<DocumentAnchor>, branch: Option<&str>, request_id: Option<&str>) -> Result<Annotation> {
    if note.trim().is_empty() || note.len() > 20000 { return Err("Écrivez une annotation de moins de 20 000 caractères.".into()); }
    let mut c = database(root)?;
    let tx = c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).app()?;
    check_branch(&tx, branch, document.is_some())?;
    let s = super::section(&tx,section)?.filter(|s| !s.trashed && s.kind == "scene" && s.revision == revision).ok_or("Le texte a changé. Sélectionnez à nouveau le passage.")?;
    let (quote,before,after) = anchor(&s,from,to)?;
    let id=match request_id {
        Some(id) => uuid::Uuid::parse_str(id).app()?,
        None => uuid::Uuid::new_v4(),
    }.to_string();
    if request_id.is_some() {
        let existing: Option<String>=tx.query_row("SELECT payload FROM annotations WHERE id=?",[&id],|r| r.get(0)).optional().app()?;
        if let Some(raw)=existing {
            let prior: Annotation=serde_json::from_str(&raw).app()?;
            if prior.section==section && prior.quote==quote && prior.before==before && prior.after==after &&
                prior.document==document && prior.note==note.trim() {return Ok(prior)}
            return Err("L’annotation a changé. Rechargez-la.".into());
        }
    }
    let value = Annotation { document, id, section: section.into(), quote, before, after,
        note: note.trim().into(), done: false, created: chrono::Utc::now().to_rfc3339(), revision: 0 };
    tx.execute("INSERT INTO annotations VALUES(?,?)",params![value.id, serde_json::to_string(&value).app()?]).app()?;
    tx.commit().app()?; Ok(value)
}
#[cfg(test)]
pub fn update(root: &Path, id: &str, revision: i64, note: &str, done: bool) -> Result<Annotation> {
    update_linked(root,id,revision,note,done,None,None)
}
#[allow(clippy::too_many_arguments)]
pub fn update_linked(root: &Path, id: &str, revision: i64, note: &str, done: bool, document: Option<DocumentAnchor>, branch: Option<&str>) -> Result<Annotation> {
    if note.trim().is_empty() || note.len() > 20000 { return Err("Annotation vide ou trop longue.".into()); }
    let mut c = database(root)?;
    let tx = c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).app()?;
    check_branch(&tx, branch, document.is_some())?;
    let raw: String = tx.query_row("SELECT payload FROM annotations WHERE id=?",[id],|r|r.get(0)).app()?;
    let mut value: Annotation = serde_json::from_str(&raw).app()?;
    if value.revision != revision { return Err("L’annotation a changé. Rechargez-la.".into()); }
    if document.is_some() { value.document = document; }
    value.note = note.trim().into(); value.done = done; value.revision += 1;
    tx.execute("UPDATE annotations SET payload=? WHERE id=?",params![serde_json::to_string(&value).app()?,id]).app()?;
    tx.commit().app()?; Ok(value)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn annotations_are_separate_from_manuscript_and_revision_guarded() {
        let dir = tempfile::tempdir().unwrap();
        let p = super::super::create(dir.path(),"Livre").unwrap();
        let id = &p.sections[0].id;
        super::super::save(dir.path(),vec![crate::model::TextPatch { writing_aids: None, id:id.clone(), revision:0, text:"Élise 😀 revient.".into(),outline:None }]).unwrap();
        assert!(create(dir.path(),id,0,0,5,"Vérifier la date").is_err());
        assert!(create(dir.path(),id,1,6,7,"Emoji coupé").is_err());
        let a = create(dir.path(),id,1,0,5,"Vérifier la date").unwrap();
        assert_eq!(a.quote,"Élise");
        update(dir.path(),&a.id,0,"Date confirmée",true).unwrap();
        assert!(update(dir.path(),&a.id,0,"Ancien brouillon",false).is_err());
        assert!(list(dir.path()).unwrap()[0].done);
        assert_eq!(super::super::load(dir.path()).unwrap().sections[0].text,"Élise 😀 revient.");
    }
}

/// A structural operation knows which scene now owns an unchanged quoted passage.
/// Move only anchors contained completely in the moved range; crossing selections stay detached.
pub(super) fn relocate(tx: &rusqlite::Transaction<'_>, op: &super::manuscript::Operation, before: &[Section], after: &[Section]) -> Result<()> {
    let exists: i64 = tx.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='annotations'",[],|r|r.get(0)).app()?;
    if exists == 0 { return Ok(()); }
    let values: Vec<String> = tx.prepare("SELECT payload FROM annotations").app()?.query_map([],|r|r.get(0)).app()?.collect::<std::result::Result<_,_>>().app()?;
    for raw in values {
        let mut value: Annotation = serde_json::from_str(&raw).app()?;
        let destination = if op.action == "join" && Some(value.section.as_str()) == op.target_id.as_deref() {
            Some(op.source_id.clone())
        } else if value.section == op.source_id && op.action == "split" {
            let original = before.iter().find(|s|s.id == value.section).ok_or("Scène d’annotation absente.")?;
            let all_matches: Vec<_> = original.text.match_indices(&value.quote).collect();
            let contextual: Vec<_> = original.text.match_indices(&value.quote).filter(|(from,_)|
                original.text[..*from].ends_with(&value.before) && original.text[*from+value.quote.len()..].starts_with(&value.after)).collect();
            let matches = if contextual.len() == 1 { contextual } else { all_matches };
            if matches.len() != 1 { continue; }
            let from = original.text[..matches[0].0].encode_utf16().count();
            if op.action == "split" && from >= op.offset.unwrap() {
                after.iter().find(|s| !before.iter().any(|old|old.id == s.id)).map(|s|s.id.clone())
            } else { None }
        } else { None };
        if let Some(destination) = destination {
            value.section = destination;
            value.revision += 1;
            tx.execute("UPDATE annotations SET payload=? WHERE id=?",params![serde_json::to_string(&value).app()?,value.id]).app()?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod relocation_tests {
    use super::*;
    use crate::{project, model::TextPatch};
    #[test]
    fn linked_annotation_survives_edits_snapshots_and_restoration() {
        let temp = tempfile::tempdir().unwrap();
        let root=temp.path();
        let p=project::create(root,"Ancres").unwrap();
        let id=&p.sections[0].id;
        project::save(root,vec![TextPatch{writing_aids:None,id:id.clone(),revision:0,text:"Une phrase.".into(),outline:None}]).unwrap();
        let anchor=DocumentAnchor {version:1,source_id:"source".into(),vault_id:"vault".into(),path:"Feuille.pdf".into(),
            fingerprint:"empreinte".into(),page:2,rectangles:vec![[0.1,0.2,0.4,0.3]],quote:"extrait".into(),before:"".into(),after:"".into()};
        assert!(create_linked(root,id,1,0,3,"Note",Some(anchor.clone()),Some("ancienne"),None).is_err());
        assert!(list(root).unwrap().is_empty());
        let a=create_linked(root,id,1,0,3,"Note",Some(anchor),Some("main"),Some("a27cf040-fe73-414c-982f-8db7a0358644")).unwrap();
        assert_eq!(create_linked(root,id,1,0,3,"Note",a.document.clone(),Some("main"),Some(&a.id)).unwrap().id,a.id);
        assert_eq!(list(root).unwrap().len(),1);
        let v=crate::history::capture(root,"Ancre",Some(id.clone())).unwrap();
        let b=update(root,&a.id,0,"Note modifiée",true).unwrap();
        assert_eq!(b.document.unwrap().page,2);
        crate::history::restore(root,&v.id).unwrap();
        let restored=list(root).unwrap().pop().unwrap();
        assert_eq!(restored.note,"Note");
        assert_eq!(restored.document, a.document);

        crate::history::create_branch(root, "Variante", None).unwrap();
        let variant = crate::history::history_state(root).unwrap().active_branch;
        let mut replacement = a.document.clone().unwrap();
        replacement.page = 3;
        let modified = update_linked(
            root, &a.id, restored.revision, "Autre page", false,
            Some(replacement.clone()), Some(&variant),
        ).unwrap();
        assert_eq!(modified.document, Some(replacement.clone()));
        crate::history::switch_branch(root, "main").unwrap();
        assert_eq!(list(root).unwrap()[0].document, a.document);
        crate::history::switch_branch(root, &variant).unwrap();
        assert_eq!(list(root).unwrap()[0].document.as_ref(), Some(&replacement));

        // The selected word moves to the second scene on split and back on join.
        let op = project::manuscript::Operation {
            action: "split".into(), source_id: id.clone(), target_id: None,
            offset: Some(4), title: None,
        };
        let revision = project::load(root).unwrap().sections[0].revision;
        let linked = create_linked(
            root, id, revision, 4, 10, "Relire", Some(replacement.clone()), Some(&variant), None,
        ).unwrap();
        let changed = project::manuscript::apply(root, op.clone()).unwrap();
        let relocated = || list(root).unwrap().into_iter().find(|item| item.id == linked.id).unwrap();
        assert_eq!(relocated().section, changed.sections[1].id);
        assert_eq!(relocated().document.as_ref(), Some(&replacement));
        project::manuscript::apply(root, project::manuscript::Operation {
            action: "join".into(), target_id: Some(changed.sections[1].id.clone()), ..op
        }).unwrap();
        assert_eq!(&relocated().section, id);
        assert_eq!(relocated().document.as_ref(), Some(&replacement));
    }
    #[test]
    fn annotation_follows_its_passage_through_split_and_join() {
        let temp = tempfile::tempdir().unwrap();
        let p = project::create(temp.path(),"Essai").unwrap();
        let id = p.sections[0].id.clone();
        project::save(temp.path(),vec![TextPatch{ writing_aids: None,id:id.clone(),revision:0,text:"Alpha\n\nBeta\n\nGamma.".into(),outline:None}]).unwrap();
        create(temp.path(),&id,1,7,11,"Relire").unwrap();
        let op = super::super::manuscript::Operation {action:"split".into(),source_id:id.clone(),
            target_id:None,offset:Some(7),title:None};
        let p = project::manuscript::apply(temp.path(),op.clone()).unwrap();
        assert_eq!(list(temp.path()).unwrap()[0].section,p.sections[1].id);
        project::manuscript::apply(temp.path(),super::super::manuscript::Operation{action:"join".into(),
            target_id:Some(p.sections[1].id.clone()),..op}).unwrap();
        assert_eq!(list(temp.path()).unwrap()[0].section,id);
    }
}
