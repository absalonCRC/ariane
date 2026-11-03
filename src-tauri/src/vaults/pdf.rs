//! Bounded, cancellable execution of the PDFKit helper.
use crate::error::{AppResult, Result};
use std::os::{fd::AsRawFd, unix::process::CommandExt};
use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

const MAX_PAGES: usize = 500;
const MAX_OUTPUT: usize = 8 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);

pub(super) fn extract(helper: &Path, path: &Path, cancel: &AtomicBool) -> Result<Vec<String>> {
    extract_with_limits(helper, path, cancel, TIMEOUT, MAX_OUTPUT, MAX_PAGES)
}

fn extract_with_limits(
    helper: &Path,
    path: &Path,
    cancel: &AtomicBool,
    timeout: Duration,
    max_output: usize,
    max_pages: usize,
) -> Result<Vec<String>> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Indexation suspendue.".into());
    }
    // The helper is isolated in its own process group so that a stuck descendant
    // cannot keep a pipe open after cancellation or a timeout.
    let mut child = Command::new(helper)
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .app()?;
    let mut stdout = child.stdout.take().ok_or("Sortie PDF indisponible")?;
    let fd = stdout.as_raw_fd();
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        terminate(&mut child);
        return Err("Impossible de surveiller l’extraction PDF".into());
    }
    let started = Instant::now();
    let mut bytes = Vec::new();
    let mut buf = [0u8; 16384];
    let mut exited = None;
    let mut eof = false;
    let result = 'outer: loop {
        if cancel.load(Ordering::Relaxed) {
            break Err("Indexation suspendue.".into());
        }
        if started.elapsed() >= timeout {
            break Err("Extraction PDF trop longue".into());
        }
        loop {
            match stdout.read(&mut buf) {
                Ok(0) => {
                    eof = true;
                    break;
                }
                Ok(n) => {
                    if bytes.len().saturating_add(n) > max_output {
                        break 'outer Err("Texte PDF trop volumineux".into());
                    }
                    bytes.extend_from_slice(&buf[..n]);
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(e) => break 'outer Err(e.to_string()),
            }
            continue;
        }
        if exited.is_none() {
            match child.try_wait() {
                Ok(status) => exited = status,
                Err(e) => break Err(e.to_string()),
            }
        }
        if let Some(status) = exited {
            if !status.success() {
                break Err("PDF illisible, protégé ou trop volumineux".into());
            }
            if eof {
                break serde_json::from_slice::<Vec<String>>(&bytes)
                    .app()
                    .and_then(|pages| {
                        if pages.len() <= max_pages {
                            Ok(pages)
                        } else {
                            Err("PDF trop long".into())
                        }
                    });
            }
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    if result.is_err() {
        terminate(&mut child);
    }
    result
}
fn terminate(child: &mut std::process::Child) {
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::PermissionsExt};
    fn helper(body: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("helper");
        fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
        fs::set_permissions(&p, fs::Permissions::from_mode(0o755)).unwrap();
        (d, p)
    }
    #[test]
    fn kills_stalled_helpers_and_honours_cancellation() {
        let (_d, h) = helper("sleep 10");
        let cancel = AtomicBool::new(false);
        let now = Instant::now();
        assert!(extract_with_limits(
            &h,
            Path::new("unused"),
            &cancel,
            Duration::from_millis(100),
            1024,
            2
        )
        .is_err());
        assert!(now.elapsed() < Duration::from_secs(2));
        std::thread::scope(|s| {
            s.spawn(|| {
                std::thread::sleep(Duration::from_millis(50));
                cancel.store(true, Ordering::Relaxed);
            });
            assert!(extract_with_limits(
                &h,
                Path::new("unused"),
                &cancel,
                Duration::from_secs(5),
                1024,
                2
            )
            .unwrap_err()
            .contains("suspendue"));
        });
    }
    #[test]
    fn limits_bytes_and_page_count() {
        let (_d, h) = helper("printf '[\"123456789012345\"]'");
        assert!(extract_with_limits(
            &h,
            Path::new("unused"),
            &AtomicBool::new(false),
            Duration::from_secs(2),
            8,
            5
        )
        .is_err());
        let (_d, h) = helper("printf '[\"a\",\"b\",\"c\"]'");
        assert!(extract_with_limits(
            &h,
            Path::new("unused"),
            &AtomicBool::new(false),
            Duration::from_secs(2),
            1024,
            2
        )
        .is_err());
    }
}
