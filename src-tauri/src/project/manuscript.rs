use crate::{error::{AppResult, Result}, model::Project};
use rusqlite::{params, TransactionBehavior};
use serde::Deserialize;
use std::path::Path;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub action: String,
    pub source_id: String,
    pub target_id: Option<String>,
    pub offset: Option<usize>,
    pub title: Option<String>,
}
fn byte_offset(text: &str, utf16: usize) -> Result<usize> {
    let mut count = 0;
    for (index, ch) in text.char_indices() {
        if count == utf16 { return Ok(index); }
        count += ch.len_utf16();
        if count > utf16 { break; }
    }
    if count == utf16 { Ok(text.len()) } else { Err("Position de texte invalide.".into()) }
}
pub fn apply(root: &Path, op: Operation) -> Result<Project> {
    let mut c = super::database(root)?;
    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).app()?;
    let mut all = super::all_sections(&tx)?;
    let source = all.iter().position(|s| s.id == op.source_id && s.kind == "scene" && !s.trashed).ok_or("Scène introuvable.")?;
    let before = all.clone();
    match op.action.as_str() {
        "split" => {
            let byte = byte_offset(&all[source].text, op.offset.ok_or("Position manquante.")?)?;
            if byte == 0 || byte == all[source].text.len() { return Err("Placez le curseur à l’intérieur du texte.".into()); }
            let mut second = all[source].clone();
            second.id = uuid::Uuid::new_v4().to_string();
            second.title = op.title.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned).unwrap_or_else(||format!("{} — suite", second.title));
            second.text = all[source].text[byte..].into();
            second.revision = 0; second.outline = None; second.synopsis.clear(); second.goal = 0;
            all[source].text.truncate(byte); all[source].outline = None; all[source].revision += 1;
            all.insert(source+1, second);
        }
        "join" => {
            let target = all.iter().position(|s| Some(&s.id) == op.target_id.as_ref() && s.kind == "scene" && !s.trashed).ok_or("Scène suivante introuvable.")?;
            let siblings: Vec<_> = all.iter().filter(|s|s.kind == "scene" && !s.trashed && s.parent == all[source].parent && s.role == all[source].role).map(|s|s.id.as_str()).collect();
            let i = siblings.iter().position(|id|*id == op.source_id).ok_or("Scène introuvable.")?;
            if siblings.get(i+1) != Some(&all[target].id.as_str()) { return Err("Choisissez deux scènes consécutives du même emplacement.".into()); }
            let separator = if all[source].text.is_empty() || all[target].text.is_empty() { "" } else { "\n\n" };
            all[source].text = format!("{}{}{}", all[source].text, separator, all[target].text);
            all[source].outline = None; all[source].revision += 1; all[target].trashed = true;
        }
        _ => return Err("Opération inconnue.".into()),
    }
    tx.execute("DELETE FROM structure_history", []).app()?;
    for (position, s) in all.iter_mut().enumerate() {
        s.position = position as i64;
        tx.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET position=excluded.position,text=excluded.text,revision=excluded.revision,outline=excluded.outline,trashed=excluded.trashed", params![s.id,s.parent,s.title,s.kind,s.position,s.text,s.revision,s.synopsis,s.status,s.goal,s.outline.as_ref().map(serde_json::to_string).transpose().app()?,s.role,s.trashed,s.included]).app()?;
    }
    super::annotations::relocate(&tx,&op,&before,&all)?;
    tx.commit().app()?;
    let mut p = super::load(root)?; p.recovered = false; Ok(p)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_and_join_keep_plain_text_without_new_safety_versions() {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::project::create(dir.path(),"Essai").unwrap();
        crate::project::save(dir.path(),vec![crate::model::TextPatch{id:p.sections[0].id.clone(),revision:0,text:"Un\n\nDeux".into(),outline:None}]).unwrap();
        let op = Operation {action:"split".into(),source_id:p.sections[0].id.clone(),offset:Some(4),target_id:None,title:None};
        let split = apply(dir.path(),op.clone()).unwrap();
        assert_eq!(split.sections.iter().map(|s|s.text.as_str()).collect::<Vec<_>>(),vec!["Un\n\n","Deux"]);
        assert!(crate::history::list(dir.path()).unwrap().is_empty());
        let joined = apply(dir.path(),Operation{action:"join".into(),target_id:Some(split.sections[1].id.clone()),..op}).unwrap();
        assert_eq!(joined.sections.len(),1); assert_eq!(joined.trash.len(),1);
        assert!(joined.sections[0].text.contains("Deux"));
        assert!(crate::history::list(dir.path()).unwrap().is_empty());
        let bad: Operation = serde_json::from_value(serde_json::json!({"action":"movePassage","sourceId":joined.sections[0].id})).unwrap();
        assert!(apply(dir.path(),bad).unwrap_err().contains("inconnue"));
    }
}
