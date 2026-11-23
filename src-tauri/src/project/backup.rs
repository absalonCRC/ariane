//! Project snapshots use SQLite's online backup and contain only owned files.
use crate::error::{AppResult, Result};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
};

const MANIFEST: &str = "ariane-sauvegarde.json";
const DATABASE: &str = "ariane.sqlite";
const RESTORED: &str = ".ariane-restored";
const OWNED_DIRS: &[&str] = &["manuscrit", "assets", "recuperation", "Vault"];

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format: u8,
    owned_vault: Option<PathBuf>,
    files: BTreeMap<PathBuf, String>,
}

fn open_readonly(path: &Path) -> Result<Connection> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()
}

fn verify_db(db: &Connection) -> Result<()> {
    let integrity: String = db
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .app()?;
    if integrity != "ok" {
        return Err("Base de sauvegarde incohérente.".into());
    }
    db.query_row("SELECT value FROM meta WHERE key='name'", [], |row| {
        row.get::<_, String>(0)
    })
    .app()?;
    Ok(())
}

fn digest(file: &mut File, mut destination: impl Write) -> Result<String> {
    let mut digest = Sha256::new();
    let mut buf = [0; 65536];
    loop {
        let size = file.read(&mut buf).app()?;
        if size == 0 {
            break;
        }
        digest.update(&buf[..size]);
        destination.write_all(&buf[..size]).app()?;
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn copy_tree(
    source: &Path,
    source_dir: &super::io::Dir,
    target: &Path,
    relative: &Path,
    records: &mut BTreeMap<PathBuf, String>,
) -> Result<()> {
    fs::create_dir(target.join(relative)).app()?;
    // Only enumerate names by path. File reads use the open directory descriptor.
    for entry in fs::read_dir(source.join(relative)).app()? {
        let entry = entry.app()?;
        let name = entry.file_name();
        let name = name
            .to_str()
            .ok_or("Nom de fichier incompatible avec la sauvegarde.")?;
        let key = relative.join(name);
        if entry.file_type().app()?.is_dir() {
            let child = source_dir
                .child(name, false)?
                .ok_or("Dossier déplacé pendant la sauvegarde.")?;
            copy_tree(source, &child, target, &key, records)?;
        } else {
            let mut file = source_dir
                .open_file(name, libc::O_RDONLY, 0)?
                .ok_or("Fichier déplacé pendant la sauvegarde.")?;
            let mut output = File::create_new(target.join(&key)).app()?;
            let checksum = digest(&mut file, &mut output)?;
            output.sync_all().app()?;
            records.insert(key, checksum);
        }
    }
    File::open(target.join(relative)).app()?.sync_all().app()
}

fn owned_vault(root: &Path, db: &Connection) -> Result<Option<PathBuf>> {
    let path = root.join("Vault");
    let expected = super::hash(&path.to_string_lossy());
    let owns: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM meta WHERE key='owned_vault' AND value=?1)",
            [&expected],
            |row| row.get(0),
        )
        .app()?;
    Ok(owns.then_some(path))
}

pub fn save(root: &Path, destination: &Path) -> Result<PathBuf> {
    let root = root.canonicalize().app()?;
    let destination = destination.canonicalize().app()?;
    if destination.starts_with(&root) {
        return Err("Choisissez un emplacement hors du projet.".into());
    }
    super::with_lock(&root, || {
        let source = super::io::Dir::open(&root)?;
        let db = super::database(&root)?;
        let backup = tempfile::Builder::new()
            .prefix("Sauvegarde ariane ")
            .tempdir_in(&destination)
            .app()?;
        let output = backup.path().join(DATABASE);
        let mut target = Connection::open(&output).app()?;
        rusqlite::backup::Backup::new(&db, &mut target)
            .app()?
            .run_to_completion(128, std::time::Duration::from_millis(10), None)
            .app()?;
        target.pragma_update(None, "journal_mode", "DELETE").app()?;
        verify_db(&target)?;
        let vault = owned_vault(&root, &target)?;
        drop(target);
        let mut file = File::open(&output).app()?;
        file.sync_all().app()?;
        let mut records =
            BTreeMap::from([(PathBuf::from(DATABASE), digest(&mut file, io::sink())?)]);
        for name in OWNED_DIRS {
            if *name == "Vault" && vault.is_none() {
                continue;
            }
            if let Some(dir) = source.child(name, false)? {
                copy_tree(&root, &dir, backup.path(), Path::new(name), &mut records)?;
            } else if *name == "Vault" {
                return Err("Le vault appartenant au projet est introuvable.".into());
            }
        }
        let manifest = serde_json::to_string_pretty(&Manifest {
            format: 1,
            owned_vault: vault,
            files: records,
        })
        .app()?;
        super::io::Dir::open(backup.path())?.write_atomic(MANIFEST, &manifest)?;
        File::open(&destination).app()?.sync_all().app()?;
        Ok(backup.keep())
    })
}

