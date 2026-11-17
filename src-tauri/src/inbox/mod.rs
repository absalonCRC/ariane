pub mod backup;
pub mod commands;
pub mod model;
pub mod storage;
pub mod transfer;
use crate::error::{AppResult, Result};
use std::{
    fs::{File, OpenOptions},
    os::fd::AsRawFd,
    path::Path,
    sync::Mutex,
};

pub struct Service {
    pub gate: Mutex<()>,
    _guard: File,
}
impl Service {
    pub fn new(data: &Path) -> Result<Self> {
        let guard = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(data.join("inbox.lock"))
            .app()?;
        if unsafe { libc::flock(guard.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            return Err(
                "La boîte de réception est déjà ouverte par une autre instance d’ariane.".into(),
            );
        }
        storage::db(data)?;
        Ok(Self {
            gate: Mutex::new(()),
            _guard: guard,
        })
    }
}
use std::os::unix::fs::OpenOptionsExt;
#[cfg(test)]
mod tests;
