use crate::{
    inference::Engine,
    memory_engine::{Activity, EntityEngine},
    project,
    revision::RevisionEngine,
    voice,
};
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Mutex},
};
pub struct AppState {
    pub data: PathBuf,
    pub resources: PathBuf,
    pub current: Mutex<Option<PathBuf>>,
    pub source_files: crate::source_files::Files,
    pub grants: crate::path_grants::Grants,
    pub project_guard: Mutex<Option<std::sync::Arc<project::ProjectGuard>>>,
    pub engine: Mutex<Engine>,
    pub revision: Mutex<RevisionEngine>,
    pub voice: Mutex<voice::VoiceEngine>,
    pub enriching: Mutex<()>,
    pub memory_activity: Activity,
    pub memory_job: Mutex<()>,
    pub entity_engine: Mutex<EntityEngine>,
    pub indexing: AtomicBool,
    pub cancel: AtomicBool,
    pub paused: AtomicBool,
    pub export_cancel: AtomicBool,
    pub exporting: AtomicBool,
    pub exit_approved: AtomicBool,
}