fn rebase_vault(root: &Path, old: &Path) -> Result<()> {
    let new = root.join("Vault");
    if !old.is_absolute()
        || old.file_name().and_then(|name| name.to_str()) != Some("Vault")
        || !new.is_dir()
    {
        return Err("Vault de la sauvegarde invalide.".into());
    }
    let mut db = super::database(root)?;
    let transaction = db.transaction().app()?;
    let old_hash = super::hash(&old.to_string_lossy());
    if transaction
        .execute(
            "UPDATE meta SET value=?1 WHERE key='owned_vault' AND value=?2",
            params![super::hash(&new.to_string_lossy()), old_hash],
        )
        .app()?
        != 1
    {
        return Err("Identité du vault de sauvegarde incohérente.".into());
    }
    if transaction
        .execute(
            "UPDATE vaults SET path=?1 WHERE path=?2",
            params![new.to_string_lossy(), old.to_string_lossy()],
        )
        .app()?
        != 1
    {
        return Err("Le vault du projet n’est pas référencé dans la sauvegarde.".into());
    }
    let has_edits = transaction
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_edits'",
            [],
            |_| Ok(()),
        )
        .optional()
        .app()?
        .is_some();
    if has_edits {
        let paths = {
            let mut query = transaction
                .prepare("SELECT id,path FROM card_edits")
                .app()?;
            let rows = query
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .app()?;
            rows.collect::<rusqlite::Result<Vec<_>>>().app()?
        };
        for (id, path) in paths {
            let relative = Path::new(&path).strip_prefix(old).app()?;
            if relative.as_os_str().is_empty()
                || !relative
                    .components()
                    .all(|part| matches!(part, Component::Normal(_)))
            {
                return Err("Fiche de sauvegarde invalide.".into());
            }
            transaction
                .execute(
                    "UPDATE card_edits SET path=?1 WHERE id=?2",
                    params![new.join(relative).to_string_lossy(), id],
                )
                .app()?;
        }
    }
    transaction.commit().app()
}

pub fn restore(backup: &Path, destination: &Path) -> Result<PathBuf> {
    let backup = backup.canonicalize().app()?;
    let destination = destination.canonicalize().app()?;
    if destination.starts_with(&backup) {
        return Err("Choisissez un emplacement hors de la sauvegarde.".into());
    }
    let source = super::io::Dir::open(&backup)?;
    let raw = source
        .read(MANIFEST)?
        .ok_or("Choisissez un dossier de sauvegarde ariane.")?;
    let manifest: Manifest = serde_json::from_str(&raw).app()?;
    if manifest.format != 1 {
        return Err("Format de sauvegarde ariane incompatible.".into());
    }
    let restored = tempfile::Builder::new()
        .prefix("Projet restauré ")
        .tempdir_in(&destination)
        .app()?;
    let output = restored.path().join(DATABASE);
    let mut file = source
        .open_file(DATABASE, libc::O_RDONLY, 0)?
        .ok_or("Base absente de la sauvegarde.")?;
    let mut target = File::create_new(&output).app()?;
    let mut actual = BTreeMap::from([(PathBuf::from(DATABASE), digest(&mut file, &mut target)?)]);
    target.sync_all().app()?;
    for name in OWNED_DIRS {
        if *name == "Vault" && manifest.owned_vault.is_none() {
            continue;
        }
        if let Some(dir) = source.child(name, false)? {
            copy_tree(&backup, &dir, restored.path(), Path::new(name), &mut actual)?;
        }
    }
    if manifest.files != actual {
        return Err("Le contenu de la sauvegarde ne correspond pas à son inventaire.".into());
    }
    verify_db(&open_readonly(&output)?)?;
    let root = restored.path().canonicalize().app()?;
    if let Some(old) = manifest.owned_vault {
        rebase_vault(&root, &old)?;
    }
    super::load(&root)?;
    super::io::Dir::open(&root)?.write_atomic(RESTORED, &uuid::Uuid::new_v4().to_string())?;
    File::open(&destination).app()?.sync_all().app()?;
    Ok(restored.keep())
}

