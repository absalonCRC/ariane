use crate::{
    error::{AppResult, Result},
    project,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, Metadata},
    io::{ErrorKind, Write},
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use uuid::Uuid;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Identity {
    device: u64,
    inode: u64,
    birth_ns: Option<u128>,
}

impl Identity {
    fn of(metadata: &Metadata) -> Self {
        Self {
            device: metadata.dev(),
            inode: metadata.ino(),
            birth_ns: metadata
                .created()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos()),
        }
    }
}

/// The directory observed when the user confirmed the native dialog.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct VaultFolder {
    pub(crate) path: PathBuf,
    identity: Identity,
}

impl VaultFolder {
    pub(crate) fn selected(path: &Path) -> Result<Self> {
        let path = path.canonicalize().app()?;
        let metadata = fs::symlink_metadata(&path).app()?;
        if !metadata.is_dir() || path.to_str().is_none() {
            return Err("Choisissez un dossier de vault existant.".into());
        }
        Ok(Self {
            path,
            identity: Identity::of(&metadata),
        })
    }

    /// Return availability and whether consent is needed. A disconnected disk
    /// may return with the same identity without losing its approval.
    fn status(&self) -> (bool, bool) {
        match fs::symlink_metadata(&self.path) {
            Ok(metadata) if metadata.is_dir() && Identity::of(&metadata) == self.identity => {
                let matches = self.path.canonicalize().is_ok_and(|path| path == self.path);
                (matches, !matches)
            }
            Err(error) if error.kind() == ErrorKind::NotFound => (false, false),
            _ => (false, true),
        }
    }
}

/// Kept in the local application profile. Copying a project, its SQLite
/// database or a backup never copies an authorization.
#[derive(Default, Serialize, Deserialize)]
pub(super) struct Access {
    grants: BTreeMap<String, VaultFolder>,
    index: Option<[u8; 16]>,
}

impl Access {
    fn file(data: &Path, root: &Path) -> Result<PathBuf> {
        let root = root.canonicalize().app()?;
        let metadata = fs::symlink_metadata(root.join("ariane.sqlite")).app()?;
        if !metadata.is_file() {
            return Err("Base de projet invalide.".into());
        }
        let identity = serde_json::to_string(&(root, Identity::of(&metadata))).app()?;
        Ok(data
            .join("vault-access")
            .join(format!("{}.json", project::hash(&identity))))
    }

    pub(super) fn load(data: &Path, root: &Path) -> Result<Self> {
        match fs::read(Self::file(data, root)?) {
            Ok(bytes) => serde_json::from_slice(&bytes).app(),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(Self::default()),
            Err(error) => Err(error.to_string()),
        }
    }

    pub(super) fn save(&self, data: &Path, root: &Path) -> Result<()> {
        let path = Self::file(data, root)?;
        let dir = data.join("vault-access");
        fs::create_dir_all(&dir).app()?;
        let mut file = tempfile::NamedTempFile::new_in(&dir).app()?;
        file.write_all(&serde_json::to_vec(self).app()?).app()?;
        file.as_file().sync_all().app()?;
        file.persist(path).app()?;
        fs::File::open(dir).app()?.sync_all().app()
    }

    pub(super) fn index_path(&self, data: &Path) -> Option<PathBuf> {
        self.index
            .map(|key| data.join(format!("sources-vault-{}.sqlite", Uuid::from_bytes(key))))
    }

    pub(super) fn status(&self, id: &str, path: &Path) -> (bool, bool) {
        self.grants
            .get(id)
            .filter(|folder| folder.path == path)
            .map_or((false, true), VaultFolder::status)
    }

    pub(super) fn grant(&mut self, id: &str, folder: VaultFolder, previous: Option<&str>) {
        // An ID retained after relocation may exist in other projects. A
        // fresh local index prevents either project from reading the other's data.
        if self.grants.get(id) != Some(&folder)
            && (id != project::hash(&folder.path.to_string_lossy())
                || previous.is_some_and(|path| Path::new(path) != folder.path)
                || self.grants.contains_key(id))
        {
            self.index = Some(Uuid::new_v4().into_bytes());
        }
        self.grants.insert(id.into(), folder);
    }

    pub(super) fn revoke(&mut self, id: &str) -> bool {
        self.grants.remove(id).is_some()
    }
}
