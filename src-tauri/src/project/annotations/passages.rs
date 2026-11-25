use super::*;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Passage {
    pub section: String,
    pub quote: String,
    pub before: String,
    pub after: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene_revision: Option<i64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub detached: bool,
}

impl Passage {
    pub(super) fn at(s: &Section, from: usize, to: usize) -> Result<Self> {
        let (quote, before, after) = anchor(s, from, to)?;
        Ok(Self {
            section: s.id.clone(),
            quote,
            before,
            after,
            offset: Some(from),
            scene_revision: Some(s.revision),
            detached: false,
        })
    }

    // A captured offset is authoritative only on its original revision.
    fn checked(&self, tx: &Connection, allow_detached: bool) -> Result<Self> {
        if self.quote.is_empty()
            || self.quote.encode_utf16().count() > 10000
            || self.before.chars().count() > 48
            || self.after.chars().count() > 48
        {
            return Err("Sélection invalide.".into());
        }
        let size = self.quote.encode_utf16().count();
        if let Some(s) =
            super::super::section(tx, &self.section)?.filter(|s| !s.trashed && s.kind == "scene")
        {
            if let Some(offset) = self
                .offset
                .filter(|_| Some(s.revision) == self.scene_revision)
            {
                if let Some(end) = offset.checked_add(size) {
                    if let Ok(p) = Self::at(&s, offset, end) {
                        if p.quote == self.quote && p.before == self.before && p.after == self.after
                        {
                            return Ok(p);
                        }
                    }
                }
            }
        }
        let mut found = None;
        for s in super::super::sections(tx)?
            .into_iter()
            .filter(|s| !s.trashed && s.kind == "scene")
        {
            for (at, _) in s
                .text
                .char_indices()
                .filter(|(i, _)| s.text[*i..].starts_with(&self.quote))
            {
                if !s.text[..at].ends_with(&self.before)
                    || !s.text[at + self.quote.len()..].starts_with(&self.after)
                {
                    continue;
                }
                if self.before.is_empty() && self.after.is_empty() && s.id != self.section {
                    continue;
                }
                if found.is_some() {
                    return self.unresolved(allow_detached);
                }
                let offset = s.text[..at].encode_utf16().count();
                found = Some(Self::at(&s, offset, offset + size)?);
            }
        }
        match found {
            Some(p) => Ok(p),
            None => self.unresolved(allow_detached),
        }
    }

