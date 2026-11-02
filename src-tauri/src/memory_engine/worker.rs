//! GLiNER-only child. No engine mutex or database transaction is held during inference.
use super::{Activity, critical_memory_pressure};
use crate::error::{AppResult, Result};
use serde_json::{json, Value};
use std::{io::{BufRead, BufReader, Write}, path::Path, process::{Child, ChildStdin, Command, Stdio}, sync::mpsc, time::{Duration, Instant}};

#[derive(Default)]
pub struct EntityEngine {
    child: Option<Child>,
    input: Option<ChildStdin>,
    output: Option<mpsc::Receiver<String>>,
    used: Option<Instant>,
    serial: u64,
}
impl EntityEngine {
    pub fn available(data: &Path, resources: &Path) -> bool {
        data.join("memory/runtime/bin/python").is_file()
            && data.join("memory/manifest.json").is_file()
            && data.join("memory/models/gliner/model.safetensors").is_file()
            && resources.join("engine/memory.py").is_file()
            && resources.join("engine/memory-model.txt").is_file()
    }
    fn start(&mut self, data: &Path, resources: &Path, activity: &Activity) -> Result<()> {
        if let Some(child) = self.child.as_mut() {
            let mut pid = activity.pid.lock().unwrap_or_else(|e| e.into_inner());
            if child.try_wait().app()?.is_none() { return Ok(()); }
            *pid = None;
        }
        self.shutdown(activity);
        if !Self::available(data, resources) {
            return Err("Le moteur de mémoire locale n’est pas installé.".into());
        }
        let mut child = Command::new(data.join("memory/runtime/bin/python"))
            .arg(resources.join("engine/memory.py"))
            .arg("--root")
            .arg(data.join("memory"))
            .env("HF_HUB_OFFLINE", "1")
            .env("TRANSFORMERS_OFFLINE", "1")
            .env("OMP_NUM_THREADS", "1")
            .env("TOKENIZERS_PARALLELISM", "false")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .app()?;
        *activity.pid.lock().unwrap_or_else(|e| e.into_inner()) = Some(child.id() as i32);
        unsafe {
            libc::setpriority(libc::PRIO_PROCESS, child.id(), 15);
        }
        activity.signal();
        self.input = child.stdin.take();
        let stdout = child.stdout.take().ok_or("Sortie du moteur indisponible")?;
        let (send, receive) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) if line.len() <= 2_000_000 => {
                        if send.send(line).is_err() {
                            break;
                        }
                    }
                    _ => break,
                }
            }
        });
        self.output = Some(receive);
        self.child = Some(child);
        Ok(())
    }
    pub fn request(
        &mut self,
        data: &Path,
        resources: &Path,
        activity: &Activity,
        text: &str,
    ) -> Result<Option<Value>> {
        self.run(data,resources,activity,json!({"operation":"entities","text":text}))
    }
    pub fn classify_note(&mut self,data:&Path,resources:&Path,activity:&Activity,title:&str,context:&str,types:Value) -> Result<Option<Value>> {
        self.run(data,resources,activity,json!({"operation":"classify_note","title":title,"text":context,"types":types}))
    }
    fn run(&mut self,data:&Path,resources:&Path,activity:&Activity,mut input:Value) -> Result<Option<Value>> {
        if activity.ner_blocked() || critical_memory_pressure() {
            return Ok(None);
        }
        self.start(data, resources, activity)?;
        self.serial += 1;
        let id = self.serial;
        input["id"] = json!(id);
        let stdin = self.input.as_mut().ok_or("Entrée du moteur indisponible")?;
        writeln!(stdin, "{input}").app()?;
        stdin.flush().app()?;
        self.used = Some(Instant::now());
        let start = Instant::now();
        let mut pressure_check = Instant::now();
        loop {
            if pressure_check.elapsed() > Duration::from_secs(1) {
                pressure_check = Instant::now();
                if critical_memory_pressure() {
                    self.shutdown(activity);
                    return Ok(None);
                }
            }
            if start.elapsed() > Duration::from_secs(180) {
                self.shutdown(activity);
                return Err("Analyse locale différée : délai dépassé.".into());
            }
            let result = self
                .output
                .as_ref()
                .ok_or("Moteur arrêté")?
                .recv_timeout(Duration::from_millis(100));
            match result {
                Ok(line) => {
                    let value: Value = serde_json::from_str(&line).app()?;
                    if value["id"].as_u64() != Some(id) {
                        continue;
                    }
                    self.used = Some(Instant::now());
                    if !value["error"].is_null() {
                        return Err(value["error"].to_string());
                    }
                    return Ok(Some(value));
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => {
                    self.shutdown(activity);
                    return Err("Le moteur local s’est arrêté.".into());
                }
            }
        }
    }
    pub fn shutdown_if_idle(&mut self, activity: &Activity) {
        if critical_memory_pressure() || self
            .used
            .is_some_and(|used| used.elapsed() > Duration::from_secs(60))
        {
            self.shutdown(activity);
        }
    }
    pub fn shutdown(&mut self, activity: &Activity) {
        // Keep unregister and reaping serialized with signal(): never signal a recycled PID.
        let mut pid = activity.pid.lock().unwrap_or_else(|e| e.into_inner());
        *pid = None;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.input = None;
        self.output = None;
        self.used = None;
    }
}
impl Drop for EntityEngine {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
