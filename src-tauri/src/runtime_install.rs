//! Explicit user-initiated downloads. Active runtimes are published only after verification.
pub(crate) mod models;
use crate::error::{AppResult, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom, Write},
    os::unix::{fs::PermissionsExt, process::CommandExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

const UV_URL: &str =
    "https://github.com/astral-sh/uv/releases/download/0.13.9/uv-aarch64-apple-darwin.tar.gz";
const UV_SHA256: &str = "5aeca67f2283f75235de40d0bd9c0a5bbc5fce23b6d48b3bf9fa1b2db08382ca";
const SCRIPTS: &[(&str, &str)] = &[
    (
        "install_runtime.py",
        include_str!("../../scripts/install_runtime.py"),
    ),
    (
        "setup-voice.py",
        include_str!("../../scripts/setup-voice.py"),
    ),
    (
        "voice-requirements.lock",
        include_str!("../../scripts/voice-requirements.lock"),
    ),
    (
        "setup-memory.py",
        include_str!("../../scripts/setup-memory.py"),
    ),
    (
        "memory-requirements.lock",
        include_str!("../../scripts/memory-requirements.lock"),
    ),
    (
        "setup-revision.py",
        include_str!("../../scripts/setup-revision.py"),
    ),
];

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Module {
    Semantic,
    ReadingFr,
    ReadingEn,
    ReadingEs,
    Cleanup,
    Salamandra,
    Memory,
    Voice,
    Revision,
}
const MODULES: [Module; 9] = [
    Module::ReadingFr,
    Module::ReadingEn,
    Module::ReadingEs,
    Module::Semantic,
    Module::Memory,
    Module::Voice,
    Module::Cleanup,
    Module::Revision,
    Module::Salamandra,
];
impl Module {
    fn reading(self) -> Option<(&'static str, &'static str)> {
        match self {
            Self::ReadingFr => Some(("fr", include_str!("../../scripts/reading/fr.yaml"))),
            Self::ReadingEn => Some(("en", include_str!("../../scripts/reading/en.yaml"))),
            Self::ReadingEs => Some(("es", include_str!("../../scripts/reading/es.yaml"))),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Semantic => "semantic",
            Self::ReadingFr => "reading-fr",
            Self::ReadingEn => "reading-en",
            Self::ReadingEs => "reading-es",
            Self::Cleanup => "cleanup",
            Self::Salamandra => "salamandra",
            Self::Memory => "memory",
            Self::Voice => "voice",
            Self::Revision => "revision",
        }
    }

    pub(crate) fn ready(self, data: &Path, resources: &Path) -> bool {
        match self {
            Self::Semantic => crate::inference::Engine::available(resources),
            Self::Cleanup => models::cleanup(data).is_file(),
            Self::Salamandra => models::salamandra(data).is_file(),
            Self::ReadingFr | Self::ReadingEn | Self::ReadingEs => {
                models::reading_ready(data, self.reading().unwrap().0)
            }
            Self::Memory => crate::memory_engine::EntityEngine::available(data, resources),
            Self::Voice => crate::voice::available(data, resources),
            Self::Revision => [
                "revision/java/Contents/Home/bin/java",
                "revision/languagetool/languagetool-server.jar",
            ]
            .iter()
            .all(|file| data.join(file).is_file()),
        }
    }
}

#[derive(Clone, Copy, Serialize)]
struct Progress {
    module: Module,
    phase: &'static str,
}
#[derive(Serialize)]
pub struct Status {
    installed: Vec<Module>,
    active: Option<Progress>,
}

#[derive(Default)]
pub struct Installer {
    progress: Mutex<Option<Progress>>,
    cancelled: AtomicBool,
    process: Mutex<Option<u32>>,
}

impl Installer {
    pub fn status(&self, data: &Path, resources: &Path) -> Result<Status> {
        Ok(Status {
            installed: MODULES
                .into_iter()
                .filter(|module| module.ready(data, resources))
                .collect(),
            active: *self.progress.lock().app()?,
        })
    }

    pub fn cancel(&self) {
        if let Ok(progress) = self.progress.lock() {
            if progress.is_none() {
                return;
            }
            self.cancelled.store(true, Ordering::Release);
            if let Ok(process) = self.process.lock() {
                if let Some(pid) = *process {
                    // All descendants (uv, Python and model downloads) belong to this job.
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGKILL);
                    }
                }
            }
        }
    }

    fn check(&self) -> Result<()> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err("Installation interrompue.".into());
        }
        Ok(())
    }

    fn phase(&self, module: Module, phase: &'static str) -> Result<()> {
        self.check()?;
        *self.progress.lock().app()? = Some(Progress { module, phase });
        Ok(())
    }

    pub fn install(&self, data: &Path, resources: &Path, module: Module) -> Result<()> {
        {
            let mut active = self.progress.lock().app()?;
            if active.is_some() {
                return Err("Un module est déjà en cours d’installation.".into());
            }
            self.cancelled.store(false, Ordering::Release);
            *active = Some(Progress {
                module,
                phase: "bootstrap",
            });
        }
        let result = if module.ready(data, resources) {
            Ok(())
        } else {
            match module {
                Module::Voice | Module::Revision | Module::Memory => {
                    self.prepare_and_publish(data, resources, module)
                }
                _ => self.install_weights(data, module),
            }
        };
        *self.progress.lock().app()? = None;
        result
    }

    fn prepare_and_publish(&self, data: &Path, resources: &Path, module: Module) -> Result<()> {
        let cache = data.join("runtime-install");
        fs::create_dir_all(&cache).app()?;
        let job = tempfile::tempdir_in(&cache).app()?;
        let uv = self.bootstrap(job.path(), &cache)?;
        for (name, content) in SCRIPTS {
            fs::write(job.path().join(name), content).app()?;
        }
        let staged = job.path().join(module.name());
        let mut command = Command::new(&uv);
        command
            .args([
                "--no-config",
                "--no-progress",
                "run",
                "--no-project",
                "--python",
                "3.12",
            ])
            .arg(job.path().join(format!("setup-{}.py", module.name())))
            .arg("--root")
            .arg(&staged)
            .current_dir(job.path())
            .env(
                "PATH",
                format!("{}:/usr/bin:/bin:/usr/sbin:/sbin", cache.display()),
            )
            .env("UV_CACHE_DIR", cache.join("cache"))
            .env("UV_PYTHON_INSTALL_DIR", cache.join("python"))
            .env("UV_PYTHON_PREFERENCE", "only-managed")
            .env("UV_NO_CONFIG", "1")
            .env("UV_NO_PROGRESS", "1")
            .env("HF_HOME", cache.join("huggingface"))
            .env("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
            .env_remove("PYTHONPATH")
            .env_remove("PYTHONHOME")
            .env_remove("VIRTUAL_ENV");
        if module == Module::Voice {
            command.arg("--transcription-only");
        }
        if module == Module::Revision {
            command.arg("--language-only");
        }
        if module == Module::Memory {
            command
                .arg("--worker")
                .arg(resources.join("engine/memory.py"));
        }
        self.phase(module, "download")?;
        self.run(&mut command)?;
        self.phase(module, "verify")?;
        let receipt = if module == Module::Revision {
            "MANIFEST.txt"
        } else {
            "manifest.json"
        };
        if !module.ready(job.path(), resources) || !staged.join(receipt).is_file() {
            return Err("Les fichiers vérifiés du module sont incomplets.".into());
        }
        let _active = self.progress.lock().app()?;
        self.check()?;
        publish(&staged, data, module)
    }

    fn bootstrap(&self, directory: &Path, cache: &Path) -> Result<PathBuf> {
        // Re-verify the cached upstream archive before extracting executable code.
        let archive = cache.join("uv-0.13.9.tar.gz");
        if !File::open(&archive)
            .is_ok_and(|mut file| sha256(&mut file).is_ok_and(|hash| hash == UV_SHA256))
        {
            let mut download = tempfile::NamedTempFile::new_in(cache).app()?;
            let client = reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(120))
                .build()
                .app()?;
            let mut response = client.get(UV_URL).send().app()?.error_for_status().app()?;
            let mut bytes = 0usize;
            let mut buf = [0; 65536];
            loop {
                self.check()?;
                let size = response.read(&mut buf).app()?;
                if size == 0 {
                    break;
                }
                bytes += size;
                if bytes > 40 * 1024 * 1024 {
                    return Err("Archive d’installation trop volumineuse.".into());
                }
                download.write_all(&buf[..size]).app()?;
            }
            download.rewind().app()?;
            if sha256(download.as_file_mut())? != UV_SHA256 {
                return Err("Empreinte de l’installateur invalide.".into());
            }
            download.as_file().sync_all().app()?;
            download.persist(&archive).map_err(|e| e.to_string())?;
        }
        let contents = tempfile::NamedTempFile::new_in(directory).app()?;
        let mut command = Command::new("/usr/bin/tar");
        command
            .arg("-xOzf")
            .arg(&archive)
            .arg("uv-aarch64-apple-darwin/uv")
            .stdout(Stdio::from(contents.reopen().app()?));
        self.run(&mut command)?;
        let uv = cache.join("uv");
        fs::set_permissions(contents.path(), fs::Permissions::from_mode(0o700)).app()?;
        contents.persist(&uv).map_err(|e| e.to_string())?;
        Ok(uv)
    }

    fn run(&self, command: &mut Command) -> Result<()> {
        let mut log = tempfile::tempfile().app()?;
        let mut child = {
            let mut process = self.process.lock().app()?;
            self.check()?;
            let child = command
                .process_group(0)
                .stderr(log.try_clone().app()?)
                .spawn()
                .app()?;
            *process = Some(child.id());
            child
        };
        let status = loop {
            let mut process = self.process.lock().app()?;
            if let Some(status) = child.try_wait().app()? {
                *process = None;
                break status;
            }
            drop(process);
            std::thread::sleep(Duration::from_millis(60));
        };
        self.check()?;
        if !status.success() {
            let length = log.metadata().app()?.len();
            log.seek(SeekFrom::Start(length.saturating_sub(2048)))
                .app()?;
            let mut message = Vec::new();
            log.read_to_end(&mut message).app()?;
            return Err(format!(
                "Installation du module interrompue. {}",
                String::from_utf8_lossy(&message).trim()
            ));
        }
        Ok(())
    }
}

