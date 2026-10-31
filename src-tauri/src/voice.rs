use crate::error::{AppResult, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, Receiver},
    time::{Duration, Instant},
};

const MAX_AUDIO_BYTES: usize = 20 * 1024 * 1024;

#[derive(Serialize)]
pub struct Transcript {
    text: String,
    raw: String,
    cleaned: bool,
}

pub fn available(data: &Path, resources: &Path) -> bool {
    let voice = data.join("voice");
    voice.join("runtime/bin/python").is_file()
        && voice.join("models/parakeet/model.safetensors").is_file()
        && voice.join("models/cleanup-1-q8_0.gguf").is_file()
        && resources.join("voice/transcribe.py").is_file()
        && resources.join("engine/llama-server").is_file()
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
    output: Receiver<String>,
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
        let (send, output) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout)
                .lines()
                .map_while(std::result::Result::ok)
            {
                if send.send(line).is_err() {
                    break;
                }
            }
        });
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
}
impl VoiceEngine {
    pub fn shutdown(&mut self) {
        self.worker = None;
        self.used = None;
    }
    pub fn shutdown_if_idle(&mut self) {
        if self
            .used
            .is_some_and(|used| used.elapsed() > Duration::from_secs(300))
        {
            self.shutdown();
        }
    }
    pub fn transcribe(
        &mut self,
        data: &Path,
        resources: &Path,
        audio: &str,
        language: &str,
        live: bool,
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
            });
        }
        // Cleanup 1 has not been trained on Italian; preserve the transcript in that case.
        let formatted = if !live && matches!(language, "fr" | "en" | "de" | "es") {
            cleanup(resources, &data.join("voice"), &raw)
                .ok()
                .filter(|s| plausible_cleanup(&raw, s))
        } else {
            None
        };
        Ok(Transcript {
            text: formatted.clone().unwrap_or_else(|| raw.clone()),
            raw,
            cleaned: formatted.is_some(),
        })
    }
}

#[cfg(test)]
fn transcribe(data: &Path, resources: &Path, audio: &str, language: &str) -> Result<Transcript> {
    VoiceEngine::default().transcribe(data, resources, audio, language, false)
}

fn plausible_cleanup(raw: &str, cleaned: &str) -> bool {
    fn words(text: &str) -> Vec<String> {
        text.split_whitespace()
            .map(|s| {
                s.trim_matches(|c: char| !c.is_alphanumeric())
                    .to_lowercase()
            })
            .filter(|s| !s.is_empty())
            .collect()
    }
    let original = words(raw);
    let result = words(cleaned);
    if original.is_empty() || result.is_empty() || result.len() > original.len() * 2 + 4 {
        return false;
    }
    let shared = result.iter().filter(|word| original.contains(word)).count();
    shared * 2 >= result.len() && shared * 3 >= original.len()
}

fn cleanup(resources: &Path, voice: &Path, raw: &str) -> Result<String> {
    let socket = std::net::TcpListener::bind("127.0.0.1:0").app()?;
    let port = socket.local_addr().app()?.port();
    drop(socket);
    let key = uuid::Uuid::new_v4().to_string();
    let _server = Process(
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
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .app()?;
    let url = format!("http://127.0.0.1:{port}");
    let start = Instant::now();
    loop {
        if client
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
    let prompt = format!("tone: formal\ntext: {}\nout:", raw.replace('\n', " "));
    let response: serde_json::Value = client.post(format!("{url}/completion"))
        .bearer_auth(key).json(&serde_json::json!({"prompt": prompt, "temperature": 0, "n_predict": 1024, "stop": ["<|endoftext|>", "<|im_end|>"]}))
        .send().app()?.error_for_status().app()?.json().app()?;
    if response["stopped_limit"].as_bool() == Some(true) {
        return Err("Mise au propre incomplète".into());
    }
    Ok(response["content"]
        .as_str()
        .ok_or("Mise au propre invalide")?
        .trim()
        .to_owned())
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
