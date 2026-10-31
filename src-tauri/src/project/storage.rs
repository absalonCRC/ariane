use crate::{
    error::{AppResult, Result},
    model::*,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};
pub fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
pub fn database(root: &Path) -> Result<Connection> {
    let mut c = Connection::open(root.join("ariane.sqlite")).app()?;
    c.busy_timeout(std::time::Duration::from_secs(5)).app()?;
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sections(id TEXT PRIMARY KEY,parent TEXT,title TEXT NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL,text TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,synopsis TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Brouillon',goal INTEGER NOT NULL DEFAULT 0,mirror TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL,scope TEXT,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS vaults(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,scope TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS links(section TEXT,source TEXT,payload TEXT,PRIMARY KEY(section,source));
 CREATE TABLE IF NOT EXISTS citations(id TEXT PRIMARY KEY,payload TEXT NOT NULL);").app()?;
    let has_outline = c
        .prepare("PRAGMA table_info(sections)")
        .app()?
        .query_map([], |r| r.get::<_, String>(1))
        .app()?
        .collect::<std::result::Result<Vec<_>, _>>()
        .app()?
        .iter()
        .any(|name| name == "outline");
    let marker: Option<String> = c.query_row(
        "SELECT value FROM meta WHERE key='outline_schema_version'", [], |r| r.get(0),
    ).optional().app()?;
    if !has_outline || marker.as_deref() != Some("1") {
        let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).app()?;
        let column_now_exists = tx
            .prepare("PRAGMA table_info(sections)")
            .app()?
            .query_map([], |r| r.get::<_, String>(1))
            .app()?
            .collect::<std::result::Result<Vec<_>, _>>()
            .app()?
            .iter()
            .any(|name| name == "outline");
        if !column_now_exists {
            tx.execute("ALTER TABLE sections ADD COLUMN outline TEXT", []).app()?;
        }
        tx.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('outline_schema_version','1')", []).app()?;
        tx.commit().app()?;
    }
    Ok(c)
}
pub fn create(root: &Path, name: &str) -> Result<Project> {
    if name.trim().is_empty() {
        return Err("Le projet doit avoir un nom.".into());
    }
    if root.join("ariane.sqlite").exists() {
        return Err("Ce dossier contient déjà un projet.".into());
    }
    fs::create_dir_all(root).app()?;
    let c = database(root)?;
    c.execute("INSERT INTO meta VALUES('name',?)", [name])
        .app()?;
    c.execute("INSERT INTO meta VALUES('settings','{}')", [])
        .app()?;
    add(root, None, "Sans titre", "scene")?;
    load(root)
}
pub fn sections(c: &Connection) -> Result<Vec<Section>> {
    let mut q=c.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline FROM sections ORDER BY position,id").app()?;
    let rows = q
        .query_map([], row_section)
        .app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}
