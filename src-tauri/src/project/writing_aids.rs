use crate::{
    error::Result,
    model::{WritingAid, WritingAidKind},
};
use std::collections::{HashMap, HashSet};

pub const BLANK: &str = "[…]";

pub fn detach(aids: &mut [WritingAid]) {
    for aid in aids {
        aid.from = None;
    }
}

pub fn validate(text: &str, aids: &[WritingAid]) -> Result<()> {
    if aids.is_empty() {
        return Ok(());
    }
    let mut ids = HashSet::new();
    let mut anchors = HashSet::new();
    let mut offsets = HashMap::new();
    for aid in aids {
        super::validate_id(&aid.id)?;
        if !ids.insert(&aid.id)
            || aid.value.encode_utf16().count() > 4_000
            || aid.quote.trim().is_empty()
            || aid.quote.encode_utf16().count() > 4_000
            || aid.quote.contains('\r')
            || aid.value.contains(['\r', '\n'])
            || (aid.kind == WritingAidKind::Blank && aid.quote != BLANK)
        {
            return Err("Repère d’écriture invalide.".into());
        }
        if let Some(from) = aid.from {
            if !anchors.insert((from, &aid.quote, aid.kind == WritingAidKind::Blank)) {
                return Err("Repères d’écriture en double.".into());
            }
            offsets.insert(from, None);
        }
    }
    if offsets.is_empty() {
        return Ok(());
    }
    let mut position = 0;
    for (byte, ch) in text.char_indices() {
        if let Some(value) = offsets.get_mut(&position) {
            *value = Some(byte);
        }
        position += ch.len_utf16();
    }
    for aid in aids {
        if let Some(from) = aid.from {
            let byte = offsets.get(&from).copied().flatten();
            if !byte.is_some_and(|byte| text[byte..].starts_with(&aid.quote)) {
                return Err("Le repère d’écriture ne correspond plus au texte.".into());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{export, history, model::TextPatch, project};

    #[test]
    fn migrates_v5_and_keeps_private_data_in_checkpoints_not_exports() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("projet");
        let initial = project::create(&root, "Témoin").unwrap();
        let id = initial.sections[0].id.clone();
        let c = project::database(&root).unwrap();
        c.execute_batch("ALTER TABLE sections DROP COLUMN writing_aids; PRAGMA user_version=5;")
            .unwrap();
        drop(c);
        let migrated = project::load(&root).unwrap();
        assert!(migrated.sections[0].writing_aids.is_empty());
        let copy = std::fs::read_dir(root.join("recuperation"))
            .unwrap()
            .flatten()
            .find(|item| {
                item.file_name()
                    .to_string_lossy()
                    .starts_with("avant-reperes-ecriture")
            })
            .unwrap();
        let old = rusqlite::Connection::open(copy.path()).unwrap();
        assert_eq!(
            old.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
                .unwrap(),
            5
        );

        let text = "😀 […]\n\nLe vieux phare.";
        let blank = WritingAid {
            id: "blanc".into(),
            kind: WritingAidKind::Blank,
            from: Some(3),
            quote: BLANK.into(),
            value: "Indice strictement privé.".into(),
        };
        let trial = WritingAid {
            id: "essai".into(),
            kind: WritingAidKind::Trial,
            from: Some(8),
            quote: "Le vieux phare.".into(),
            value: "Les murs penchaient.".into(),
        };
        let patch = |revision, text: &str, writing_aids| TextPatch {
            id: id.clone(),
            revision,
            text: text.into(),
            outline: None,
            writing_aids,
        };
        let aids = vec![blank.clone(), trial.clone()];
        let saved = project::save(&root, vec![patch(0, text, Some(aids.clone()))]).unwrap();
        let version = history::capture(&root, "Avant choix", Some(id.clone())).unwrap();
        let resources = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let md = dir.path().join("avant.md");
        export::export(&root, &resources, &md, "md", None).unwrap();
        let before = std::fs::read_to_string(&md).unwrap();
        assert!(before.contains(text));
        assert!(!before.contains(&blank.value));
        assert!(!before.contains(&trial.value));
        let docx = dir.path().join("avant.docx");
        export::export(&root, &resources, &docx, "docx", None).unwrap();
        use std::io::Read;
        let mut archive = zip::ZipArchive::new(std::fs::File::open(docx).unwrap()).unwrap();
        let mut body = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut body)
            .unwrap();
        assert!(
            body.contains(BLANK)
                && body.contains(&trial.quote)
                && !body.contains(&trial.value)
                && !body.contains(&blank.value)
        );
        assert!(project::save(
            &root,
            vec![patch(saved[0].revision, "Autre texte", Some(aids.clone()))]
        )
        .is_err());
        assert_eq!(project::load(&root).unwrap().sections[0].writing_aids, aids);

        let adopted = format!("😀 […]\n\n{}", trial.value);
        project::save(
            &root,
            vec![patch(saved[0].revision, &adopted, Some(vec![blank]))],
        )
        .unwrap();
        export::export(&root, &resources, &md, "md", None).unwrap();
        assert!(std::fs::read_to_string(&md).unwrap().contains(&adopted));
        let restored = history::restore(&root, &version.id).unwrap();
        assert_eq!(restored.sections[0].writing_aids, aids);
        let split = project::manuscript::apply(
            &root,
            project::manuscript::Operation {
                action: "split".into(),
                source_id: id.clone(),
                target_id: None,
                offset: Some(8),
                title: None,
            },
        )
        .unwrap();
        assert_eq!(split.sections[0].writing_aids, aids[..1]);
        assert_eq!(split.sections[1].writing_aids[0].from, Some(0));
        let joined = project::manuscript::apply(
            &root,
            project::manuscript::Operation {
                action: "join".into(),
                source_id: id.clone(),
                target_id: Some(split.sections[1].id.clone()),
                offset: None,
                title: None,
            },
        )
        .unwrap();
        assert_eq!(joined.sections[0].writing_aids[1].from, Some(10));
        let mirror = root.join("manuscrit").join(format!("{id}.md"));
        std::fs::write(mirror, "Texte externe").unwrap();
        let resolved = project::resolve_external(&root, &id, false, None, None).unwrap();
        assert_eq!(resolved.sections[0].writing_aids[1].from, None);
        assert_eq!(resolved.sections[0].writing_aids[1].value, trial.value);
    }
}
