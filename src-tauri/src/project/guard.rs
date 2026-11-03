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
