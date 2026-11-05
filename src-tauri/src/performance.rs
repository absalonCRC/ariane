//! Opt-in native test harness. Never compiled into the distributed application.
use crate::{
    api::AppState,
    error::{AppResult, Result},
    model::*,
    project, vaults,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::params;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::Manager;

pub fn isolated_directory() -> std::io::Result<PathBuf> {
    let path = PathBuf::from(std::env::var("ARIANE_PERF_DIR").unwrap_or_default());
    if !path.is_absolute() || !path.join(".ariane-performance").is_file() {
        return Err(std::io::Error::other(
            "Benchmark requires an absolute ARIANE_PERF_DIR with its isolation marker",
        ));
    }
    Ok(path)
}
fn prepare(state: &AppState) -> Result<Value> {
    // Fixtures already contain their source index; periodic rescans would turn
    // a latency measurement into an unrelated full reindex.
    state.paused.store(true, std::sync::atomic::Ordering::Relaxed);
    let memory_test = state.data.join(".memory-benchmark").is_file();
    let speech_test = state.data.join("speech-input.wav").is_file();
    let large = (!memory_test && !speech_test) || state.data.join(".large-manuscript").is_file();
    let scenes = if large { 2000 } else { 6 };
    let sources = if large { 2500 } else { 6 };
    let root = state.data.join("project");
    if root.exists() {
        return Err("Benchmark fixture already exists; use a fresh directory".into());
    }
    project::create(&root, "Mesure native — données synthétiques")?;
    let line = "La mémoire des lieux accompagne une voix dans Toulouse. ".repeat(5) + "\n";
    let text = line.repeat(20);
    let mut c = project::database(&root)?;
    let tx = c.transaction().app()?;
    tx.execute("DELETE FROM sections", []).app()?;
    for i in 0..scenes {
        let text = if memory_test && i < 6 {
            ["Louise Morel, relieuse, s’installa à Arles en 1924. La maison vide garde le souvenir de ceux qui ont vécu entre ses murs.\n",
             "La demeure abandonnée semblait attendre ses habitants.\n",
             "Louise Morel, relieuse, travaillait à Lyon en 1921.\n",
             "Le jardinier prépare le calendrier des semis.\n",
             "La typographie du livre comporte trois familles de caractères.\n",
             "Marie Curie travaille à Paris avec l’Institut Pasteur.\n"][i].to_owned()
        } else {
            text.clone()
        };
        let nodes = if memory_test && i < 6 { 1 } else { 20 };
        let id = format!("scene-{i}");
        let outline = Outline {
            version: 1,
            nodes: (0..nodes)
                .map(|j| OutlineNode { properties: Default::default(), property_conflicts: Default::default(), tag_ids: vec![],
                    id: format!("{i}-{j}"),
                    start: j * line.len(),
                    parent: if j % 5 == 0 {
                        None
                    } else {
                        Some(format!("{i}-{}", j - j % 5))
                    },
                })
                .collect(),
        };
        // Offsets in outlines are UTF-16, while Rust strings use UTF-8.
        let mut outline = outline;
        for (j, n) in outline.nodes.iter_mut().enumerate() {
            n.start = j * line.encode_utf16().count();
        }
        tx.execute("INSERT INTO sections(id,parent,title,kind,position,text,revision,outline,mirror) VALUES(?,NULL,?,'scene',?,?,0,?,?)",
            params![id,format!("Scène {i}"),i,text,serde_json::to_string(&outline).app()?,project::hash(&text)]).app()?;
        fs::write(root.join("manuscrit").join(format!("{id}.md")), &text).app()?;
    }
    tx.execute(
        "UPDATE meta SET value=? WHERE key='settings'",
        [
            json!({"active":"scene-0","continuous":true,"depth":0,"cursor":1,"enrichment":false})
                .to_string(),
        ],
    )
    .app()?;
    tx.commit().app()?;
    let vault = state.data.join("vault");
    fs::create_dir_all(&vault).app()?;
    vaults::connect(&root, &vault)?;
    let vault_id = project::hash(&vault.to_string_lossy());
    let mut idx = vaults::index_db(&state.data.join("sources.sqlite"))?;
    let tx = idx.transaction().app()?;
    for i in 0..sources {
        let title = if i == 0 {
            "Toulouse".to_owned()
        } else {
            format!("Archive {i}")
        };
        let raw = if memory_test && i == 0 {
            "---\ntitle: Archives d’Arles\ntype: Document\n---\nLouise Morel dirigeait un atelier de reliure à Arles en 1924. Un registre conserve les commandes et les adresses des clients.\n".to_owned()
        } else {
            format!("---\ntitle: {title}\ntype: Concept\naliases: [Lieu {i}]\n---\nLa mémoire des lieux dans la ville. [[Toulouse]]\n{}", "Un témoignage ancien. ".repeat(30))
        };
        let rel = format!("note-{i}.md");
        fs::write(vault.join(&rel), &raw).app()?;
        let mut source = vaults::parse::parse(&vault_id, &rel, &raw);
        let digest = project::hash(&format!("{}:{}", raw.len(), project::hash(&raw)));
        source.fingerprint = digest.clone();
        tx.execute(
            "INSERT INTO sources VALUES(?,?,?,?,?)",
            params![
                source.id,
                vault_id,
                rel,
                digest,
                serde_json::to_string(&source).app()?
            ],
        )
        .app()?;
        // Synthetic normalized vectors exercise retrieval/storage; relevance is not evaluated.
        let v: Vec<f32> = (0..768)
            .map(|j| (((i * 17 + j * 13) % 101) as f32 - 50.) / 800.)
            .collect();
        let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        let v: Vec<f32> = v.into_iter().map(|x| x / norm).collect();
        tx.execute("INSERT INTO chunks(source,page,text,vector,model) VALUES(?,NULL,?,?,'embeddinggemma-300M-Q8_0:sentence-tokens-v2')",params![source.id,source.text,crate::vectors::encode(&v)]).app()?;
        tx.execute(
            "INSERT INTO search(text,source,page) VALUES(?,?,NULL)",
            params![source.text, source.id],
        )
        .app()?;
    }
    tx.commit().app()?;
    project::catalog::remember(&state.data,&root,"Mesure native — données synthétiques")?;
    Ok(json!({"path":root,"scenes":scenes,"sources":sources,"memoryTest":memory_test,"speechTest":speech_test,"microphoneProbe":state.data.join(".microphone-probe").is_file(),"entitiesTest":crate::memory_engine::EntityEngine::available(&state.data,&state.resources)}))
}
#[tauri::command]
pub async fn performance(
    app: tauri::AppHandle,
    action: String,
    payload: Option<Value>,
) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        match action.as_str() {
            "prepare" => prepare(&state),
            "speechInput" => {
                let audio = fs::read(state.data.join("speech-input.wav")).app()?;
                if audio.len() > 20 * 1024 * 1024 { return Err("Speech fixture exceeds the audio limit".into()); }
                Ok(json!({"audio":STANDARD.encode(audio)}))
            }
            "memoryState" => Ok(json!({"blocked":state.memory_activity.blocked(),
                "nerPid":state.memory_activity.ner_pid(),"nerPaused":state.memory_activity.ner_blocked(),
                "pid":state.engine.try_lock().ok().and_then(|e|e.pid()).unwrap_or(0)})),
            "resize" => {
                let width = payload
                    .and_then(|p| p.get("width").and_then(Value::as_f64))
                    .ok_or("Missing width")?;
                app.get_webview_window("main")
                    .ok_or("Missing window")?
                    .set_size(tauri::LogicalSize::new(width.clamp(760., 1440.), 1000.))
                    .app()?;
                Ok(json!(true))
            }
            "report" => {
                let report = payload.ok_or("Missing report")?;
                fs::write(
                    state.data.join("report.json"),
                    serde_json::to_vec_pretty(&report).app()?,
                )
                .app()?;
                Ok(json!(true))
            }
            _ => Err("Unknown benchmark action".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