fn publish(staged: &Path, data: &Path, module: Module) -> Result<()> {
    let target = data.join(module.name());
    let previous = if target.symlink_metadata().is_ok() {
        let previous = data.join(format!(
            "{}.previous-{}",
            module.name(),
            uuid::Uuid::new_v4()
        ));
        fs::rename(&target, &previous).app()?;
        Some(previous)
    } else {
        None
    };
    if let Err(error) = fs::rename(staged, &target) {
        if let Some(previous) = previous {
            fs::rename(previous, &target).app()?;
        }
        return Err(error.to_string());
    }
    Ok(())
}

fn sha256(file: &mut File) -> Result<String> {
    let mut hash = Sha256::new();
    std::io::copy(file, &mut hash).app()?;
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interrupts_a_process_group_then_allows_a_retry() {
        let installer = Installer::default();
        *installer.progress.lock().unwrap() = Some(Progress {
            module: Module::Voice,
            phase: "download",
        });
        std::thread::scope(|scope| {
            let run = scope.spawn(|| installer.run(Command::new("/bin/sleep").arg("10")));
            for _ in 0..100 {
                if installer.process.lock().unwrap().is_some() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            assert!(installer.process.lock().unwrap().is_some());
            installer.cancel();
            assert!(run.join().unwrap().unwrap_err().contains("interrompue"));
        });
        installer.cancelled.store(false, Ordering::Release);
        assert!(installer.run(&mut Command::new("/usr/bin/true")).is_ok());
    }

    #[test]
    fn a_failed_publication_preserves_the_previous_runtime() {
        let data = tempfile::tempdir().unwrap();
        let original = data.path().join("voice");
        fs::create_dir(&original).unwrap();
        fs::write(original.join("marker"), "previous").unwrap();
        assert!(publish(&data.path().join("missing"), data.path(), Module::Voice).is_err());
        assert_eq!(
            fs::read_to_string(original.join("marker")).unwrap(),
            "previous"
        );
    }
}