// Restored copies retain source IDs so existing notes, links and citations work.
// Each gets an isolated derived index so alternating copies cannot share stale entries.
pub(crate) fn source_index(data: &Path, root: &Path) -> PathBuf {
    if let Some(index) = crate::vaults::private_source_index(data, root) {
        return index;
    }
    if root.join(RESTORED).is_file() {
        data.join(format!(
            "sources-{}.sqlite",
            super::hash(&root.to_string_lossy())
        ))
    } else {
        data.join("sources.sqlite")
    }
}

pub(crate) fn restored_identity(root: &Path) -> Result<Option<String>> {
    super::io::Dir::open(root)?.read(RESTORED)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{model::TextPatch, project, vaults};

    #[test]
    fn restores_a_separate_project_with_wal_history_assets_and_owned_vault() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Projet");
        let external = dir.path().join("Vault externe");
        fs::create_dir(&external).unwrap();
        fs::write(external.join("Témoin.md"), "Témoin hors projet").unwrap();
        let created = project::create(&root, "Récit ⚓").unwrap();
        let id = created.sections[0].id.clone();
        let text = "Le chat d’Éloïse 😺.\n\nLa lampe.[^source]\n\n[^source]: Carnet.".to_owned();
        project::save(
            &root,
            vec![TextPatch {
                writing_aids: None,
                id: id.clone(),
                text: text.clone(),
                revision: 0,
                outline: None,
            }],
        )
        .unwrap();
        let version = crate::history::capture(&root, "Première lecture", None).unwrap();
        crate::history::create_branch(&root, "Variante", None).unwrap();
        vaults::create_owned(&root).unwrap();
        vaults::create_entity(&root, "personne", "Éloïse", "Personnage fictif").unwrap();
        vaults::connect(&root, dir.path(), vaults::VaultFolder::selected(&external).unwrap(), None).unwrap();
        fs::create_dir(root.join("assets")).unwrap();
        fs::write(root.join("assets/image.png"), b"synthetic image").unwrap();

        // Retain a WAL connection and create a newer database-only entry.
        let db = project::database(&root).unwrap();
        db.execute("INSERT INTO meta VALUES('witness','durable')", [])
            .unwrap();
        let backup = save(&root, dir.path()).unwrap();
        assert!(!backup.join("ariane.sqlite-wal").exists());
        assert!(!backup.join("Vault externe").exists());

        project::save(
            &root,
            vec![TextPatch {
                writing_aids: None,
                id: id.clone(),
                text: "Travail plus récent".into(),
                revision: project::section(&db, &id).unwrap().unwrap().revision,
                outline: None,
            }],
        )
        .unwrap();
        let restored = restore(&backup, dir.path()).unwrap();
        let journal = |root: &Path| {
            open_readonly(&root.join(DATABASE)).unwrap()
                .pragma_query_value::<String, _>(None, "journal_mode", |row| row.get(0)).unwrap()
        };
        assert_eq!(journal(&backup), "delete");
        assert_eq!(journal(&restored), "wal");
        let second = restore(&backup, dir.path()).unwrap();
        assert_ne!(restored, second);
        assert_ne!(
            restored_identity(&restored).unwrap(),
            restored_identity(&second).unwrap()
        );
        assert_eq!(project::load(&restored).unwrap().sections[0].text, text);
        assert_eq!(
            project::load(&root).unwrap().sections[0].text,
            "Travail plus récent"
        );
        let restored_db = project::database(&restored).unwrap();
        let witness: String = restored_db
            .query_row("SELECT value FROM meta WHERE key='witness'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(witness, "durable");
        assert_eq!(
            crate::history::get(&restored, &version.id).unwrap().sections[0].text,
            text
        );
        assert_eq!(
            fs::read(restored.join("assets/image.png")).unwrap(),
            b"synthetic image"
        );
        let current = vaults::list(&root, &source_index(dir.path(), &root)).unwrap();
        let from_backup = vaults::list(&restored, &source_index(dir.path(), &restored)).unwrap();
        assert_ne!(
            source_index(dir.path(), &root),
            source_index(dir.path(), &restored)
        );
        let original_vault = current.iter().find(|v| v.owned).unwrap();
        let restored_vault = from_backup.iter().find(|v| v.owned).unwrap();
        assert_eq!(original_vault.id, restored_vault.id);
        assert_eq!(Path::new(&restored_vault.path), restored.canonicalize().unwrap().join("Vault"));
        let pending = from_backup.iter().find(|v| !v.owned).unwrap();
        assert_eq!(Path::new(&pending.path), external.canonicalize().unwrap());
        assert!(pending.needs_authorization && !pending.available);
        assert!(restored_vault.available);
        vaults::connect(
            &restored,
            dir.path(),
            vaults::VaultFolder::selected(&external).unwrap(),
            Some(&pending.id),
        ).unwrap();
        let after = vaults::list(&restored, &source_index(dir.path(), &restored)).unwrap();
        assert!(after.iter().any(|v| v.id == pending.id && v.available && !v.needs_authorization));
        let another = vaults::list(&second, &source_index(dir.path(), &second)).unwrap();
        assert!(another.iter().any(|v| v.id == pending.id && v.needs_authorization));
        assert_eq!(
            fs::read_to_string(external.join("Témoin.md")).unwrap(),
            "Témoin hors projet"
        );
    }

    #[test]
    fn refuses_redirected_files_and_damaged_backups_and_preserves_conflicts() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Projet");
        let p = project::create(&root, "Récit").unwrap();
        let id = p.sections[0].id.clone();
        project::save(
            &root,
            vec![TextPatch {
                writing_aids: None,
                id: id.clone(),
                text: "Texte SQLite".into(),
                revision: 0,
                outline: None,
            }],
        )
        .unwrap();
        let disk = root.join("manuscrit").join(format!("{id}.md"));
        fs::write(&disk, "Texte externe en conflit").unwrap();
        fs::create_dir(root.join("assets")).unwrap();
        std::os::unix::fs::symlink(&disk, root.join("assets/liée.md")).unwrap();
        assert!(save(&root, dir.path()).is_err());
        fs::remove_file(root.join("assets/liée.md")).unwrap();
        assert!(save(&root, &root).is_err());
        let backup = save(&root, dir.path()).unwrap();
        let restored = restore(&backup, dir.path()).unwrap();
        assert_eq!(
            project::load(&restored).unwrap().conflicts,
            vec![id.clone()]
        );
        assert_eq!(
            fs::read_to_string(&disk).unwrap(),
            "Texte externe en conflit"
        );
        fs::write(
            backup.join("manuscrit").join(format!("{id}.md")),
            "Fichier abîmé",
        )
        .unwrap();
        assert!(restore(&backup, dir.path())
            .unwrap_err()
            .contains("inventaire"));
        assert_eq!(
            fs::read_to_string(disk).unwrap(),
            "Texte externe en conflit"
        );
    }
}
