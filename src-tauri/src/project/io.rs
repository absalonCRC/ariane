//! Project file access anchored to an open directory descriptor.
use crate::error::{AppResult, Result};
use std::{
    fs::File,
    io::{Read, Write},
    path::Path,
};

pub fn validate_id(id: &str) -> Result<()> {
    if id.len() > 240 || id.is_empty() || id == "." || id == ".." || id.contains(['/', '\\', '\0'])
    {
        return Err("Identifiant de section invalide.".into());
    }
    Ok(())
}

#[cfg(unix)]
mod platform {
    use super::*;
    use std::{
        ffi::CString,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::ffi::OsStrExt,
        },
    };

    fn name(s: &str) -> Result<CString> {
        CString::new(s).app()
    }
    fn last() -> String {
        std::io::Error::last_os_error().to_string()
    }
    pub struct Dir(pub File);
    impl Dir {
        pub fn open(path: &Path) -> Result<Self> {
            let path = CString::new(path.as_os_str().as_bytes()).app()?;
            let fd = unsafe {
                libc::open(
                    path.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                )
            };
            if fd < 0 {
                return Err(last());
            }
            Ok(Self(unsafe { File::from_raw_fd(fd) }))
        }
        pub fn child(&self, component: &str, create: bool) -> Result<Option<Self>> {
            let n = name(component)?;
            if create && unsafe { libc::mkdirat(self.0.as_raw_fd(), n.as_ptr(), 0o700) } != 0 {
                let err = std::io::Error::last_os_error();
                if err.kind() != std::io::ErrorKind::AlreadyExists {
                    return Err(err.to_string());
                }
            }
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    n.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                )
            };
            if fd < 0 {
                let err = std::io::Error::last_os_error();
                if !create && err.kind() == std::io::ErrorKind::NotFound {
                    return Ok(None);
                }
                return Err(format!(
                    "Dossier interne {component} inaccessible ou redirigé : {err}"
                ));
            }
            Ok(Some(Self(unsafe { File::from_raw_fd(fd) })))
        }
        pub fn open_file(&self, component: &str, flags: i32, mode: u32) -> Result<Option<File>> {
            let n = name(component)?;
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    n.as_ptr(),
                    flags | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
                    mode as libc::c_uint,
                )
            };
            if fd < 0 {
                let err = std::io::Error::last_os_error();
                if err.kind() == std::io::ErrorKind::NotFound {
                    return Ok(None);
                }
                return Err(format!(
                    "Fichier interne {component} inaccessible ou redirigé : {err}"
                ));
            }
            let file = unsafe { File::from_raw_fd(fd) };
            if !file.metadata().app()?.is_file() {
                return Err(format!("Fichier interne {component} invalide."));
            }
            Ok(Some(file))
        }
        pub fn read(&self, component: &str) -> Result<Option<String>> {
            let Some(mut file) = self.open_file(component, libc::O_RDONLY, 0)? else {
                return Ok(None);
            };
            let mut text = String::new();
            file.read_to_string(&mut text).app()?;
            Ok(Some(text))
        }
        pub fn write_atomic(&self, component: &str, text: &str) -> Result<()> {
            let target = name(component)?;
            let temp = format!(".ariane-{}.tmp", uuid::Uuid::new_v4());
            let temp_name = name(&temp)?;
            let mut file = self
                .open_file(&temp, libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL, 0o600)?
                .ok_or("Création temporaire impossible.")?;
            let result = (|| {
                file.write_all(text.as_bytes()).app()?;
                file.sync_all().app()?;
                if unsafe {
                    libc::renameat(
                        self.0.as_raw_fd(),
                        temp_name.as_ptr(),
                        self.0.as_raw_fd(),
                        target.as_ptr(),
                    )
                } != 0
                {
                    return Err(last());
                }
                self.0.sync_all().app()?;
                Ok(())
            })();
            if result.is_err() {
                unsafe {
                    libc::unlinkat(self.0.as_raw_fd(), temp_name.as_ptr(), 0);
                }
            }
            result
        }
    }
    pub fn lock(dir: &Dir) -> Result<File> {
        let file = dir
            .open_file(".ariane.lock", libc::O_RDWR | libc::O_CREAT, 0o600)?
            .ok_or("Verrou de projet inaccessible.")?;
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            return Err("Ce projet est déjà ouvert en écriture dans une autre instance.".into());
        }
        Ok(file)
    }
}
#[cfg(unix)]
pub use platform::{lock, Dir};

#[cfg(not(unix))]
compile_error!("L'accès sécurisé aux projets Ariane nécessite les appels système Unix.");