    fn unresolved(&self, allowed: bool) -> Result<Self> {
        if !allowed {
            return Err("Passage modifié ou ambigu.".into());
        }
        Ok(Self {
            detached: true,
            ..self.clone()
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PassageAction {
    Link {
        origin: Passage,
        destination: Passage,
        caption: String,
    },
    Dictation {
        origin: Passage,
        note: String,
    },
    Reattach {
        selection: Passage,
        destination: bool,
        revision: i64,
    },
}

pub fn apply(root: &Path, branch: &str, id: &str, action: PassageAction) -> Result<Annotation> {
    let id = uuid::Uuid::parse_str(id).app()?.to_string();
    let mut c = database(root)?;
    let tx = c
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .app()?;
    check_branch(&tx, Some(branch), true)?;
    let raw: Option<String> = tx
        .query_row("SELECT payload FROM annotations WHERE id=?", [&id], |r| {
            r.get(0)
        })
        .optional()
        .app()?;
    let existing = raw
        .map(|raw| serde_json::from_str::<Annotation>(&raw))
        .transpose()
        .app()?;
    let value = if let PassageAction::Reattach {
        selection,
        destination,
        revision,
    } = action
    {
        let mut value = existing.ok_or("Annotation introuvable.")?;
        if value.revision != revision {
            return Err("L’annotation a changé. Rechargez-la.".into());
        }
        let selected = selection.checked(&tx, false)?;
        if destination {
            *value.peer.as_mut().ok_or("Lien introuvable.")? = selected
        } else {
            value.passage = selected
        }
        value.revision += 1;
        value
    } else {
        let receipt = format!("{:x}", Sha256::digest(serde_json::to_vec(&action).app()?));
        if let Some(value) = existing {
            return if value.receipt.as_ref() == Some(&receipt) {
                Ok(value)
            } else {
                Err("Identité d’annotation déjà utilisée.".into())
            };
        }
        let (passage, peer, note) = match action {
            PassageAction::Dictation { origin, note } if !note.trim().is_empty() => {
                (origin.checked(&tx, true)?, None, note)
            }
            PassageAction::Link {
                origin,
                destination,
                caption,
            } => (
                origin.checked(&tx, false)?,
                Some(destination.checked(&tx, false)?),
                caption,
            ),
            _ => return Err("Annotation vide.".into()),
        };
        if note.len() > 20000 {
            return Err("Annotation trop longue.".into());
        }
        Annotation {
            id,
            passage,
            peer,
            note: note.trim().into(),
            receipt: Some(receipt),
            document: None,
            revision: 0,
            done: false,
            created: chrono::Utc::now().to_rfc3339(),
        }
    };
    tx.execute("INSERT INTO annotations(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",params![value.id,serde_json::to_string(&value).app()?]).app()?;
    tx.commit().app()?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{history, model::TextPatch, project};
    #[test]
    fn v7_document_annotations_and_backup_keep_their_original_payload() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let scene = project::create(root, "Migration")
            .unwrap()
            .sections
            .remove(0);
        let payload = serde_json::json!({
            "id":"old", "section":scene.id, "quote":"Élise", "before":"", "after":"",
            "note":"Source", "done":true, "created":"2026-11-01", "revision":1,
            "document":{"version":1,"sourceId":"doc","vaultId":"vault","path":"source.pdf",
                "fingerprint":"abc","page":2,"rectangles":[[0.0,0.0,1.0,1.0]],"quote":"quai","before":"","after":""}
        }).to_string();
        let original = database(root).unwrap();
        original
            .execute("INSERT INTO annotations VALUES ('old',?)", [&payload])
            .unwrap();
        original.pragma_update(None, "user_version", 7).unwrap();
        drop(original);
        let note = list(root).unwrap().remove(0);
        assert!(note.passage.offset.is_none() && note.peer.is_none() && note.done);
        assert_eq!(note.document.unwrap().page, 2);
        let copy = std::fs::read_dir(root.join("recuperation"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("avant-liens-passages-")
            })
            .unwrap();
        let backup = Connection::open(copy).unwrap();
        for (connection, version) in [(backup, 7), (database(root).unwrap(), 8)] {
            assert_eq!(
                connection
                    .pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
                    .unwrap(),
                version
            );
            assert_eq!(
                connection
                    .query_row::<String, _, _>(
                        "SELECT payload FROM annotations WHERE id='old'",
                        [],
                        |r| r.get(0)
                    )
                    .unwrap(),
                payload
            );
        }
    }

    #[test]
    fn links_survive_split_scoped_restore_and_retries() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let scene = project::create(root, "Passages")
            .unwrap()
            .sections
            .remove(0);
        let text = "Élise 😀 arrive. Paul attend.";
        project::save(
            root,
            vec![TextPatch {
                id: scene.id.clone(),
                text: text.into(),
                revision: 0,
                outline: None,
                writing_aids: None,
            }],
        )
        .unwrap();
        let s = project::load(root).unwrap().sections.remove(0);
        let id = uuid::Uuid::new_v4().to_string();
        let link = || PassageAction::Link {
            origin: Passage::at(&s, 0, 5).unwrap(),
            destination: Passage::at(&s, 17, 21).unwrap(),
            caption: String::new(),
        };
        let first = apply(root, "main", &id, link()).unwrap();
        assert_eq!(first.peer.unwrap().quote, "Paul");
        let divided = project::manuscript::apply(
            root,
            project::manuscript::Operation {
                action: "split".into(),
                source_id: s.id.clone(),
                target_id: None,
                offset: Some(17),
                title: None,
            },
        )
        .unwrap();
        let b = &divided.sections[1];
        let relocated = apply(root, "main", &id, link()).unwrap();
        assert_eq!(relocated.peer.as_ref().unwrap().section, b.id);
        let version = history::capture(root, "Destination", Some(b.id.clone())).unwrap();
        let changed = apply(
            root,
            "main",
            &id,
            PassageAction::Reattach {
                selection: Passage::at(b, 5, 11).unwrap(),
                destination: true,
                revision: relocated.revision,
            },
        )
        .unwrap();
        update_linked(
            root,
            &id,
            changed.revision,
            "Légende tardive",
            false,
            None,
            Some("main"),
        )
        .unwrap();
        history::restore(root, &version.id).unwrap();
        let items = list(root).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].peer.as_ref().unwrap().quote, "Paul");
        assert_eq!(items[0].note, "Légende tardive");
        assert_eq!(items[0].passage.section, s.id);
    }
    #[test]
    fn transcribed_note_is_recoverable_after_deletion_and_refused_on_another_branch() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let scene = project::create(root, "Dictée").unwrap().sections.remove(0);
        let save = |revision, text: &str| {
            project::save(
                root,
                vec![TextPatch {
                    id: scene.id.clone(),
                    text: text.into(),
                    revision,
                    outline: None,
                    writing_aids: None,
                }],
            )
            .unwrap()
        };
        save(0, "Texte conservé.");
        let s = project::load(root).unwrap().sections.remove(0);
        let action = || PassageAction::Dictation {
            origin: Passage::at(&s, 0, 5).unwrap(),
            note: "Note dictée".into(),
        };
        let id = uuid::Uuid::new_v4().to_string();
        save(1, "Autre phrase.");
        assert!(apply(root, "ancienne", &id, action()).is_err());
        assert!(apply(root, "main", &id, action()).unwrap().passage.detached);
        assert_eq!(apply(root, "main", &id, action()).unwrap().revision, 0);
        assert_eq!(list(root).unwrap().len(), 1);
        assert_eq!(
            project::load(root).unwrap().sections[0].text,
            "Autre phrase."
        );
    }
}
