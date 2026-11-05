//! Admission before spawn_blocking: bounded work and a separate save lane.
use crate::error::Result;
use serde_json::Value;
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    Arc, LazyLock,
};
struct Lane {
    semaphore: Arc<tokio::sync::Semaphore>,
    waiting: AtomicUsize,
    capacity: usize,
}
impl Lane {
    fn new(active: usize, capacity: usize) -> Self {
        Self {
            semaphore: Arc::new(tokio::sync::Semaphore::new(active)),
            waiting: AtomicUsize::new(0),
            capacity,
        }
    }
}
static SAVE: LazyLock<Lane> = LazyLock::new(|| Lane::new(2, 16));
static CONTROL: LazyLock<Lane> = LazyLock::new(|| Lane::new(4, 32));
static NORMAL: LazyLock<Lane> = LazyLock::new(|| Lane::new(6, 32));
static HEAVY: LazyLock<Lane> = LazyLock::new(|| Lane::new(2, 12));
static SEARCH: AtomicU64 = AtomicU64::new(0);
static SUGGEST: AtomicU64 = AtomicU64::new(0);
static REVISION: AtomicU64 = AtomicU64::new(0);
struct Waiting(&'static Lane);
impl Drop for Waiting {
    fn drop(&mut self) {
        self.0.waiting.fetch_sub(1, Ordering::SeqCst);
    }
}
pub async fn admit(kind: &str) -> Result<tokio::sync::OwnedSemaphorePermit> {
    let (lane, latest) = match kind {
        "save" | "resolveExternal" => (&*SAVE, None),
        "memoryActivity" | "cancelIndex" | "cancelExport" | "quit" | "voiceStatus"
        | "engineStatus" | "memoryStatus" => (&*CONTROL, None),
        "search" => (&*HEAVY, Some(&SEARCH)),
        "suggest" => (&*HEAVY, Some(&SUGGEST)),
        "revisionCheck" => (&*HEAVY, Some(&REVISION)),
        "index" | "scan" | "voiceTranscribe" | "enrich" | "memoryQueue" | "memoryEntities"
        | "export" | "importPreview" | "importIntoProject" => (&*HEAVY, None),
        _ => (&*NORMAL, None),
    };
    if lane.waiting.fetch_add(1, Ordering::SeqCst) >= lane.capacity {
        lane.waiting.fetch_sub(1, Ordering::SeqCst);
        return Err("Trop de tâches en cours. Réessayez dans un instant.".into());
    }
    let _waiting = Waiting(lane);
    let generation = latest.map(|counter| counter.fetch_add(1, Ordering::SeqCst) + 1);
    let permit = lane
        .semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| e.to_string())?;
    if latest
        .zip(generation)
        .is_some_and(|(counter, n)| counter.load(Ordering::SeqCst) != n)
    {
        return Err("Demande remplacée par une demande plus récente.".into());
    }
    Ok(permit)
}
pub fn validate(request: &Value) -> Result<()> {
    let kind = request["type"].as_str().ok_or("Commande invalide")?;
    let max = match kind {
        "save" | "mergeBranch" => 128 * 1024 * 1024,
        "voiceTranscribe" => 28 * 1024 * 1024,
        "update" | "resolveExternal" => 64 * 1024 * 1024,
        _ => 1024 * 1024,
    };
    fn size(value: &Value, depth: usize, total: &mut usize, max: usize) -> Result<()> {
        if depth > 40 {
            return Err("Requête trop imbriquée".into());
        }
        *total = total.saturating_add(8);
        match value {
            Value::String(s) => *total = total.saturating_add(s.len()),
            Value::Array(values) => {
                if values.len() > 100_000 {
                    return Err("Liste trop longue".into());
                }
                for v in values {
                    size(v, depth + 1, total, max)?;
                }
            }
            Value::Object(values) => {
                if values.len() > 128 {
                    return Err("Objet trop complexe".into());
                }
                for (k, v) in values {
                    *total = total.saturating_add(k.len());
                    size(v, depth + 1, total, max)?;
                }
            }
            _ => (),
        }
        if *total > max {
            return Err("Requête trop volumineuse".into());
        }
        Ok(())
    }
    size(request, 0, &mut 0, max)?;
    let string_limit = |field: &str, limit: usize| -> Result<()> {
        if request[field].as_str().is_some_and(|s| s.len() > limit) {
            Err(format!("Champ {field} trop long"))
        } else {
            Ok(())
        }
    };
    for key in ["path", "source", "projectPath", "vaultPath"] {
        string_limit(key, 8192)?;
    }
    string_limit("query", 8192)?;
    string_limit("name", 4096)?;
    string_limit("title", 4096)?;
    if kind == "suggest" {
        string_limit("text", 128 * 1024)?;
    }
    if kind == "revisionCheck" {
        string_limit("text", 3200)?;
    }
    if kind == "save"
        && request["patches"]
            .as_array()
            .is_some_and(|p| p.len() > 10_000)
    {
        return Err("Trop de sections dans une sauvegarde".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_before_deserialization_and_reserves_save_capacity() {
        assert!(validate(&serde_json::json!({"type":"search","query":"a".repeat(9000)})).is_err());
        assert!(validate(&serde_json::json!({"type":"save","patches":[]})).is_ok());
        let _a = HEAVY.semaphore.clone().try_acquire_owned().unwrap();
        let _b = HEAVY.semaphore.clone().try_acquire_owned().unwrap();
        assert!(HEAVY.semaphore.clone().try_acquire_owned().is_err());
        assert!(SAVE.semaphore.clone().try_acquire_owned().is_ok());
    }
}
