use crate::{error::{AppResult, Result}, local_http};
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
pub const MODEL_ID: &str = "embeddinggemma-300M-Q8_0";
pub struct Engine {
    child: Option<Child>,
    port: u16,
    key: String,
    client: Option<reqwest::blocking::Client>,
    last_used: Option<Instant>,
}
impl Default for Engine {
    fn default() -> Self {
        Self {
            child: None,
            port: 0,
            key: uuid::Uuid::new_v4().to_string(),
            client: None,
            last_used: None,
        }
    }
}
impl Drop for Engine {
    fn drop(&mut self) {
        if let Some(c) = &mut self.child {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}
impl Engine {
    pub fn available(resources: &Path) -> bool {
        resources.join("models/embeddinggemma-300M-Q8_0.gguf").is_file()
            && resources.join("engine/llama-server").is_file()
    }
    #[cfg(feature = "performance-harness")]
    pub fn pid(&self) -> Option<u32> {
        self.child.as_ref().map(Child::id)
    }
    pub fn shutdown_if_idle(&mut self) {
        if self
            .last_used
            .is_some_and(|used| used.elapsed() > Duration::from_secs(120))
        {
            self.shutdown();
            self.client = None;
            self.last_used = None;
        }
    }
    pub fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.client = None;
        self.last_used = None;
    }
    pub fn ensure(&mut self, resources: &Path) -> Result<()> {
        if let Some(c) = &mut self.child {
            if c.try_wait().app()?.is_none() {
                return Ok(());
            }
        }
        self.shutdown();
        self.key = uuid::Uuid::new_v4().to_string();
        let model = resources.join("models/embeddinggemma-300M-Q8_0.gguf");
        let bin = resources.join("engine/llama-server");
        if !model.is_file() || !bin.is_file() {
            return Err("Le moteur de recherche locale n’est pas installé.".into());
        }
        let socket = std::net::TcpListener::bind("127.0.0.1:0").app()?;
        self.port = socket.local_addr().app()?.port();
        drop(socket);
        self.child = Some(
            Command::new(bin)
                .args([
                    "-m",
                    &model.to_string_lossy(),
                    "--api-key",
                    &self.key,
                    "--embedding",
                    "--pooling",
                    "mean",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    &self.port.to_string(),
                    "-c",
                    "2048",
                    "-b",
                    "2048",
                    "-ub",
                    "2048",
                    "-np",
                    "1",
                    "-ngl",
                    "99",
                ])
                .env("DYLD_LIBRARY_PATH", resources.join("engine"))
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .app()?,
        );
        let start = Instant::now();
        let c = local_http::client(1)?;
        while start.elapsed() < Duration::from_secs(45) {
            if let Err(error) = local_http::require_alive(self.child.as_mut().ok_or("Moteur arrêté")?) {
                self.shutdown();
                return Err(error);
            }
            if c.get(format!("http://127.0.0.1:{}/health", self.port))
                .bearer_auth(&self.key)
                .send()
                .is_ok_and(|r| r.status().is_success())
            {
                local_http::require_alive(self.child.as_mut().ok_or("Moteur arrêté")?)?;
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        self.shutdown();
        Err("Le modèle local n’a pas démarré dans le délai prévu.".into())
    }
    pub fn embed(&mut self, resources: &Path, text: &str, query: bool) -> Result<Vec<f32>> {
        self.embed_idle(resources, text, query, || false)?
            .ok_or_else(|| "Calcul interrompu.".into())
    }
    // Background work yields between bounded forwards. Never suspend the shared
    // server: documentary search uses the same process and must stay available.
    pub fn embed_idle(&mut self, resources: &Path, text: &str, query: bool, interrupted: impl Fn() -> bool) -> Result<Option<Vec<f32>>> {
        if interrupted() { return Ok(None); }
        let parts = split_input(text, 1200);
        if parts.len() <= 1 {
            let vector = self.embed_one(resources, text, query)?;
            return Ok((!interrupted()).then_some(vector));
        }
        let mut sum = vec![0f64; 768];
        for part in parts {
            if interrupted() { return Ok(None); }
            let vector = self.embed_one(resources, part, query)?;
            for (total, value) in sum.iter_mut().zip(vector) {
                *total += value as f64 * part.len() as f64;
            }
        }
        let norm = sum.iter().map(|x| x * x).sum::<f64>().sqrt();
        if !norm.is_finite() || norm <= 0. {
            return Err("Le modèle a renvoyé un vecteur vide".into());
        }
        Ok((!interrupted()).then(|| sum.into_iter().map(|x| (x / norm) as f32).collect()))
    }
    fn embed_one(&mut self, resources: &Path, text: &str, query: bool) -> Result<Vec<f32>> {
        self.ensure(resources)?;
        self.last_used = Some(Instant::now());
        let prefix = if query {
            "task: search result | query: "
        } else {
            "title: none | text: "
        };
        if self.client.is_none() {
            self.client = Some(local_http::client(30)?);
        }
        let c = self.client.as_ref().unwrap();
        local_http::require_alive(self.child.as_mut().ok_or("Moteur arrêté")?)?;
        let v = local_http::json(c
            .post(format!("http://127.0.0.1:{}/v1/embeddings", self.port))
            .bearer_auth(&self.key)
            .json(&serde_json::json!({"input":format!("{prefix}{text}"),"model":MODEL_ID}))
            .send().app()?)?;
        local_http::require_alive(self.child.as_mut().ok_or("Moteur arrêté")?)?;
        let values = v["data"][0]["embedding"]
            .as_array()
            .ok_or("Vecteur local invalide")?;
        let mut out: Vec<f32> = values
            .iter()
            .filter_map(|x| x.as_f64().map(|x| x as f32))
            .collect();
        if out.len() != 768 {
            return Err("Dimension inattendue du modèle local".into());
        }
        let n = out.iter().map(|x| x * x).sum::<f32>().sqrt();
        if !n.is_finite() || n <= 0. {
            return Err("Le modèle a renvoyé un vecteur vide".into());
        }
        out.iter_mut().for_each(|v| *v /= n);
        Ok(out)
    }
}
pub fn cosine(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() {
        return 0.;
    }
    a.iter()
        .zip(b)
        .map(|(x, y)| (*x as f64) * (*y as f64))
        .sum()
}

// Byte-limited pieces preserve all UTF-8 input, including very long unbroken words.
fn split_input(text: &str, limit: usize) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let mut end = (start + limit).min(text.len());
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        if end < text.len() {
            if let Some(space) = text[start..end].rfind(char::is_whitespace) {
                if space > limit / 2 {
                    end = start + space + text[start + space..].chars().next().unwrap().len_utf8();
                }
            }
        }
        parts.push(&text[start..end]);
        start = end;
    }
    parts
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn embeds_a_long_synthetic_french_passage() {
        let text = "La mémoire des lieux traverse les siècles, les récits et les voix. ".repeat(150);
        let resources = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let vector = Engine::default().embed(&resources,&text,false).unwrap();
        assert_eq!(vector.len(),768);
        assert!((vector.iter().map(|x|x*x).sum::<f32>() - 1.).abs() < 0.001);
    }
    #[test]
    fn splits_long_unicode_and_unbroken_text_without_losing_bytes() {
        let text = format!("{} {}", "é🙂".repeat(4000), "x".repeat(5000));
        let parts = split_input(&text, 1200);
        assert!(parts.iter().all(|p| p.len() <= 1200));
        assert_eq!(parts.concat(), text);
    }
}
