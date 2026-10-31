use crate::error::{AppResult, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct RevisionEngine {
    language: Option<Server>,
    model: Option<Server>,
    last_used: Option<Instant>,
}
struct Server {
    child: Child,
    port: u16,
    key: Option<String>,
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    issues: Vec<Issue>,
    model: Option<String>,
    language_error: Option<String>,
    model_error: Option<String>,
}
#[derive(Serialize)]
pub struct Issue {
    offset: usize,
    length: usize,
    message: String,
    replacements: Vec<String>,
}
fn client(seconds: u64) -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(seconds))
        .build()
        .app()
}
fn port() -> Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").app()?;
    Ok(listener.local_addr().app()?.port())
}
fn ready(mut server: Server, health: &str) -> Result<Server> {
    let client = client(1)?;
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(60) {
        if server.child.try_wait().app()?.is_some() {
            return Err("Le moteur de révision s’est arrêté au démarrage.".into());
        }
        let mut req = client.get(format!("http://127.0.0.1:{}{health}", server.port));
        if let Some(key) = &server.key {
            req = req.bearer_auth(key);
        }
        if req.send().is_ok_and(|r| r.status().is_success()) {
            return Ok(server);
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Err("Le moteur de révision n’a pas démarré dans le délai prévu.".into())
}
fn alive(server: &mut Option<Server>) -> bool {
    server
        .as_mut()
        .is_some_and(|s| matches!(s.child.try_wait(), Ok(None)))
}
impl RevisionEngine {
    pub fn shutdown(&mut self) {
        self.language = None;
        self.model = None;
        self.last_used = None;
    }
    pub fn shutdown_if_idle(&mut self) {
        if self
            .last_used
            .is_some_and(|time| time.elapsed() >= Duration::from_secs(120))
        {
            self.shutdown();
        }
    }
    fn language(&mut self, root: &Path) -> Result<&Server> {
        if !alive(&mut self.language) {
            self.language = None;
            let port = port()?;
            let java = root.join("java/Contents/Home/bin/java");
            let folder = root.join("languagetool");
            if !java.is_file() || !folder.join("languagetool-server.jar").is_file() {
                return Err("LanguageTool local n’est pas installé.".into());
            }
            let child = Command::new(java)
                .current_dir(&folder)
                .args([
                    "-Xmx512m",
                    "-cp",
                    "languagetool-server.jar",
                    "org.languagetool.server.HTTPServer",
                    "--port",
                    &port.to_string(),
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .app()?;
            self.language = Some(ready(
                Server {
                    child,
                    port,
                    key: None,
                },
                "/v2/languages",
            )?);
        }
        self.language
            .as_ref()
            .ok_or_else(|| "LanguageTool indisponible.".into())
    }
    fn model(&mut self, root: &Path, resources: &Path) -> Result<&Server> {
        if !alive(&mut self.model) {
            self.model = None;
            let model = root.join("salamandra-q8.gguf");
            let bin = resources.join("engine/llama-server");
            if !model.is_file() || !bin.is_file() {
                return Err("Le modèle de révision local n’est pas installé.".into());
            }
            let port = port()?;
            let key = uuid::Uuid::new_v4().to_string();
            let child = Command::new(bin)
                .arg("-m")
                .arg(model)
                .args([
                    "--api-key",
                    &key,
                    "--host",
                    "127.0.0.1",
                    "--port",
                    &port.to_string(),
                    "-c",
                    "2048",
                    "-np",
                    "1",
                    "-ngl",
                    "99",
                    "--jinja",
                ])
                .env("DYLD_LIBRARY_PATH", resources.join("engine"))
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .app()?;
            self.model = Some(ready(
                Server {
                    child,
                    port,
                    key: Some(key),
                },
                "/health",
            )?);
        }
        self.model
            .as_ref()
            .ok_or_else(|| "Modèle local indisponible.".into())
    }
    pub fn check(
        &mut self,
        data: &Path,
        resources: &Path,
        text: &str,
        language: &str,
    ) -> Result<Response> {
        let (name, lt_language) = match language {
            "fr" => ("French", "fr"),
            "en" => ("English", "en-US"),
            "es" => ("Spanish", "es"),
            "de" => ("German", "de-DE"),
            "it" => ("Italian", "it"),
            _ => return Err("Langue de révision non prise en charge.".into()),
        };
        if text.trim().is_empty() || text.chars().count() > 800 {
            return Err("Sélectionnez un passage de 800 caractères maximum.".into());
        }
        let root = data.join("revision");
        let language_result = self.language(&root).and_then(|s| {
            let v: Value = client(40)?
                .post(format!("http://127.0.0.1:{}/v2/check", s.port))
                .form(&[("language", lt_language), ("text", text)])
                .send()
                .app()?
                .error_for_status()
                .app()?
                .json()
                .app()?;
            parse_issues(&v)
        });
        let model_result = self.model(&root, resources).and_then(|s| {
            let prompt = format!("Please fix any mistakes in the following {name} sentence or keep it unedited if it's correct.\nSentence: {text}\nCorrected:");
            let v: Value = client(90)?.post(format!("http://127.0.0.1:{}/v1/chat/completions", s.port))
                .bearer_auth(s.key.as_deref().unwrap_or_default())
                .json(&json!({"model":"salamandra","messages":[{"role":"user","content":prompt}],"temperature":0,"max_tokens":512}))
                .send().app()?.error_for_status().app()?.json().app()?;
            parse_model(&v)
        });
        let (issues, language_error) = match language_result {
            Ok(v) => (v, None),
            Err(e) => (vec![], Some(e)),
        };
        let (model, model_error) = match model_result {
            Ok(v) => (Some(v), None),
            Err(e) => (None, Some(e)),
        };
        self.last_used = Some(Instant::now());
        Ok(Response {
            issues,
            model,
            language_error,
            model_error,
        })
    }
}
fn parse_issues(value: &Value) -> Result<Vec<Issue>> {
    let matches = value["matches"]
        .as_array()
        .ok_or("Réponse LanguageTool invalide.")?;
    Ok(matches
        .iter()
        .filter_map(|item| {
            Some(Issue {
                offset: item["offset"].as_u64()? as usize,
                length: item["length"].as_u64()? as usize,
                message: item["message"].as_str()?.to_owned(),
                replacements: item["replacements"]
                    .as_array()?
                    .iter()
                    .filter_map(|x| x["value"].as_str().map(str::to_owned))
                    .take(3)
                    .collect(),
            })
        })
        .take(40)
        .collect())
}
fn parse_model(value: &Value) -> Result<String> {
    let choice = &value["choices"][0];
    if choice["finish_reason"].as_str() != Some("stop") {
        return Err("La suggestion du modèle est incomplète.".into());
    }
    let text = choice["message"]["content"]
        .as_str()
        .ok_or("Réponse du modèle invalide.")?;
    if text.trim().is_empty() || text.len() > 10_000 {
        return Err("Réponse du modèle invalide.".into());
    }
    Ok(text.to_owned())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ignores_incomplete_model_output() {
        assert!(parse_model(
            &json!({"choices":[{"finish_reason":"length","message":{"content":"partial"}}]})
        )
        .is_err());
        assert_eq!(
            parse_model(
                &json!({"choices":[{"finish_reason":"stop","message":{"content":"Bonjour"}}]})
            )
            .unwrap(),
            "Bonjour"
        );
    }
    #[test]
    fn extracts_languagetool_suggestions_with_offsets() {
        let issues = parse_issues(&json!({"matches":[{"offset":3,"length":4,"message":"Accord","replacements":[{"value":"jouent"}]}]})).unwrap();
        assert_eq!(
            (
                issues[0].offset,
                issues[0].length,
                issues[0].replacements[0].as_str()
            ),
            (3, 4, "jouent")
        );
    }
    #[test]
    #[ignore = "requires the installed local revision engines"]
    fn installed_engines_check_french_offline() {
        let data = std::path::PathBuf::from(std::env::var("ARIANE_REVISION_TEST_DATA").unwrap());
        let resources = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let mut engine = RevisionEngine::default();
        let response = engine
            .check(&data, &resources, "Les enfant joue dans le jardin.", "fr")
            .unwrap();
        assert!(
            response.language_error.is_none(),
            "{:?}",
            response.language_error
        );
        assert!(response.model_error.is_none(), "{:?}", response.model_error);
        assert!(!response.issues.is_empty());
        assert_eq!(
            response.model.as_deref(),
            Some("Les enfants jouent dans le jardin.")
        );
        let english = engine
            .check(&data, &resources, "She go to school every day.", "en")
            .unwrap();
        assert!(
            english.language_error.is_none(),
            "{:?}",
            english.language_error
        );
        assert!(!english.issues.is_empty());
        engine.shutdown();
    }
}
