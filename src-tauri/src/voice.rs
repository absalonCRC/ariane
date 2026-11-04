mod fidelity;
mod microphone;
pub use microphone::request_permission;
pub(crate) mod lexicon;
use crate::error::{AppResult, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{
    io::Write,
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    time::{Duration, Instant},
};

const MAX_AUDIO_BYTES: usize = 20 * 1024 * 1024;

#[derive(Serialize)]
pub struct Transcript {
    text: String,
    raw: String,
    cleaned: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    candidates: Vec<String>,
}

pub fn available(data: &Path, resources: &Path) -> bool {
    let voice = data.join("voice");
    voice.join("runtime/bin/python").is_file()
        && voice.join("models/parakeet/model.safetensors").is_file()
        && resources.join("voice/transcribe.py").is_file()
}

struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

struct VoiceWorker {
    _process: Process,
    input: ChildStdin,
    output: crate::worker_output::WorkerOutput,
}

impl VoiceWorker {
    fn start(data: &Path, resources: &Path) -> Result<Self> {
        let voice = data.join("voice");
        let mut process = Process(
            Command::new(voice.join("runtime/bin/python"))
                .arg(resources.join("voice/transcribe.py"))
                .arg("--worker")
                .arg(voice.join("models/parakeet"))
                .env("HF_HUB_OFFLINE", "1")
                .env("TRANSFORMERS_OFFLINE", "1")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .app()?,
        );
        let input = process
            .0
            .stdin
            .take()
            .ok_or("Microphone : entrée du moteur indisponible")?;
        let stdout = process
            .0
            .stdout
            .take()
            .ok_or("Microphone : sortie du moteur indisponible")?;
        let output = crate::worker_output::WorkerOutput::start(stdout, 1024 * 1024, 4);
        Ok(Self {
            _process: process,
            input,
            output,
        })
    }
    fn transcribe(&mut self, path: &Path) -> Result<String> {
        writeln!(self.input, "{}", serde_json::json!({"path":path})).app()?;
        self.input.flush().app()?;
        let line = self
            .output
            .recv_timeout(Duration::from_secs(180))
            .map_err(|_| {
                "La transcription locale est indisponible ou a dépassé son délai.".to_owned()
            })?;
        parse_transcript(&line)
    }
}

fn parse_transcript(line: &str) -> Result<String> {
    let value: serde_json::Value = serde_json::from_str(line).app()?;
    if value.get("error").is_some() {
        return Err("La transcription locale a échoué.".into());
    }
    value["text"]
        .as_str()
        .map(|text| text.trim().to_owned())
        .ok_or("Transcription invalide".into())
}

#[derive(Default)]
pub struct VoiceEngine {
    worker: Option<VoiceWorker>,
    used: Option<Instant>,
    cleanup: Option<CleanupServer>,
    warm_requests: usize,
}
impl VoiceEngine {
    #[cfg(test)]
    pub(crate) fn diagnostics(&self) -> serde_json::Value {
        serde_json::json!({"workerPid":self.worker.as_ref().map(|w|w._process.0.id()),"cleanupPid":self.cleanup.as_ref().map(|s|s.process.0.id())})
    }
    pub fn prepare(&mut self, data: &Path, resources: &Path) -> Result<()> {
        if !available(data, resources) {
            return Err("Les modèles de dictée locale ne sont pas installés.".into());
        }
        if self
            .worker
            .as_mut()
            .is_some_and(|w| w._process.0.try_wait().is_ok_and(|s| s.is_some()))
        {
            self.worker = None;
        }
        if self.worker.is_none() {
            self.worker = Some(VoiceWorker::start(data, resources)?);
        }
        self.used = Some(Instant::now());
        Ok(())
    }
    pub fn shutdown(&mut self) {
        self.worker = None;
        self.cleanup = None;
        self.used = None;
        self.warm_requests = 0;
    }
    pub fn shutdown_if_idle(&mut self) {
        if crate::memory_engine::critical_memory_pressure() {
            self.shutdown();
            return;
        }
        if self.cleanup.as_ref().is_some_and(|s| {
            s.used.elapsed()>Duration::from_secs(if s.warm_requests >= 3 { 90 } else { 30 })
        }) { self.cleanup=None; }
        if self
            .used
            .is_some_and(|used| {
            used.elapsed() > Duration::from_secs(if self.warm_requests >= 3 { 300 } else { 90 })
        })
        {
            self.shutdown();
        }
    }
    fn cleanup_text(&mut self, resources: &Path, voice: &Path, raw: &str,
        before: &str,
        after: &str,
    ) -> Result<String> {
        if self.cleanup.as_mut().is_some_and(|s| crate::local_http::require_alive(&mut s.process.0).is_err()) { self.cleanup=None; }
        if self.cleanup.is_none() { self.cleanup=Some(CleanupServer::start(resources,voice)?); }
        let result=self.cleanup.as_mut().unwrap().complete(raw, before, after);
        if result.is_err() || crate::memory_engine::critical_memory_pressure() { self.cleanup=None; }
        result
    }
    #[cfg(test)]
    pub fn transcribe(
        &mut self,
        data: &Path,
        resources: &Path,
        audio: &str,
        language: &str,
        live: bool,
    ) -> Result<Transcript> {
        self.transcribe_context(data, resources, audio, language, live, "", "", &[])
    }
    #[allow(clippy::too_many_arguments)]
    pub fn transcribe_context(
        &mut self,
        data: &Path,
        resources: &Path,
        audio: &str,
        language: &str,
        live: bool,
        before: &str,
        after: &str,
        names: &[String],
    ) -> Result<Transcript> {
        if !available(data, resources) {
            return Err("Les modèles de dictée locale ne sont pas installés.".into());
        }
        if audio.len() > MAX_AUDIO_BYTES * 4 / 3 + 8 {
            return Err("L’enregistrement est trop long.".into());
        }
        let bytes = STANDARD.decode(audio).app()?;
        if bytes.len() > MAX_AUDIO_BYTES
            || !bytes.starts_with(b"RIFF")
            || bytes.get(8..12) != Some(b"WAVE")
        {
            return Err("Enregistrement audio invalide.".into());
        }
        let mut wav = tempfile::NamedTempFile::new().app()?;
        wav.write_all(&bytes).app()?;
        if self.worker.is_none() {
            self.worker = Some(VoiceWorker::start(data, resources)?);
        }
        self.warm_requests = if self
            .used
            .is_some_and(|t| t.elapsed() < Duration::from_secs(30))
        {
            self.warm_requests + 1
        } else {
            1
        };
        let result = self.worker.as_mut().unwrap().transcribe(wav.path());
        self.used = Some(Instant::now());
        let raw = match result {
            Ok(text) => text,
            Err(error) => {
                self.shutdown();
                return Err(error);
            }
        };
        if raw.is_empty() {
            return Ok(Transcript {
                text: String::new(),
                raw,
                cleaned: false,
                candidates: vec![],
            });
        }
        // Cleanup 1 has not been trained on Italian; preserve the transcript in that case.
        let formatted = if !live
            && !crate::memory_engine::critical_memory_pressure()
            && matches!(language, "fr" | "en" | "de" | "es") {
            self.cleanup_text(resources, &data.join("voice"), &raw, before, after)
                .ok()
                .filter(|s| plausible_cleanup(&raw, s))
        } else {
            None
        };
        Ok(Transcript {
            text: formatted.clone().unwrap_or_else(|| raw.clone()),
            candidates: lexicon::candidates(&raw, names),
            raw,
            cleaned: formatted.is_some(),
        })
    }
}

#[cfg(test)]
fn transcribe(data: &Path, resources: &Path, audio: &str, language: &str) -> Result<Transcript> {
    VoiceEngine::default().transcribe(data, resources, audio, language, false)
}

pub(crate) fn plausible_cleanup(raw: &str, cleaned: &str) -> bool {
    fidelity::plausible(raw, cleaned)
}

struct CleanupServer { process: Process, client: reqwest::blocking::Client, url: String, key: String, used: Instant,
    warm_requests: usize,
}
impl CleanupServer {
fn start(resources: &Path, voice: &Path) -> Result<Self> {
    let socket = std::net::TcpListener::bind("127.0.0.1:0").app()?;
    let port = socket.local_addr().app()?.port();
    drop(socket);
    let key = uuid::Uuid::new_v4().to_string();
    let mut process = Process(
        Command::new(resources.join("engine/llama-server"))
            .arg("-m")
            .arg(voice.join("models/cleanup-1-q8_0.gguf"))
            .args([
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--api-key",
                &key,
                "-c",
                "4096",
                "-ngl",
                "99",
            ])
            .env("DYLD_LIBRARY_PATH", resources.join("engine"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .app()?,
    );
    let client = crate::local_http::client(90)?;
    let health = crate::local_http::client(1)?;
    let url = format!("http://127.0.0.1:{port}");
    let start = Instant::now();
    loop {
        crate::local_http::require_alive(&mut process.0)?;
        if health
            .get(format!("{url}/health"))
            .send()
            .is_ok_and(|r| r.status().is_success())
        {
            break;
        }
        if start.elapsed() > Duration::from_secs(45) {
            return Err("Le modèle de mise au propre n’a pas démarré.".into());
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Ok(Self { process, client, url, key, used: Instant::now(),
            warm_requests: 0,
        })
}
fn complete(&mut self, raw: &str, before: &str, after: &str) -> Result<String> {
    crate::local_http::require_alive(&mut self.process.0)?;
    let line = |s: &str| s.replace(['\n', '\r'], " ");
        let before: String = before
            .chars()
            .rev()
            .take(350)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        let after: String = after.chars().take(350).collect();
        let prompt = format!(
            "before: {}\nafter: {}\ntext: {}\nout:",
            line(&before),
            line(&after),
            line(raw));
        let tokenized = crate::local_http::json(
            self.client
                .post(format!("{}/tokenize", self.url))
                .bearer_auth(&self.key)
                .json(&serde_json::json!({"content":prompt,"add_special":true}))
                .send()
                .app()?,
        )?;
        if tokenized["tokens"]
            .as_array()
            .is_none_or(|t| t.len() + 1024 > 4096)
        {
            return Err("Dictée trop longue pour la mise au propre.".into());
        }
        let response = crate::local_http::json(self.client.post(format!("{}/completion",self.url))
        .bearer_auth(&self.key).json(&serde_json::json!({"prompt": prompt, "temperature": 0, "n_predict": 1024, "stop": ["<|endoftext|>", "<|im_end|>"]}))
        .send().app()?)?;
    crate::local_http::require_alive(&mut self.process.0)?;
        self.warm_requests = if self.used.elapsed() < Duration::from_secs(30) {
            self.warm_requests + 1
        } else {
            1
        };
    self.used=Instant::now();
    if response["stopped_limit"].as_bool() == Some(true) {
        return Err("Mise au propre incomplète".into());
    }
    Ok(response["content"]
        .as_str()
        .ok_or("Mise au propre invalide")?
        .trim()
        .to_owned())
}
}

#[cfg(test)]
mod tests {
    use super::{plausible_cleanup, transcribe};
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::path::PathBuf;

    #[test]
    fn worker_protocol_accepts_speech_and_silence_but_rejects_errors() {
        assert_eq!(
            super::parse_transcript(r#"{"text":" Bonjour. "}"#).unwrap(),
            "Bonjour."
        );
        assert_eq!(super::parse_transcript(r#"{"text":""}"#).unwrap(), "");
        assert!(super::parse_transcript(r#"{"error":"model unavailable"}"#).is_err());
        assert!(super::parse_transcript(r#"{"text":42}"#).is_err());
    }

    #[test]
    #[ignore = "requires locally installed voice models and a test WAV"]
    fn live_worker_reuses_model_without_cleanup() {
        let data = PathBuf::from(std::env::var("ARIANE_VOICE_TEST_DATA").unwrap());
        let audio = std::fs::read(std::env::var("ARIANE_VOICE_TEST_AUDIO").unwrap()).unwrap();
        let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let mut engine = super::VoiceEngine::default();
        let first = engine
            .transcribe(&data, &resources, &STANDARD.encode(&audio), "fr", true)
            .unwrap();
        assert!(!first.text.is_empty());
        assert!(!first.cleaned);
        let pid = engine.worker.as_ref().unwrap()._process.0.id();
        let second = engine
            .transcribe(&data, &resources, &STANDARD.encode(&audio), "fr", true)
            .unwrap();
        assert!(!second.text.is_empty());
        assert_eq!(engine.worker.as_ref().unwrap()._process.0.id(), pid);
        engine.shutdown();
        assert!(engine.worker.is_none());
    }

    #[test]
    fn rejects_empty_or_unrelated_output_and_keeps_a_spoken_correction() {
        let raw = "Bonjour je voudrais le rapport vendredi non plutôt lundi matin";
        assert!(plausible_cleanup(
            raw,
            "Bonjour, je voudrais le rapport lundi matin."
        ));
        assert!(!plausible_cleanup(raw, ""));
        assert!(!plausible_cleanup(
            raw,
            "Voici une réponse inventée qui change le sujet."
        ));
    }

    #[test]
    #[ignore = "requires locally installed voice models and a test WAV"]
    fn local_pipeline() {
        let data = PathBuf::from(std::env::var("ARIANE_VOICE_TEST_DATA").unwrap());
        let audio = std::fs::read(std::env::var("ARIANE_VOICE_TEST_AUDIO").unwrap()).unwrap();
        let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let transcript = transcribe(&data, &resources, &STANDARD.encode(audio), "fr").unwrap();
        assert!(!transcript.raw.is_empty());
        assert!(!transcript.text.is_empty());
        assert!(
            transcript.cleaned,
            "cleanup unexpectedly fell back to the raw transcript"
        );
    }
}
