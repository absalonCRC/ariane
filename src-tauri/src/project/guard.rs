use crate::error::{AppResult, Result};
use std::{
    collections::HashMap,
    fs::File,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, Weak},
};

/// Held for the lifetime of an open project, to exclude other app instances.
pub struct ProjectGuard {
    _lock: File,
}
impl ProjectGuard {
    pub fn acquire(root: &Path) -> Result<Self> {
        let dir = super::io::Dir::open(root)?;
        Ok(Self {
            _lock: super::io::lock(&dir)?,
        })
    }
}

/// Weak entries let a returning scene reuse this session's outstanding lock while a read finishes.
#[derive(Default)]
pub(crate) struct SessionGuards {
    pub active: Option<Arc<ProjectGuard>>,
    recent: HashMap<PathBuf, Weak<ProjectGuard>>,
}
impl SessionGuards {
    pub fn acquire(&mut self, root: &Path) -> Result<Arc<ProjectGuard>> {
        use std::os::unix::fs::MetadataExt;
        self.recent.retain(|_, guard| guard.strong_count() > 0);
        if let Some(guard) = self.recent.get(root).and_then(Weak::upgrade) {
            let held = guard._lock.metadata().app()?;
            let current = std::fs::symlink_metadata(root.join(".ariane.lock")).app()?;
            if (held.dev(), held.ino()) == (current.dev(), current.ino()) {
                return Ok(guard);
            }
        }
        let guard = Arc::new(ProjectGuard::acquire(root)?);
        self.recent.insert(root.to_owned(), Arc::downgrade(&guard));
        Ok(guard)
    }
}

thread_local! { static HELD: std::cell::RefCell<std::collections::HashSet<PathBuf>> = Default::default(); }
struct Held(PathBuf);
impl Drop for Held {
    fn drop(&mut self) {
        HELD.with(|h| {
            h.borrow_mut().remove(&self.0);
        });
    }
}
static OPERATIONS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();
/// Serializes a complete project protocol, including the work after a DB commit.
pub(crate) fn with_lock<T>(root: &Path, f: impl FnOnce() -> Result<T>) -> Result<T> {
    let key = root.canonicalize().app()?;
    if HELD.with(|h| h.borrow().contains(&key)) {
        return f();
    }
    let map = OPERATIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let lock = {
        let mut map = map.lock().map_err(|e| e.to_string())?;
        map.retain(|_, lock| lock.strong_count() > 0);
        if let Some(lock) = map.get(&key).and_then(Weak::upgrade) {
            lock
        } else {
            let lock = Arc::new(Mutex::new(()));
            map.insert(key.clone(), Arc::downgrade(&lock));
            lock
        }
    };
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    HELD.with(|h| {
        h.borrow_mut().insert(key.clone());
    });
    let _held = Held(key);
    f()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lock_child() {
        let Ok(root) = std::env::var("ARIANE_TEST_LOCK_ROOT") else {
            return;
        };
        let result = ProjectGuard::acquire(Path::new(&root));
        assert_eq!(
            result.is_ok(),
            std::env::var("ARIANE_TEST_LOCK_ALLOWED").unwrap() == "yes"
        );
    }
    #[test]
    fn returning_session_can_reuse_a_lock_retained_by_background_work() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let mut session = SessionGuards::default();
        let reading = session.acquire(a.path()).unwrap();
        session.active = Some(session.acquire(b.path()).unwrap());
        assert!(ProjectGuard::acquire(a.path()).is_err());
        let again = session.acquire(a.path()).unwrap();
        assert!(Arc::ptr_eq(&reading, &again));
        drop(again);
        drop(reading);
        assert!(ProjectGuard::acquire(a.path()).is_ok());
    }
    #[test]
    fn excludes_another_process_until_the_project_is_released() {
        let d = tempfile::tempdir().unwrap();
        let guard = ProjectGuard::acquire(d.path()).unwrap();
        let child = |allowed: &str| {
            std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "project::guard::tests::lock_child", "--quiet"])
                .env("ARIANE_TEST_LOCK_ROOT", d.path())
                .env("ARIANE_TEST_LOCK_ALLOWED", allowed)
                .output()
                .unwrap()
        };
        assert!(child("no").status.success());
        drop(guard);
        assert!(child("yes").status.success());
    }
}
