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
const SCHEMA_VERSION: i64 = 1;
/// SQLite itself refuses symlink filenames. Files used by the mirror protocol are
/// opened relative to a verified directory descriptor in `io`.
pub fn database(root: &Path) -> Result<Connection> {
    let directory = super::io::Dir::open(root)?;
    directory.child("manuscrit", false)?;
    directory.child("recuperation", false)?;
    // Validate the database independently, before SQLite opens it. SQLite's
    // NOFOLLOW flag also covers replacement of its final path component.
    for filename in ["ariane.sqlite","ariane.sqlite-wal","ariane.sqlite-shm","ariane.sqlite-journal"] {
        directory.open_file(filename, libc::O_RDONLY, 0)?;
    }
    let path = root.canonicalize().app()?.join("ariane.sqlite");
    let flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
        | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
        | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX
        | rusqlite::OpenFlags::SQLITE_OPEN_NOFOLLOW;
    let mut c = Connection::open_with_flags(path, flags).app()?;
    c.busy_timeout(std::time::Duration::from_secs(5)).app()?;
    c.execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;").app()?;
    let schema: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0)).app()?;
    if schema > SCHEMA_VERSION { return Err("Ce projet nécessite une version plus récente d’ariane.".into()); }
    if schema < SCHEMA_VERSION {
        // Recheck under SQLite's write lock: another process might have migrated
        // between the first check and this transaction.
        let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).app()?;
        let current: i64 = tx.pragma_query_value(None, "user_version", |r| r.get(0)).app()?;
        if current < SCHEMA_VERSION {
            tx.execute_batch("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sections(id TEXT PRIMARY KEY,parent TEXT,title TEXT NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL,text TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,synopsis TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Brouillon',goal INTEGER NOT NULL DEFAULT 0,mirror TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL,scope TEXT,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS vaults(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,scope TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS links(section TEXT,source TEXT,payload TEXT,PRIMARY KEY(section,source));
 CREATE TABLE IF NOT EXISTS citations(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS structure_history(id INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mirror_pending(id TEXT PRIMARY KEY,base TEXT NOT NULL,FOREIGN KEY(id) REFERENCES sections(id) ON DELETE CASCADE);").app()?;
            let columns = tx.prepare("PRAGMA table_info(sections)").app()?.query_map([], |r| r.get::<_, String>(1)).app()?.collect::<std::result::Result<std::collections::HashSet<_>, _>>().app()?;
            for (name, declaration) in [("outline", "TEXT"), ("role", "TEXT NOT NULL DEFAULT 'manuscript'"), ("trashed", "INTEGER NOT NULL DEFAULT 0"), ("included", "INTEGER NOT NULL DEFAULT 1")] {
                if !columns.contains(name) { tx.execute_batch(&format!("ALTER TABLE sections ADD COLUMN {name} {declaration}")).app()?; }
            }
            tx.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('outline_schema_version','1')", []).app()?;
            tx.execute_batch("CREATE INDEX IF NOT EXISTS versions_created ON versions(created DESC,id DESC);
 CREATE INDEX IF NOT EXISTS versions_scope_name_created ON versions(scope,name,created DESC);
 CREATE INDEX IF NOT EXISTS sections_parent ON sections(parent);").app()?;
            tx.pragma_update(None, "user_version", SCHEMA_VERSION).app()?;
        }
        tx.commit().app()?;
        c.pragma_update(None, "journal_mode", "WAL").app()?;
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
    let mut q = c.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included FROM sections WHERE trashed=0 ORDER BY position,id").app()?;
    let rows = q.query_map([], row_section).app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}
pub fn all_sections(c: &Connection) -> Result<Vec<Section>> {
    let mut q=c.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included FROM sections ORDER BY position,id").app()?;
    let rows = q
        .query_map([], row_section)
        .app()?;
    rows.collect::<std::result::Result<Vec<_>, _>>().app()
}
pub fn section(c: &Connection, id: &str) -> Result<Option<Section>> {
    super::validate_id(id)?;
    c.query_row("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included FROM sections WHERE id=? AND trashed=0", [id], row_section)
        .optional().app()
}
pub(crate) fn row_section(r: &Row<'_>) -> rusqlite::Result<Section> {
    let id: String = r.get(0)?;
    super::validate_id(&id).map_err(|message| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, message))))?;
    let raw: Option<String> = r.get(10)?;
    let outline = raw
        .map(|json| {
            serde_json::from_str(&json).map_err(|err| rusqlite::Error::FromSqlConversionFailure(
                10, rusqlite::types::Type::Text, Box::new(err),
            ))
        })
        .transpose()?;
    Ok(Section {
        id, parent: r.get(1)?, title: r.get(2)?, kind: r.get(3)?,
        position: r.get(4)?, text: r.get(5)?, revision: r.get(6)?,
        synopsis: r.get(7)?, status: r.get(8)?, goal: r.get(9)?, outline, role: r.get(11)?, trashed: r.get(12)?, included: r.get(13)?,
    })
}
pub fn load(root: &Path) -> Result<Project> {
    super::with_lock(root, || load_unlocked(root))
}
pub(crate) fn load_unlocked(root: &Path) -> Result<Project> {
    let root_dir = super::io::Dir::open(root)?;
    if root_dir.open_file("ariane.sqlite", libc::O_RDONLY, 0)?.is_none() {
        return Err("Ce dossier ne contient pas de projet ariane.".into());
    }
    let c = database(root)?;
    let mut recovered = false;
    let mut conflicts = vec![];
    // Read each section only once, including trash. It is important that all
    // ids are validated before any mirror is touched.
    let all = all_sections(&c)?;
    let mirrors = {
        let mut query = c.prepare("SELECT s.id,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id").app()?;
        let rows = query.query_map([], |r| Ok((r.get::<_,String>(0)?, (r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?)))).app()?;
        rows.collect::<std::result::Result<std::collections::HashMap<_,_>,_>>().app()?
    };
    for s in all.iter().filter(|s| !s.trashed && s.kind == "scene") {
        let (stored, pending) = mirrors.get(&s.id).ok_or("Section introuvable.")?;
        let disk = scene_disk(&root_dir, &s.id)?;
        let desired = hash(&s.text);
        let disk_hash = disk.as_ref().map(|text| hash(text));
        let base = pending.as_ref().unwrap_or(stored);
        if let Some(actual) = disk_hash.as_ref() {
            // A pending write can have reached disk before its DB acknowledgement.
            if !base.is_empty() && actual != base && (pending.is_none() || actual != &desired) {
                conflicts.push(s.id.clone());
                continue;
            }
            if pending.is_some() && base.is_empty() && actual != &desired {
                conflicts.push(s.id.clone());
                continue;
            }
        }
        if pending.is_some() || stored != &desired || disk.is_none() {
            mirror(&root_dir, &c, s)?;
            recovered |= pending.is_some() || !stored.is_empty();
        }
    }
    let name = c.query_row("SELECT value FROM meta WHERE key='name'", [], |r| r.get(0)).app()?;
    let settings: String = c.query_row("SELECT value FROM meta WHERE key='settings'", [], |r| r.get(0)).unwrap_or("{}".into());
    let (trash, sections): (Vec<_>, Vec<_>) = all.into_iter().partition(|s| s.trashed);
    Ok(Project {
        path: root.to_string_lossy().into(), name, sections,
        settings: serde_json::from_str(&settings).unwrap_or_default(), recovered, trash,
        can_undo_structure: c.query_row("SELECT EXISTS(SELECT 1 FROM structure_history)", [], |r| r.get(0)).app()?,
        conflicts,
    })
}
fn scene_disk(root: &super::io::Dir, id: &str) -> Result<Option<String>> {
    super::validate_id(id)?;
    match root.child("manuscrit", false)? {
        Some(dir) => dir.read(&format!("{id}.md")),
        None => Ok(None),
    }
}
fn mirror(root: &super::io::Dir, c: &Connection, s: &Section) -> Result<()> {
    super::validate_id(&s.id)?;
    let dir = root.child("manuscrit", true)?.ok_or("Dossier manuscrit inaccessible.")?;
    dir.write_atomic(&format!("{}.md", s.id), &s.text)?;
    c.execute("UPDATE sections SET mirror=? WHERE id=?", params![hash(&s.text), s.id]).app()?;
    c.execute("DELETE FROM mirror_pending WHERE id=?", [&s.id]).app()?;
    Ok(())
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorError { pub id: String, pub message: String }
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReport { pub sections: Vec<Section>, pub mirror_errors: Vec<MirrorError> }
/// Compatibility wrapper for existing local callers. The app should use
/// `save_report` so that a durable commit and a failed mirror are distinct.
#[cfg(any(test, feature = "performance-harness"))]
pub fn save(root: &Path, patches: Vec<TextPatch>) -> Result<Vec<Section>> {
    Ok(save_report(root, patches)?.sections)
}
pub fn save_report(root: &Path, patches: Vec<TextPatch>) -> Result<SaveReport> {
    save_report_with(root, patches, |_| Ok(()))
}
fn save_report_with(root: &Path, patches: Vec<TextPatch>, mut before_mirror: impl FnMut(&Section) -> Result<()>) -> Result<SaveReport> {
    super::with_lock(root, || {
        let root_dir = super::io::Dir::open(root)?;
        let mut c = database(root)?;
        let mut captures = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for patch in &patches {
            super::validate_id(&patch.id)?;
            if !seen.insert(&patch.id) { return Err("Une section ne peut être sauvegardée deux fois dans le même lot.".into()); }
            let (rev, old, raw, mir, pending): (i64, String, Option<String>, String, Option<String>) = c.query_row(
                "SELECT s.revision,s.text,s.outline,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id WHERE s.id=?", [&patch.id],
                |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).app()?;
            if rev != patch.revision { return Err("Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into()); }
            let old_outline = raw.map(|json| serde_json::from_str::<Outline>(&json).app()).transpose()?;
            let next_outline = effective_outline(patch, &old, old_outline.clone())?;
            validate_disk(&root_dir, &patch.id, &old, &mir, pending.as_deref())?;
            if (old != patch.text && !old.is_empty()) || (old == patch.text && old_outline != next_outline) {
                let last: String = c.query_row("SELECT created FROM versions WHERE scope=? AND name='Sauvegarde automatique' ORDER BY created DESC LIMIT 1", [&patch.id], |r| r.get(0)).unwrap_or_default();
                let due = chrono::DateTime::parse_from_rfc3339(&last).map_or(true, |t| chrono::Utc::now().signed_duration_since(t).num_minutes() >= 5);
                if due { captures.push(patch.id.clone()); }
            }
        }
        for id in captures { crate::history::capture(root, "Sauvegarde automatique", Some(id))?; }
        let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).app()?;
        for p in &patches {
            let (rev, old, raw, mir, pending): (i64, String, Option<String>, String, Option<String>) = tx.query_row(
                "SELECT s.revision,s.text,s.outline,s.mirror,p.base FROM sections s LEFT JOIN mirror_pending p ON p.id=s.id WHERE s.id=?", [&p.id],
                |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).app()?;
            if rev != p.revision { return Err("Le texte a changé depuis cette sauvegarde. Rechargez sa version.".into()); }
            let base = validate_disk(&root_dir, &p.id, &old, &mir, pending.as_deref())?;
            let old_outline = raw.map(|json| serde_json::from_str::<Outline>(&json).app()).transpose()?;
            let next_outline = effective_outline(p, &old, old_outline.clone())?;
            if old != p.text || old_outline != next_outline {
                let encoded = next_outline.map(|outline| serde_json::to_string(&outline).app()).transpose()?;
                tx.execute("UPDATE sections SET text=?,outline=?,revision=revision+1 WHERE id=?", params![p.text,encoded,p.id]).app()?;
            }
            tx.execute("INSERT INTO mirror_pending(id,base) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET base=excluded.base", params![p.id, base]).app()?;
        }
        let mut saved = Vec::with_capacity(patches.len());
        {
            let mut query = tx.prepare("SELECT id,parent,title,kind,position,text,revision,synopsis,status,goal,outline,role,trashed,included FROM sections WHERE id=?").app()?;
            for p in &patches { saved.push(query.query_row([&p.id], row_section).app()?); }
        }
        tx.commit().app()?;
        let mut mirror_errors = Vec::new();
        for section in &saved {
            if let Err(message) = before_mirror(section).and_then(|_| mirror(&root_dir, &c, section)) {
                mirror_errors.push(MirrorError { id: section.id.clone(), message });
            }
        }
        Ok(SaveReport { sections: saved, mirror_errors })
    })
}
fn validate_disk(root: &super::io::Dir, id: &str, old: &str, mirror: &str, pending: Option<&str>) -> Result<String> {
    let disk = scene_disk(root, id)?;
    if let Some(text) = &disk {
        let actual = hash(text);
        let expected = pending.unwrap_or(mirror);
        if (!expected.is_empty() && actual != expected && (pending.is_none() || actual != hash(old)))
            || (pending.is_some() && expected.is_empty() && actual != hash(old)) {
            return Err(format!("EXTERNAL:{id}"));
        }
    }
    Ok(disk.map(|text| hash(&text)).unwrap_or_default())
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
    crate::project::with_lock(root, || {
    if !["folder", "chapter", "scene"].contains(&kind) {
        return Err("Type de section inconnu.".into());
    }
    let c = database(root)?;
    super::library::validate_parent(&all_sections(&c)?, parent.as_deref(), &std::collections::HashSet::new(), Some(kind))?;
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
    })
}
pub fn update(root: &Path, s: &Section) -> Result<Vec<Section>> {
    crate::project::with_lock(root, || {
    let c = database(root)?;
    c.execute(
        "UPDATE sections SET title=?,synopsis=?,status=?,goal=? WHERE id=?",
        params![s.title, s.synopsis, s.status, s.goal.max(0), s.id],
    )
    .app()?;
    sections(&c)
    })
}
pub fn reorder(
    root: &Path,
    ids: &[String],
    id: &str,
    parent: Option<String>,
) -> Result<Vec<Section>> {
    crate::project::with_lock(root, || {
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
    super::library::validate_parent(&all_sections(&c)?, parent.as_deref(), &std::collections::HashSet::from([id.to_owned()]), None)?;
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
    })
}
pub fn settings(root: &Path, value: serde_json::Value) -> Result<()> {
    crate::project::with_lock(root, || {
    database(root)?
        .execute(
            "INSERT OR REPLACE INTO meta VALUES('settings',?)",
            [value.to_string()],
        )
        .app()?;
    Ok(())
    })
}
pub fn resolve_external(root: &Path, id: &str, keep_local: bool, pending: Option<String>) -> Result<Project> {
    super::with_lock(root, || {
        super::validate_id(id)?;
        let root_dir = super::io::Dir::open(root)?;
        let mut c = database(root)?;
        let mut s = section(&c, id)?.ok_or("Section introuvable")?;
        let disk = scene_disk(&root_dir, id)?.ok_or("Miroir introuvable.")?;
        // Preserve both versions in a verified recovery directory first.
        let dir = root_dir.child("recuperation", true)?.ok_or("Dossier de récupération inaccessible.")?;
        dir.write_atomic(&format!("{}-{}.md", s.id, uuid::Uuid::new_v4()), if keep_local { &disk } else { pending.as_deref().unwrap_or(&s.text) })?;
        let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).app()?;
        if keep_local {
            if let Some(text) = pending {
                if text != s.text { s.outline = None; }
                s.text = text;
                tx.execute("UPDATE sections SET text=?,outline=?,revision=revision+1 WHERE id=?", params![s.text,s.outline.as_ref().map(serde_json::to_string).transpose().app()?,id]).app()?;
            }
            tx.execute("INSERT INTO mirror_pending(id,base) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET base=excluded.base", params![id, hash(&disk)]).app()?;
        } else {
            let outline = if disk == s.text { s.outline.as_ref().map(serde_json::to_string).transpose().app()? } else { None };
            tx.execute("UPDATE sections SET text=?,outline=?,mirror=?,revision=revision+1 WHERE id=?", params![disk,outline,hash(&disk),id]).app()?;
            tx.execute("DELETE FROM mirror_pending WHERE id=?", [id]).app()?;
        }
        tx.commit().app()?;
        if keep_local { mirror(&root_dir, &c, &s)?; }
        load_unlocked(root)
    })
}
#[cfg(test)]
pub fn scene_path(root: &Path, id: &str) -> std::path::PathBuf {
    root.join("manuscrit").join(format!("{id}.md"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_database_ids_that_escape_the_project() {
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("project");
        let initial = create(&root, "A").unwrap();
        let witness = parent.path().join("outside.md");
        std::fs::write(&witness, "witness").unwrap();
        let c = database(&root).unwrap();
        c.execute("UPDATE sections SET id='../outside' WHERE id=?", [&initial.sections[0].id]).unwrap();
        drop(c);
        assert!(load(&root).is_err());
        assert_eq!(std::fs::read_to_string(witness).unwrap(), "witness");
    }
    #[cfg(unix)]
    #[test]
    fn refuses_redirected_internal_paths_and_ignores_predictable_temp_symlink() {
        use std::os::unix::fs::symlink;
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("project");
        let id = create(&root, "A").unwrap().sections[0].id.clone();
        let witness = parent.path().join("witness");
        std::fs::write(&witness, "witness").unwrap();
        symlink(&witness, root.join("manuscrit").join(format!("{id}.tmp"))).unwrap();
        save(&root, vec![TextPatch { id: id.clone(), revision: 0, text: "Texte".into(), outline: None }]).unwrap();
        assert_eq!(std::fs::read_to_string(&witness).unwrap(), "witness");
        std::fs::rename(root.join("manuscrit"), root.join("old-manuscrit")).unwrap();
        symlink(parent.path(), root.join("manuscrit")).unwrap();
        assert!(load(&root).is_err());
        assert!(save(&root, vec![TextPatch { id, revision: 1, text: "Autre".into(), outline: None }]).is_err());
        assert_eq!(std::fs::read_to_string(&witness).unwrap(), "witness");
    }
    #[test]
    fn opened_directory_descriptor_survives_a_path_swap_without_following_it() {
        use std::os::unix::fs::symlink;
        let d=tempfile::tempdir().unwrap();let root=d.path().join("project");create(&root,"A").unwrap();
        let outside=d.path().join("outside");fs::create_dir(&outside).unwrap();fs::write(outside.join("test.md"),"witness").unwrap();
        let directory=super::super::io::Dir::open(&root).unwrap().child("manuscrit",false).unwrap().unwrap();
        fs::rename(root.join("manuscrit"),root.join("previous")).unwrap();symlink(&outside,root.join("manuscrit")).unwrap();
        directory.write_atomic("test.md","new").unwrap();
        assert_eq!(fs::read_to_string(outside.join("test.md")).unwrap(),"witness");
        assert_eq!(fs::read_to_string(root.join("previous/test.md")).unwrap(),"new");
    }
    #[test]
    fn mirror_failure_acknowledges_commit_and_recovers_on_next_open() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let report = save_report_with(d.path(), vec![TextPatch { id: id.clone(), revision: 0, text: "Durable".into(), outline: None }], |_| Err("injected mirror error".into())).unwrap();
        assert_eq!(report.sections[0].revision, 1);
        assert_eq!(report.mirror_errors.len(), 1);
        let loaded = load(d.path()).unwrap();
        assert_eq!(loaded.sections[0].revision, 1);
        assert_eq!(loaded.sections[0].text, "Durable");
        assert!(loaded.conflicts.is_empty());
        assert_eq!(std::fs::read_to_string(scene_path(d.path(), &id)).unwrap(), "Durable");
        let saved = save(d.path(), vec![TextPatch { id, revision: 1, text: "Suite".into(), outline: None }]).unwrap();
        assert_eq!(saved[0].revision, 2);
    }
    #[test]
    fn simultaneous_writers_never_leave_mirrors_behind_committed_revision() {
        let d = tempfile::tempdir().unwrap();
        let id = create(d.path(), "A").unwrap().sections[0].id.clone();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let mut joins = Vec::new();
        for text in ["un", "deux"] {
            let root = d.path().to_owned(); let id = id.clone(); let barrier = barrier.clone();
            joins.push(std::thread::spawn(move || { barrier.wait(); save(&root, vec![TextPatch { id, revision: 0, text: text.into(), outline: None }]) }));
        }
        barrier.wait();
        let results: Vec<_> = joins.into_iter().map(|j| j.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        let loaded = load(d.path()).unwrap();
        assert!(loaded.conflicts.is_empty());
        assert_eq!(std::fs::read_to_string(scene_path(d.path(), &id)).unwrap(), loaded.sections[0].text);
    }
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
