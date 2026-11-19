//! Suggestions and the personal corpus are independent of the documentary and audio engines.
mod store;
mod words;

pub use store::{Preferences, Suggestion};

use crate::error::{AppResult, Result};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    #[serde(flatten)]
    preferences: Preferences,
    forgotten: bool,
    epoch: i64,
}

#[derive(Clone)]
struct Scope {
    id: String,
    names: Arc<words::Counts>,
}

#[derive(Default)]
struct Work {
    pending: BTreeMap<PathBuf, bool>,
    current: Option<PathBuf>,
    scope: Option<Scope>,
    running: bool,
}

#[derive(Clone, Default)]
pub struct Service {
    enabled: Arc<AtomicBool>,
    work: Arc<Mutex<Work>>,
}
impl Service {
    pub fn new(data: &Path) -> Self {
        let service = Self::default();
        if data.join("prediction.sqlite").is_file() {
            if let Ok((prefs, _)) = store::open(data).and_then(|c| store::preferences(&c)) {
                service.enabled.store(prefs.enabled, Ordering::Release);
            }
        }
        service
    }

    pub fn activate(&self, data: &Path, root: &Path) {
        if let Ok(mut work) = self.work.lock() {
            if work.current.as_deref() != Some(root) {
                work.current = Some(root.to_owned());
                work.scope = None;
            }
        }
        self.schedule(data, root, true, false);
    }

    pub fn schedule(&self, data: &Path, root: &Path, names: bool, invalidate: bool) {
        if !self.enabled.load(Ordering::Acquire) {
            return;
        }
        let Ok(mut work) = self.work.lock() else {
            return;
        };
        if invalidate && work.current.as_deref() == Some(root) {
            work.scope = None;
        }
        *work.pending.entry(root.to_owned()).or_default() |= names;
        if work.running {
            return;
        }
        work.running = true;
        drop(work);
        let service = self.clone();
        let data = data.to_owned();
        std::thread::spawn(move || {
            // Coalesce a burst of saves, structural operations and activations.
            std::thread::sleep(Duration::from_millis(120));
            loop {
                let (root, names) = {
                    let Ok(mut work) = service.work.lock() else {
                        return;
                    };
                    let Some(job) = work.pending.pop_first() else {
                        work.running = false;
                        return;
                    };
                    job
                };
                if let Err(error) = service.train(&data, &root, names) {
                    #[cfg(debug_assertions)]
                    eprintln!("Prédiction : {error}");
                    #[cfg(not(debug_assertions))]
                    let _ = error;
                }
            }
        });
    }

    fn train(&self, data: &Path, root: &Path, refresh_names: bool) -> Result<()> {
        let mut c = store::open(data)?;
        let Some(id) = store::train(&mut c, root)? else {
            return Ok(());
        };
        let existing = {
            let work = self.work.lock().app()?;
            if work.current.as_deref() != Some(root) {
                return Ok(());
            }
            work.scope.as_ref().map(|scope| scope.names.clone())
        };
        let names = match existing {
            Some(names) if !refresh_names => names,
            _ => {
                let index = crate::project::backup::source_index(data, root);
                let names = crate::voice::lexicon::snapshot(root, &index).unwrap_or_default();
                Arc::new(words::counts(&names.join("\n")))
            }
        };
        let mut work = self.work.lock().app()?;
        if work.current.as_deref() == Some(root) && self.enabled.load(Ordering::Acquire) {
            work.scope = Some(Scope { id, names });
        }
        Ok(())
    }

    fn scope(&self, root: Option<&Path>) -> Result<Option<Scope>> {
        let work = self.work.lock().app()?;
        Ok(if root.is_some() && root == work.current.as_deref() {
            work.scope.clone()
        } else {
            None
        })
    }

    pub fn status(&self, data: &Path, root: Option<&Path>) -> Result<Status> {
        let c = store::open(data)?;
        let (preferences, epoch) = store::preferences(&c)?;
        let forgotten = if let Some(root) = root {
            store::blocked(&c, &identity(root)?)?
        } else {
            false
        };
        Ok(Status {
            preferences,
            forgotten,
            epoch,
        })
    }

    pub fn configure(&self, data: &Path, value: Preferences) -> Result<()> {
        let c = store::open(data)?;
        c.execute(
            "UPDATE preferences SET enabled=?1, distinct_hint=?2, epoch=epoch+(enabled!=?1) WHERE id=1",
            rusqlite::params![value.enabled, value.distinct],
        ).app()?;
        self.enabled.store(value.enabled, Ordering::Release);
        if !value.enabled {
            self.work.lock().app()?.pending.clear();
        }
        Ok(())
    }

    pub fn reset(&self, data: &Path) -> Result<()> {
        let mut c = store::open(data)?;
        store::reset(&mut c)?;
        self.work.lock().app()?.pending.clear();
        Ok(())
    }

    pub fn forget(&self, data: &Path, root: &Path, forget: bool) -> Result<()> {
        let id = identity(root)?;
        let mut c = store::open(data)?;
        store::forget(&mut c, &id, forget)?;
        if !forget {
            self.schedule(data, root, true, true);
        }
        Ok(())
    }

    pub fn suggestion(
        &self,
        data: &Path,
        root: Option<&Path>,
        language: &str,
        text: &str,
    ) -> Result<Option<Suggestion>> {
        if !self.enabled.load(Ordering::Acquire) || !text.ends_with([' ', '\u{00a0}', '\u{202f}']) {
            return Ok(None);
        }
        let Some(language) = words::language(language) else {
            return Ok(None);
        };
        let scope = self.scope(root)?;
        let mut c = store::open(data)?;
        let tx = c.transaction().app()?;
        if !store::preferences(&tx)?.0.enabled {
            return Ok(None);
        }
        let empty = words::Counts::new();
        let (project, names) = match &scope {
            Some(scope) if !store::blocked(&tx, &scope.id)? => {
                (scope.id.as_str(), scope.names.as_ref())
            }
            _ => ("", &empty),
        };
        store::suggest(&tx, language, text, project, names, true)
    }

    pub fn feedback(
        &self,
        data: &Path,
        root: Option<&Path>,
        token: &str,
        epoch: i64,
        accepted: bool,
    ) -> Result<()> {
        if !self.enabled.load(Ordering::Acquire) {
            return Ok(());
        }
        let scope = self.scope(root)?;
        let project = scope.as_ref().map(|scope| scope.id.as_str()).unwrap_or("");
        store::feedback(&mut store::open(data)?, project, token, epoch, accepted)
    }
}

fn identity(root: &Path) -> Result<String> {
    let db = Connection::open_with_flags(
        root.canonicalize().app()?.join("ariane.sqlite"),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )
    .app()?;
    store::project_identity(root, &db)
}

#[cfg(test)]
mod tests;
