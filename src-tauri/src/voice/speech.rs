use crate::error::{AppResult, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{
    fs::{self, File},
    io::Write,
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct Reading {
    active: Mutex<Option<String>>,
}

#[derive(Serialize)]
pub struct Segment {
    audio: String,
    tokens: Vec<(usize, u64)>,
}

impl Reading {
    pub fn control(&self, id: String, active: bool) -> Result<()> {
        uuid::Uuid::parse_str(&id).app()?;
        let mut current = self.active.lock().app()?;
        if active {
            *current = Some(id);
        } else if current.as_ref() == Some(&id) {
            *current = None;
        }
        Ok(())
    }

    fn check(&self, id: &str) -> Result<()> {
        if self.active.lock().app()?.as_deref() == Some(id) {
            Ok(())
        } else {
            Err("Lecture interrompue.".into())
        }
    }

    fn run(&self, id: &str, command: &mut Command, text: &str, label: &str) -> Result<()> {
        self.check(id)?;
        let mut child = command
            .stdin(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("{label} indisponible ({e})."))?;
        let deadline = Instant::now() + Duration::from_secs(60);
        let result = (|| {
            child
                .stdin
                .take()
                .ok_or("Entrée audio indisponible.")?
                .write_all(text.as_bytes())
                .app()?;
            loop {
                self.check(id)?;
                if let Some(status) = child.try_wait().app()? {
                    return if status.success() {
                        Ok(())
                    } else {
                        Err(format!("{label} a échoué ({status})."))
                    };
                }
                if Instant::now() >= deadline {
                    return Err(format!("{label} a dépassé le délai de lecture."));
                }
                thread::sleep(Duration::from_millis(15));
            }
        })();
        if result.is_err() {
            let _ = child.kill();
            let _ = child.wait();
        }
        result
    }

    pub fn render(
        &self,
        data: &Path,
        resources: &Path,
        id: &str,
        language: &str,
        text: &str,
    ) -> Result<Segment> {
        self.check(id)?;
        if !matches!(language, "fr" | "en" | "es")
            || text.trim().is_empty()
            || text.len() > 512
            || text.contains('\0')
        {
            return Err("Langue ou passage de lecture invalide.".into());
        }
        if !crate::runtime_install::models::reading_ready(data, language) {
            return Err("Téléchargez la voix de cette langue dans Paramètres → Modèles locaux.".into());
        }
        let root = resources.join("reading");
        let temporary = tempfile::tempdir().app()?;
        let wav = temporary.path().join("segment.wav");
        self.run(
            id,
            Command::new(root.join("pocket-tts"))
                .current_dir(crate::runtime_install::models::reading_dir(data, language))
                .env("HF_HUB_OFFLINE", "1")
                .args([
                    "generate",
                    "--config",
                    "config.yaml",
                    "--voice",
                    "voice.safetensors",
                    "--text",
                    "-",
                    "--output-path",
                ])
                .arg(&wav)
                .stdout(Stdio::null()),
            text,
            "Pocket TTS",
        )?;
        if fs::metadata(&wav).app()?.len() > 4_000_000 {
            return Err("Segment audio trop long.".into());
        }
        let timing = temporary.path().join("timing");
        self.run(
            id,
            Command::new(root.join("align"))
                .arg(crate::runtime_install::models::aligner_weights(data))
                .arg(&wav)
                .arg(language)
                .stdout(File::create(&timing).app()?),
            text,
            "Alignement de la lecture",
        )?;
        let mut tokens = Vec::new();
        for line in fs::read_to_string(timing).app()?.lines() {
            let (offset, ms) = line.split_once(' ').ok_or("Repère de lecture invalide.")?;
            tokens.push((offset.parse().app()?, ms.parse().app()?));
        }
        self.check(id)?;
        if tokens.is_empty() {
            return Err("Aucun repère de lecture.".into());
        }
        Ok(Segment {
            audio: STANDARD.encode(fs::read(wav).app()?),
            tokens,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn a_late_stop_cannot_cancel_the_next_language() {
        let reading = Reading::default();
        let first = uuid::Uuid::new_v4().to_string();
        let second = uuid::Uuid::new_v4().to_string();
        reading.control(first.clone(), true).unwrap();
        reading.control(second.clone(), true).unwrap();
        reading.control(first.clone(), false).unwrap();
        assert!(reading.check(&second).is_ok());
        assert!(reading
            .render(Path::new("missing"), Path::new("missing"), &first, "en", "Hello")
            .is_err());
        assert!(reading
            .render(Path::new("missing"), Path::new("missing"), &second, "../en", "Hello")
            .is_err());
    }

    #[test]
    fn stopping_a_running_segment_reaps_its_process() {
        let reading = Arc::new(Reading::default());
        let id = uuid::Uuid::new_v4().to_string();
        reading.control(id.clone(), true).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let marker = directory.path().join("started");
        let engine = reading.clone();
        let job = id.clone();
        let path = marker.clone();
        let thread = std::thread::spawn(move || {
            engine.run(
                &job,
                Command::new("/bin/sh")
                    .args([
                        "-c",
                        "cat >/dev/null; echo $$ > \"$1\"; exec sleep 10",
                        "reading",
                    ])
                    .arg(path),
                "hello",
                "test",
            )
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while !marker.exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        reading.control(id, false).unwrap();
        assert_eq!(thread.join().unwrap().unwrap_err(), "Lecture interrompue.");
        let pid = fs::read_to_string(marker).unwrap();
        let result = Command::new("/bin/ps")
            .args(["-p", pid.trim()])
            .output()
            .unwrap();
        assert!(!result.status.success());
    }
}