pub fn section(c: &Connection, id: &str) -> Result<Option<Section>> {
    c.query_row("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline FROM sections WHERE id=?", [id], row_section)
        .optional().app()
}
fn row_section(r: &Row<'_>) -> rusqlite::Result<Section> {
    let raw: Option<String> = r.get(10)?;
    let outline = raw
        .map(|json| {
            serde_json::from_str(&json).map_err(|err| rusqlite::Error::FromSqlConversionFailure(
                10, rusqlite::types::Type::Text, Box::new(err),
            ))
        })
        .transpose()?;
    Ok(Section {
        id: r.get(0)?, parent: r.get(1)?, title: r.get(2)?, kind: r.get(3)?,
        position: r.get(4)?, text: r.get(5)?, revision: r.get(6)?,
        synopsis: r.get(7)?, status: r.get(8)?, goal: r.get(9)?, outline,
    })
}
pub fn load(root: &Path) -> Result<Project> {
    if !root.join("ariane.sqlite").is_file() {
        return Err("Ce dossier ne contient pas de projet Ariane.".into());
    }
    let c = database(root)?;
    let mut recovered = false;
    let mut conflicts = vec![];
    let all = sections(&c)?;
    let mirrors = {
        let mut query = c.prepare("SELECT id,mirror FROM sections").app()?;
        let rows = query.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).app()?;
        rows.collect::<std::result::Result<std::collections::HashMap<_,_>,_>>().app()?
    };
    for s in &all {
        if s.kind != "scene" {
            continue;
        }
        let file = root.join("manuscrit").join(format!("{}.md", s.id));
        let stored = mirrors.get(&s.id).map(String::as_str).unwrap_or_default();
        if file.exists() {
            let disk = fs::read_to_string(&file).app()?;
            if hash(&disk) != stored && !stored.is_empty() {
                conflicts.push(s.id.clone());
                continue;
            }
        }
        if stored != hash(&s.text) || !file.exists() {
            mirror(root, &c, s)?;
            recovered |= !stored.is_empty();
        }
    }
    let name = c
        .query_row("SELECT value FROM meta WHERE key='name'", [], |r| r.get(0))
        .app()?;
    let settings: String = c
        .query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
            r.get(0)
        })
        .unwrap_or("{}".into());
    Ok(Project {
        path: root.to_string_lossy().into(),
        name,
        sections: all,
        settings: serde_json::from_str(&settings).unwrap_or_default(),
        recovered,
        conflicts,
    })
}
fn atomic(path: &Path, text: &str) -> Result<()> {
    use std::io::Write;
    let temp = path.with_extension("tmp");
    let mut f = fs::File::create(&temp).app()?;
    f.write_all(text.as_bytes()).app()?;
    f.sync_all().app()?;
    fs::rename(temp, path).app()?;
    if let Some(parent) = path.parent() {
        fs::File::open(parent).and_then(|f| f.sync_all()).app()?;
    }
    Ok(())
}
fn mirror(root: &Path, c: &Connection, s: &Section) -> Result<()> {
    fs::create_dir_all(root.join("manuscrit")).app()?;
    atomic(
        &root.join("manuscrit").join(format!("{}.md", s.id)),
        &s.text,
    )?;
    c.execute(
        "UPDATE sections SET mirror=? WHERE id=?",
        params![hash(&s.text), s.id],
    )
    .app()?;
    Ok(())
}
pub fn save(root: &Path, patches: Vec<TextPatch>) -> Result<Vec<Section>> {
    let mut c = database(root)?;
    // Automatic section history is throttled independently of durable autosave.
    let mut captures = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for patch in &patches {
        if !seen.insert(&patch.id) {
            return Err("Une section ne peut être sauvegardée deux fois dans le même lot.".into());
        }
        let (rev, old, raw, mir): (i64, String, Option<String>, String) = c
            .query_row("SELECT revision,text,outline,mirror FROM sections WHERE id=?", [&patch.id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .app()?;
        if rev != patch.revision {
            return Err("Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into());
        }
        let old_outline = raw.map(|json| serde_json::from_str::<Outline>(&json).app()).transpose()?;
        let next_outline = effective_outline(patch, &old, old_outline.clone())?;
        let file = root.join("manuscrit").join(format!("{}.md", patch.id));
        if file.exists() && !mir.is_empty() && hash(&fs::read_to_string(&file).app()?) != mir {
            return Err(format!("EXTERNAL:{}", patch.id));
        }
        if (old != patch.text && !old.is_empty()) || (old == patch.text && old_outline != next_outline) {
            let last:String=c.query_row("SELECT created FROM versions WHERE scope=? AND name='Sauvegarde automatique' ORDER BY created DESC LIMIT 1",[&patch.id],|r|r.get(0)).unwrap_or_default();
            let due = chrono::DateTime::parse_from_rfc3339(&last).map_or(true, |t| {
                chrono::Utc::now().signed_duration_since(t).num_minutes() >= 5
            });
            if due {
                captures.push(patch.id.clone());
            }
        }
    }
    for id in captures {
        crate::history::capture(root, "Sauvegarde automatique", Some(id))?;
    }
    let tx = c.transaction().app()?;
    for p in &patches {
        let (rev, old, raw, mir): (i64, String, Option<String>, String) = tx
            .query_row(
                "SELECT revision,text,outline,mirror FROM sections WHERE id=?",
                [&p.id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .app()?;
        if rev != p.revision {
            return Err("Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into());
        }
        let file = root.join("manuscrit").join(format!("{}.md", p.id));
        if file.exists() && !mir.is_empty() && hash(&fs::read_to_string(&file).app()?) != mir {
            return Err(format!("EXTERNAL:{}", p.id));
        }
        let old_outline = raw.map(|json| serde_json::from_str::<Outline>(&json).app()).transpose()?;
        let next_outline = effective_outline(p, &old, old_outline.clone())?;
        if old != p.text || old_outline != next_outline {
            let encoded = next_outline.map(|outline| serde_json::to_string(&outline).app()).transpose()?;
            tx.execute(
                "UPDATE sections SET text=?,outline=?,revision=revision+1 WHERE id=?",
                params![p.text, encoded, p.id],
            )
            .app()?;
        }
    }
    tx.commit().app()?;
    let mut all = Vec::new();
    for p in patches {
        let mut q = c.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline FROM sections WHERE id=?").app()?;
        let s = q
            .query_row([p.id], row_section)
            .app()?;
        mirror(root, &c, &s)?;
        all.push(s);
    }
    Ok(all)
}
fn effective_outline(patch: &TextPatch, old_text: &str, old: Option<Outline>) -> Result<Option<Outline>> {
    let next = if let Some(outline) = &patch.outline {
        Some(outline.clone())
    } else if old_text == patch.text {
        old
    } else {
        None
    };
    if let Some(outline) = &next {
        super::outline::validate(outline, &patch.text)?;
    }
    Ok(next)
}
pub fn add(root: &Path, parent: Option<String>, title: &str, kind: &str) -> Result<Vec<Section>> {
    if !["folder", "chapter", "scene"].contains(&kind) {
        return Err("Type de section inconnu.".into());
    }
    let c = database(root)?;
    if let Some(p) = &parent {
        let exists: bool = c
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sections WHERE id=?)",
                [p],
                |r| r.get(0),
            )
            .app()?;
        if !exists {
            return Err("Section parente introuvable.".into());
        }
    }
    let pos: i64 = c
        .query_row(
            "SELECT COALESCE(MAX(position),0)+1 FROM sections",
            [],
            |r| r.get(0),
        )
        .app()?;
    c.execute(
        "INSERT INTO sections(id,parent,title,kind,position) VALUES(?,?,?,?,?)",
        params![uuid::Uuid::new_v4().to_string(), parent, title, kind, pos],
    )
    .app()?;
    sections(&c)
}
pub fn update(root: &Path, s: &Section) -> Result<Vec<Section>> {
    let c = database(root)?;
    c.execute(
        "UPDATE sections SET title=?,synopsis=?,status=?,goal=? WHERE id=?",
        params![s.title, s.synopsis, s.status, s.goal.max(0), s.id],
    )
    .app()?;
    sections(&c)
}
pub fn reorder(
    root: &Path,
    ids: &[String],
    id: &str,
    parent: Option<String>,
) -> Result<Vec<Section>> {
    let mut c = database(root)?;
    let all = sections(&c)?;
    if ids.len() != all.len()
        || all
            .iter()
            .any(|s| ids.iter().filter(|v| **v == s.id).count() != 1)
    {
        return Err("Ordre de sections invalide.".into());
    }
    let mut cursor = parent.clone();
    let mut seen = std::collections::HashSet::new();
    while let Some(p) = cursor {
        if p == id || !seen.insert(p.clone()) {
            return Err("Un dossier ne peut pas être placé dans lui-même.".into());
        }
        cursor = all
            .iter()
            .find(|s| s.id == p)
            .ok_or("Parent introuvable")?
            .parent
            .clone()
    }
    let tx = c.transaction().app()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE sections SET position=? WHERE id=?",
            params![i as i64, id],
        )
        .app()?;
    }
    tx.execute(
        "UPDATE sections SET parent=? WHERE id=?",
        params![parent, id],
    )
    .app()?;
    tx.commit().app()?;
    sections(&c)
}
pub fn settings(root: &Path, value: serde_json::Value) -> Result<()> {
    database(root)?
        .execute(
            "INSERT OR REPLACE INTO meta VALUES('settings',?)",
            [value.to_string()],
        )
        .app()?;
    Ok(())
}
pub fn resolve_external(
    root: &Path,
    id: &str,
    keep_local: bool,
    pending: Option<String>,
) -> Result<Project> {
    let c = database(root)?;
    let s = sections(&c)?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or("Section introuvable")?;
    let file = root.join("manuscrit").join(format!("{}.md", s.id));
    let disk = fs::read_to_string(&file).app()?;
    // Preserve both versions before resolution, even if the user chooses one.
    let dir = root.join("recuperation");
    fs::create_dir_all(&dir).app()?;
    atomic(
        &dir.join(format!(
            "{}-{}.md",
            s.id,
            chrono::Utc::now().timestamp_millis()
        )),
        if keep_local {
            &disk
        } else {
            pending.as_deref().unwrap_or(&s.text)
        },
    )?;
    if keep_local {
        let mut s = s;
        if let Some(text) = pending {
            if text != s.text {
                s.outline = None;
            }
            s.text = text;
            c.execute(
                "UPDATE sections SET text=?,outline=?,revision=revision+1 WHERE id=?",
                params![s.text, s.outline.as_ref().map(serde_json::to_string).transpose().app()?, id],
            )
            .app()?;
        }
        mirror(root, &c, &s)?
    } else {
        let outline = if disk == s.text {
            s.outline.as_ref().map(serde_json::to_string).transpose().app()?
        } else {
            None
        };
        c.execute(
            "UPDATE sections SET text=?,outline=?,mirror=?,revision=revision+1 WHERE id=?",
            params![disk, outline, hash(&disk), id],
        )
        .app()?;
    }
    load(root)
}
#[cfg(test)]
pub fn scene_path(root: &Path, id: &str) -> std::path::PathBuf {
    root.join("manuscrit").join(format!("{id}.md"))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn outline(nodes: &[(&str, Option<&str>, usize)]) -> Outline {
        Outline {
            version: 1,
            nodes: nodes
                .iter()
                .map(|(id, parent, start)| OutlineNode {
                    id: (*id).into(),
                    parent: parent.map(str::to_owned),
                    start: *start,
                })
                .collect(),
        }
    }
    #[test]
    fn structured_save_reopens_and_metadata_change_increments_revision() {
        let d = tempfile::tempdir().unwrap();
        let s = create(d.path(), "A").unwrap().sections.remove(0);
        let first = outline(&[("a", None, 0), ("b", Some("a"), 2)]);
        let saved = save(d.path(), vec![TextPatch {
            id: s.id.clone(), revision: 0, text: "A\nB".into(), outline: Some(first.clone()),
        }]).unwrap();
        assert_eq!(saved[0].revision, 1);
        assert_eq!(load(d.path()).unwrap().sections[0].outline, Some(first));
        let second = outline(&[("a", None, 0), ("b", None, 2)]);
        let saved = save(d.path(), vec![TextPatch {
            id: s.id.clone(), revision: 1, text: "A\nB".into(), outline: Some(second.clone()),
        }]).unwrap();
        assert_eq!(saved[0].revision, 2);
        assert_eq!(load(d.path()).unwrap().sections[0].outline, Some(second));
    }
    #[test]
    fn rejects_invalid_outline_without_changing_saved_text() {
        let d = tempfile::tempdir().unwrap();
        let s = create(d.path(), "A").unwrap().sections.remove(0);
        let bad = [
            ("A\nB", outline(&[("a", None, 0), ("b", Some("missing"), 2)])),
            ("A\nB", outline(&[("a", Some("b"), 0), ("b", Some("a"), 2)])),
            ("A\nB", outline(&[("a", None, 0), ("b", None, 4)])),
            ("😀\nB", outline(&[("a", None, 0), ("b", None, 1)])),
            ("A\nB", outline(&[("a", None, 0), ("b", None, 1)])),
            ("A\nB\nC", outline(&[("a", None, 0), ("b", None, 2), ("c", Some("a"), 4)])),
            ("A\nB", outline(&[("a", None, 0), ("a", None, 2)])),
            ("A\nB", outline(&[("a", None, 1), ("b", None, 2)])),
            ("A\nB", Outline { version: 2, nodes: vec![OutlineNode { id: "a".into(), parent: None, start: 0 }] }),
        ];
        for (text, outline) in bad {
            assert!(save(d.path(), vec![TextPatch {
                id: s.id.clone(), revision: 0, text: text.into(), outline: Some(outline),
            }]).is_err());
            let current = load(d.path()).unwrap().sections.remove(0);
            assert_eq!(current.text, "");
            assert_eq!(current.revision, 0);
        }
    }
    #[test]
    fn stale_batch_rolls_back_all_patches() {
        let d = tempfile::tempdir().unwrap();
        let first = create(d.path(), "A").unwrap().sections.remove(0);
        let second = add(d.path(), None, "Second", "scene").unwrap().remove(1);
        save(d.path(), vec![TextPatch {
            id: first.id.clone(), revision: 0, text: "existing".into(), outline: None,
        }]).unwrap();
        save(d.path(), vec![TextPatch {
            id: second.id.clone(), revision: 0, text: "current".into(), outline: None,
        }]).unwrap();
        assert!(save(d.path(), vec![
            TextPatch { id: first.id.clone(), revision: 1, text: "new".into(), outline: None },
            TextPatch { id: second.id.clone(), revision: 0, text: "stale".into(), outline: None },
        ]).is_err());
        let all = load(d.path()).unwrap().sections;
        assert_eq!(all.iter().find(|s| s.id == first.id).unwrap().text, "existing");
        assert!(crate::history::list(d.path()).unwrap().is_empty());
    }
    #[test]
    fn migrates_legacy_sections_schema() {
        let d = tempfile::tempdir().unwrap();
        let c = Connection::open(d.path().join("ariane.sqlite")).unwrap();
        c.execute_batch("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('name','Legacy'); INSERT INTO meta VALUES('settings','{}'); CREATE TABLE sections(id TEXT PRIMARY KEY,parent TEXT,title TEXT NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL,text TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,synopsis TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Brouillon',goal INTEGER NOT NULL DEFAULT 0,mirror TEXT NOT NULL DEFAULT ''); INSERT INTO sections(id,title,kind,position,text) VALUES('old','Old','scene',1,'legacy text');").unwrap();
        drop(c);
        let loaded = load(d.path()).unwrap();
        assert_eq!(loaded.sections[0].text, "legacy text");
        assert_eq!(loaded.sections[0].outline, None);
        let c = database(d.path()).unwrap();
        let marker: String = c.query_row("SELECT value FROM meta WHERE key='outline_schema_version'", [], |r| r.get(0)).unwrap();
        assert_eq!(marker, "1");
    }
    #[test]
    fn omitted_outline_preserves_same_text_and_clears_changed_text() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let structure = outline(&[("a", None, 0), ("b", None, 2)]);
        save(d.path(), vec![TextPatch { id: id.clone(), revision: 0, text: "A\nB".into(), outline: Some(structure.clone()) }]).unwrap();
        let same = save(d.path(), vec![TextPatch { id: id.clone(), revision: 1, text: "A\nB".into(), outline: None }]).unwrap();
        assert_eq!(same[0].revision, 1);
        assert_eq!(same[0].outline, Some(structure));
        let changed = save(d.path(), vec![TextPatch { id, revision: 1, text: "Changed".into(), outline: None }]).unwrap();
        assert_eq!(changed[0].outline, None);
        assert_eq!(changed[0].revision, 2);
    }
    #[test]
    fn accepts_empty_last_node_after_trailing_newline() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let structure = outline(&[("a", None, 0), ("b", None, 2)]);
        let saved = save(d.path(), vec![TextPatch {
            id, revision: 0, text: "A\n".into(), outline: Some(structure.clone()),
        }]).unwrap();
        assert_eq!(saved[0].outline, Some(structure));
    }
    #[test]
    fn external_resolution_clears_stale_outline_and_keeps_recovery_copy() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        save(d.path(), vec![TextPatch {
            id: id.clone(), revision: 0, text: "A\nB".into(), outline: Some(outline(&[("a", None, 0), ("b", None, 2)])),
        }]).unwrap();
        fs::write(scene_path(d.path(), &id), "Outside").unwrap();
        let resolved = resolve_external(d.path(), &id, false, Some("Pending".into())).unwrap();
        assert_eq!(resolved.sections[0].text, "Outside");
        assert_eq!(resolved.sections[0].outline, None);
        let copies = fs::read_dir(d.path().join("recuperation")).unwrap()
            .map(|e| fs::read_to_string(e.unwrap().path()).unwrap()).collect::<Vec<_>>();
        assert!(copies.contains(&"Pending".to_owned()));
    }
    #[test]
    fn save_reopen_and_reject_stale() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let s = &p.sections[0];
        save(
            d.path(),
            vec![TextPatch {
                id: s.id.clone(),
                revision: 0,
                text: "Été à Toulouse".into(),
                outline: None,
            }],
        )
        .unwrap();
        assert_eq!(load(d.path()).unwrap().sections[0].text, "Été à Toulouse");
        assert!(save(
            d.path(),
            vec![TextPatch {
                id: s.id.clone(),
                revision: 0,
                text: "Stale".into(),
                outline: None,
            }]
        )
        .is_err());
    }
    #[test]
    fn external_edit_is_preserved() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let id = &p.sections[0].id;
        save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 0,
                text: "local".into(),
                outline: None,
            }],
        )
        .unwrap();
        fs::write(scene_path(d.path(), id), "external").unwrap();
        let opened = load(d.path()).unwrap();
        assert_eq!(opened.conflicts, vec![id.clone()]);
        assert_eq!(opened.sections[0].text, "local");
        assert_eq!(
            fs::read_to_string(scene_path(d.path(), id)).unwrap(),
            "external"
        );
        assert!(save(
            d.path(),
            vec![TextPatch {
                id: id.clone(),
                revision: 1,
                text: "new local".into(),
                outline: None,
            }]
        )
        .unwrap_err()
        .starts_with("EXTERNAL"));
        assert_eq!(
            resolve_external(d.path(), id, false, Some("unsaved local".into()))
                .unwrap()
                .sections[0]
                .text,
            "external"
        );
        let copies = fs::read_dir(d.path().join("recuperation"))
            .unwrap()
            .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
            .collect::<Vec<_>>();
        assert!(copies.contains(&"unsaved local".to_owned()));
    }
    #[test]
    fn recovers_unmaterialized_transaction() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let c = database(d.path()).unwrap();
        c.execute("UPDATE sections SET text='durable',revision=1", [])
            .unwrap();
        let recovered = load(d.path()).unwrap();
        assert!(recovered.recovered);
        assert_eq!(
            fs::read_to_string(scene_path(d.path(), &p.sections[0].id)).unwrap(),
            "durable"
        );
        assert!(!load(d.path()).unwrap().recovered);
    }
    #[test]
    fn rejects_cycle() {
        let d = tempfile::tempdir().unwrap();
        let p = create(d.path(), "Test").unwrap();
        let id = &p.sections[0].id;
        assert!(reorder(d.path(), std::slice::from_ref(id), id, Some(id.clone())).is_err());
    }
}
