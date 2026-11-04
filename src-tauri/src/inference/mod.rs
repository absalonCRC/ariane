pub(crate) mod encoding;
use crate::{error::{AppResult, Result}, local_http,
};
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
pub const MODEL_ID: &str = "embeddinggemma-300M-Q8_0:sentence-tokens-v2";
pub struct Engine {
    child: Option<Child>,
    port: u16,
    key: String,
    client: Option<reqwest::blocking::Client>,
    last_used: Option<Instant>,
    cache: std::collections::HashMap<String, Vec<f32>>,
    pub embedding_requests: usize,
    pub cache_hits: usize,
    warm_requests: usize,
}
impl Default for Engine {
    fn default() -> Self {
        Self {
            child: None,
            port: 0,
            key: uuid::Uuid::new_v4().to_string(),
            client: None,
            last_used: None,
            cache: Default::default(),
            embedding_requests: 0,
            cache_hits: 0,
            warm_requests: 0,
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
        if crate::memory_engine::critical_memory_pressure()
            || self
            .last_used
            .is_some_and(|used| {
                used.elapsed() > Duration::from_secs(if self.warm_requests >= 3 { 240 } else { 60 })
            })
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
        self.warm_requests = 0;
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
    pub fn embed_idle(&mut self, resources: &Path, text: &str, query: bool, interrupted: impl Fn() -> bool,
    ) -> Result<Option<Vec<f32>>> {
        self.embed_titled_idle(resources, text, None, query, interrupted)
    }
    pub fn embed_titled_idle(
        &mut self,
        resources: &Path,
        text: &str,
        title: Option<&str>,
        query: bool,
        interrupted: impl Fn() -> bool,
    ) -> Result<Option<Vec<f32>>> {
        if interrupted() { return Ok(None); }
        self.ensure(resources)?;
        let ranges = encoding::split(text, |part| {
            self.token_count(resources, &encoding::prompt(part, title, query))
                .map(|n| n <= encoding::TOKENS)
        })?;
        if ranges.is_empty() {
            return Err("Texte à encoder vide.".into());
        }
        let inputs: Vec<_> = ranges
            .iter()
            .map(|r| encoding::prompt(&text[r.clone()], title, query))
            .collect();
        let mut vectors = Vec::new();
        // Two 512-token inputs fit the server's 2048-token bounded forward.
        for batch in inputs.chunks(2) {
            if interrupted() { return Ok(None); }
            vectors.extend(self.embed_batch(resources, batch)?);
        }
        let mut sum = vec![0f32; 768];
        for (range, vector) in ranges.iter().zip(vectors) {
            for (total, value) in sum.iter_mut().zip(vector) {
                *total += value * (range.end - range.start) as f32;
            }
        }
        normalize(&mut sum)?;
        Ok((!interrupted()).then_some(sum))
    }
    pub fn token_count(&mut self, resources: &Path, text: &str) -> Result<usize> {
        self.ensure(resources)?;
        if self.client.is_none() {
            self.client = Some(local_http::client(30)?);
        }
        let v = local_http::json(
            self.client
                .as_ref()
                .unwrap()
                .post(format!("http://127.0.0.1:{}/tokenize", self.port))
                .bearer_auth(&self.key)
                .json(&serde_json::json!({"content":text,"add_special":true}))
                .send()
                .app()?,
        )?;
        v["tokens"]
            .as_array()
            .map(Vec::len)
            .ok_or_else(|| "Tokenisation locale invalide.".into())
    }
    pub fn embed_batch(&mut self, resources: &Path, inputs: &[String]) -> Result<Vec<Vec<f32>>> {
        self.ensure(resources)?;
        self.warm_requests = if self
            .last_used
            .is_some_and(|t| t.elapsed() < Duration::from_secs(30))
        {
            self.warm_requests + 1
        } else {
            1
        };
        self.last_used = Some(Instant::now());
        self.cache_hits += inputs
            .iter()
            .filter(|s| self.cache.contains_key(*s))
            .count();
        let mut seen = std::collections::HashSet::new();
        let missing: Vec<_> = inputs
            .iter()
            .filter(|s| !self.cache.contains_key(*s) && seen.insert(s.as_str()))
            .cloned()
            .collect();
        if !missing.is_empty() {
            if self.client.is_none() {
                self.client = Some(local_http::client(30)?);
            }
            // Results carry their input index; response order is not a contract.
            for batch in missing.chunks(2) {
                // Preserve identifiable complete entries; retry only missing ones.
                // A server rejecting arrays can still serve individual prompts.
                match self.forward(batch) {
                    Ok(vectors) => {
                        for (input, vector) in batch.iter().zip(vectors) {
                            if let Some(vector) = vector {
                                self.cache.insert(input.clone(), vector);
                            }
                        }
                    }
                    Err(error) if batch.len() == 1 => return Err(error),
                    Err(_) => {}
                }
                for input in batch {
                    if !self.cache.contains_key(input) {
                        let vector = self
                            .forward(std::slice::from_ref(input))?
                            .remove(0)
                            .ok_or("Vecteur local manquant")?;
                        self.cache.insert(input.clone(), vector);
            }
        }
            }
        }
        let result = inputs
            .iter().map(|s| {
                self.cache
                    .get(s)
                    .cloned()
                    .ok_or_else(|| "Cache vectoriel incomplet".into())
            })
            .collect();
        // Eviction cannot invalidate an earlier entry of the current request.
        if self.cache.len() > 2048 {
            let remove = self.cache.len() - 2048;
            let keys: Vec<_> = self
                .cache
                .keys()
                .filter(|s| !inputs.contains(s))
                .take(remove)
                .cloned()
                .collect();
            for key in keys {
                self.cache.remove(&key);
            }
            if self.cache.len() > 2048 {
                self.cache.clear();
            }
        }
        result
    }
    pub(crate) fn cached_vector(&self, prompt: &str) -> Option<Vec<f32>> {
        self.cache.get(prompt).cloned()
    }
    fn forward(&mut self, inputs: &[String]) -> Result<Vec<Option<Vec<f32>>>> {
        self.embedding_requests += 1;
        local_http::require_alive(self.child.as_mut().ok_or("Moteur arrêté")?)?;
        let value = local_http::json(
            self.client
                .as_ref()
                .ok_or("Client local absent")?
                .post(format!("http://127.0.0.1:{}/v1/embeddings", self.port))
                .bearer_auth(&self.key)
                .json(&serde_json::json!({"input":inputs,"model":MODEL_ID}))
                .send()
                .app()?,
        )?;
        let rows = value["data"]
            .as_array()
            .ok_or("Vecteurs locaux invalides")?;
        let mut parsed = vec![None; inputs.len()];
        let mut indices = std::collections::HashSet::new();
        for row in rows {
            let index = row["index"].as_u64().ok_or("Index vectoriel manquant")? as usize;
            if index >= inputs.len() || !indices.insert(index) {
                return Err("Index vectoriel invalide".into());
            }
            if let Ok(mut vector) = serde_json::from_value::<Vec<f32>>(row["embedding"].clone()) {
                if vector.len() == 768 && normalize(&mut vector).is_ok() {
                    parsed[index] = Some(vector);
                }
            }
        }
        Ok(parsed)
    }
}
fn normalize(vector: &mut [f32]) -> Result<()> {
    let norm = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
        if !norm.is_finite() || norm <= 0. {
            return Err("Le modèle a renvoyé un vecteur vide".into());
        }
    for v in vector {
        *v /= norm;
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    fn mock_engine(
        responses: Vec<(u16, serde_json::Value)>,
    ) -> (Engine, std::thread::JoinHandle<Vec<Vec<String>>>) {
        use std::io::{BufRead, Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = std::thread::spawn(move || {
            let mut requests = vec![];
            for (status, body) in responses {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut reader = std::io::BufReader::new(&mut socket);
                let mut length = 0;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    if let Some(value) = line.to_lowercase().strip_prefix("content-length:") {
                        length = value.trim().parse().unwrap();
                    }
                }
                let mut bytes = vec![0; length];
                reader.read_exact(&mut bytes).unwrap();
                let request: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
                requests.push(serde_json::from_value(request["input"].clone()).unwrap());
                let body = body.to_string();
                write!(socket,"HTTP/1.1 {status} test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            }
            requests
        });
        let mut engine = Engine::default();
        engine
            .child
            .replace(Command::new("/bin/sleep").arg("30").spawn().unwrap());
        engine.port = port;
        (engine, worker)
    }
    fn response(index: usize, axis: usize) -> serde_json::Value {
        let mut vector = vec![0.; 768];
        vector[axis] = 1.;
        serde_json::json!({"data":[{"index":index,"embedding":vector}]})
    }
    #[test]
    fn incomplete_batches_retry_only_missing_inputs_and_reuse_duplicates() {
        let (mut engine, worker) = mock_engine(vec![(200, response(1, 0)), (200, response(0, 1))]);
        let out = engine
            .embed_batch(Path::new("/unused"), &["a".into(), "b".into()])
            .unwrap();
        assert_eq!(out[0][1], 1.);
        assert_eq!(out[1][0], 1.);
        let duplicate = engine
            .embed_batch(Path::new("/unused"), &["a".into(), "a".into(), "b".into()])
            .unwrap();
        assert_eq!(duplicate[0], duplicate[1]);
        assert_eq!(engine.embedding_requests, 2);
        assert_eq!(engine.cache_hits, 3);
        assert_eq!(worker.join().unwrap(), vec![vec!["a", "b"], vec!["a"]]);
    }
    #[test]
    fn rejected_arrays_fall_back_to_single_inputs_and_keep_completed_entries_after_error() {
        let (mut engine, worker) = mock_engine(vec![
            (400, serde_json::json!({"error":"arrays unsupported"})),
            (200, response(0, 1)),
            (500, serde_json::json!({"error":"interrupted"})),
            (200, response(0, 0)),
        ]);
        let inputs = vec!["a".into(), "b".into()];
        assert!(engine.embed_batch(Path::new("/unused"), &inputs).is_err());
        assert!(engine.cached_vector("a").is_some());
        assert!(engine.cached_vector("b").is_none());
        let out = engine.embed_batch(Path::new("/unused"), &inputs).unwrap();
        assert_eq!(out[0][1], 1.);
        assert_eq!(out[1][0], 1.);
        assert_eq!(
            worker.join().unwrap(),
            vec![vec!["a", "b"], vec!["a"], vec!["b"], vec!["b"]]
        );
    }
    #[test]
    fn embeds_a_long_synthetic_french_passage() {
        let resources = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let vector = Engine::default().embed(&resources,&"La mémoire des lieux traverse les siècles. ".repeat(80),false,
            ).unwrap();
        assert_eq!(vector.len(),768);
        assert!((vector.iter().map(|x|x*x).sum::<f32>() - 1.).abs() < 0.001);
    }
    #[test]
    #[ignore = "measures native batch/single equivalence and warm latency"]
    fn native_batch_equivalence() {
        let resources = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let mut engine = Engine::default();
        let start = Instant::now();
        engine.ensure(&resources).unwrap();
        let startup = start.elapsed().as_secs_f64() * 1000.;
        let mut rows = vec![];
        let start = Instant::now();
        engine
            .embed_batch(
                &resources,
                &[encoding::prompt(
                    "Préparation du moteur pour la mesure.",
                    None,
                    false,
                )],
            )
            .unwrap();
        let first_forward_ms = start.elapsed().as_secs_f64() * 1000.;
        for i in 0..20 {
            let inputs = vec![
                encoding::prompt(
                    &format!("Une maison vide près du fleuve. Évaluation {i}."),
                    Some("Scène"),
                    false,
                ),
                encoding::prompt(
                    &format!("Un navire quitte le port à l’aube. Évaluation {i}."),
                    None,
                    true,
                ),
            ];
            let before = engine.embedding_requests;
            let start = Instant::now();
            let batch = engine.embed_batch(&resources, &inputs).unwrap();
            let batch_ms = start.elapsed().as_secs_f64() * 1000.;
            let batch_forwards = engine.embedding_requests - before;
            engine.cache.clear();
            let before = engine.embedding_requests;
            let start = Instant::now();
            let single: Vec<_> = inputs
                .iter()
                .map(|p| {
                    engine
                        .embed_batch(&resources, std::slice::from_ref(p))
                        .unwrap()
                        .remove(0)
                })
                .collect();
            let single_ms = start.elapsed().as_secs_f64() * 1000.;
            let cosines: Vec<_> = batch
                .iter()
                .zip(&single)
                .map(|(a, b)| cosine(a, b))
                .collect();
        assert!(cosines.iter().all(|s| *s >= 0.999));
            let max_difference = batch
                .iter()
                .flatten()
                .zip(single.iter().flatten())
                .map(|(a, b)| (a - b).abs())
                .fold(0f32, f32::max);
            assert!(max_difference <= 0.005);
        assert_eq!(batch_forwards, 1);
            assert_eq!(engine.embedding_requests - before, 2);
            rows.push(serde_json::json!({"batchMs":batch_ms,"singleMs":single_ms,"cosines":cosines,"maxAbsDifference":max_difference,"batchRequests":batch_forwards,"singleRequests":engine.embedding_requests-before}));
        }
        if let Ok(path) = std::env::var("ARIANE_BATCH_REPORT") {
            let p95 = |field: &str| {
                let mut values: Vec<_> = rows.iter().map(|r| r[field].as_f64().unwrap()).collect();
                values.sort_by(f64::total_cmp);
                values[18]
            };
            std::fs::write(path,serde_json::to_vec_pretty(&serde_json::json!({"model":MODEL_ID,"startupMs":startup,"firstForwardMs":first_forward_ms,"batchP95Ms":p95("batchMs"),"singleP95Ms":p95("singleMs"),"latencyBudgetPassed":p95("batchMs")<=p95("singleMs")*1.1,"rows":rows,"tolerance":{"minCosine":0.999,"maxAbsoluteDifference":0.005},"note":"Twenty paired requests after a separate warmup. Counters measure HTTP embedding requests, not internal model forwards. OS file cache is not purged."})).unwrap()).unwrap();
    }
}
}
