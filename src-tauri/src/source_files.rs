//! Opaque, revocable file handles. No path is accepted by the WebView protocol.
use crate::{
    api::AppState,
    error::{AppResult, Result},
    vaults,
};
use std::{
    collections::VecDeque,
    fs::{File, OpenOptions},
    os::unix::fs::{FileExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::http::{Request, Response};
struct Grant {
    token: String,
    root: PathBuf,
    id: String,
    path: PathBuf,
    file: Arc<File>,
    mime: &'static str,
    created: Instant,
}
#[derive(Default)]
pub struct Files(Mutex<VecDeque<Grant>>);
impl Files {
    pub fn grant(&self, state: &AppState, root: &Path, id: &str) -> Result<serde_json::Value> {
        let index = state.data.join("sources.sqlite");
        let path = vaults::file(&index, id, &vaults::list(root, &index)?)?;
        let mime = match path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "pdf" => "application/pdf",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            _ => return Err("Format non affichable".into()),
        };
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(&path)
            .app()?;
        if !file.metadata().app()?.is_file() || file.metadata().app()?.len() > 100_000_000 {
            return Err("Fichier invalide ou trop volumineux".into());
        }
        let token = uuid::Uuid::new_v4().to_string();
        let mut files = self.0.lock().map_err(|e| e.to_string())?;
        while files.len() >= 16 {
            files.pop_front();
        }
        files.push_back(Grant {
            token: token.clone(),
            root: root.into(),
            id: id.into(),
            path,
            file: Arc::new(file),
            mime,
            created: Instant::now(),
        });
        Ok(serde_json::json!({"url":format!("source-file://localhost/{token}"),"mime":mime}))
    }
    fn read(&self, state: &AppState, request: Request<Vec<u8>>) -> Result<Response<Vec<u8>>> {
        if !["GET", "HEAD"].contains(&request.method().as_str()) {
            return Err("Méthode refusée".into());
        }
        let token = request.uri().path().trim_start_matches('/');
        let root = state
            .current
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("Projet fermé")?;
        let (id, path, file, mime) = {
            let files = self.0.lock().map_err(|e| e.to_string())?;
            let grant = files
                .iter()
                .find(|g| {
                    g.token == token
                        && g.root == root
                        && g.created.elapsed() < Duration::from_secs(3600)
                })
                .ok_or("Accès expiré")?;
            (
                grant.id.clone(),
                grant.path.clone(),
                grant.file.clone(),
                grant.mime,
            )
        };
        let index = state.data.join("sources.sqlite");
        if vaults::file(&index, &id, &vaults::list(&root, &index)?)? != path {
            return Err("Source déplacée".into());
        }
        let len = file.metadata().app()?.len();
        if len > 100_000_000 {
            return Err("Fichier trop volumineux".into());
        }
        let requested = request
            .headers()
            .get("range")
            .map(|v| v.to_str().map_err(|e| e.to_string()))
            .transpose()?;
        let Some((start, end)) = byte_range(requested, len) else {
            return Response::builder()
                .status(416)
                .header("Content-Range", format!("bytes */{len}"))
                .body(vec![])
                .app();
        };
        let count = if len == 0 { 0 } else { end - start + 1 };
        let mut response = Response::builder()
            .status(if requested.is_some() { 206 } else { 200 })
            .header("Content-Type", mime)
            .header("Content-Length", count.to_string())
            .header("Accept-Ranges", "bytes")
            .header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", "default-src 'none'; sandbox");
        if requested.is_some() {
            response = response.header("Content-Range", format!("bytes {start}-{end}/{len}"));
        }
        let mut body = vec![];
        if request.method() == "GET" {
            body.resize(count as usize, 0);
            file.read_exact_at(&mut body, start).app()?;
        }
        response.body(body).app()
    }
    pub fn respond(&self, state: &AppState, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
        self.read(state, request).unwrap_or_else(|_| {
            Response::builder()
                .status(403)
                .header("Cache-Control", "no-store")
                .body(vec![])
                .unwrap()
        })
    }
}
fn byte_range(header: Option<&str>, len: u64) -> Option<(u64, u64)> {
    let Some(header) = header else {
        return Some((0, len.saturating_sub(1)));
    };
    if len == 0 {
        return None;
    }
    let (from, to) = header.strip_prefix("bytes=")?.split_once('-')?;
    if to.contains(',') {
        return None;
    }
    let (start, end) = if from.is_empty() {
        let size = to.parse::<u64>().ok()?;
        if size == 0 {
            return None;
        }
        (len.saturating_sub(size), len - 1)
    } else {
        let start = from.parse::<u64>().ok()?;
        (
            start,
            if to.is_empty() {
                len - 1
            } else {
                to.parse::<u64>().ok()?.min(len - 1)
            },
        )
    };
    (start < len && start <= end)
        .then_some((start, end.min(start.saturating_add(8 * 1024 * 1024 - 1))))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tokens_are_scoped_to_the_active_project_and_current_vault_scope() {
        let temp=tempfile::tempdir().unwrap();let root=temp.path().join("project");crate::project::create(&root,"A").unwrap();
        let vault=temp.path().join("vault");std::fs::create_dir(&vault).unwrap();std::fs::write(vault.join("picture.png"),b"0123456789").unwrap();
        vaults::connect(&root,&vault).unwrap();let index=temp.path().join("sources.sqlite");
        let id=vaults::list(&root,&index).unwrap()[0].id.clone();let mut source=vaults::parse::parse(&id,"picture.png","");source.kind="Image".into();
        vaults::index_db(&index).unwrap().execute("INSERT INTO sources VALUES(?,?,?,?,?)",rusqlite::params![source.id,id,source.path,"hash",serde_json::to_string(&source).unwrap()]).unwrap();
        let state=AppState {data:temp.path().to_owned(),resources:temp.path().to_owned(),current:Mutex::new(Some(root.clone())),source_files:Default::default(),grants:Default::default(),project_guard:Default::default(),engine:Default::default(),revision:Default::default(),voice:Default::default(),enriching:Default::default(),memory_activity:Default::default(),memory_job:Default::default(),entity_engine:Default::default(),indexing:false.into(),cancel:false.into(),paused:false.into(),export_cancel:false.into(),exporting:false.into(),exit_approved:false.into()};
        let grant=state.source_files.grant(&state,&root,&source.id).unwrap();let url=grant["url"].as_str().unwrap();
        let request=||Request::builder().uri(url).header("range","bytes=1-3").body(vec![]).unwrap();
        let response=state.source_files.respond(&state,request());assert_eq!(response.status(),206);assert_eq!(response.body(),b"123");
        vaults::set_scope(&root,&id,vec!["private".into()]).unwrap();assert_eq!(state.source_files.respond(&state,request()).status(),403);
        vaults::set_scope(&root,&id,vec![]).unwrap();*state.current.lock().unwrap()=None;assert_eq!(state.source_files.respond(&state,request()).status(),403);
    }
    #[test]
    fn range_validation_and_bounded_reads() {
        assert_eq!(byte_range(Some("bytes=-4"), 10), Some((6, 9)));
        assert_eq!(byte_range(Some("bytes=1-3"), 10), Some((1, 3)));
        assert!(byte_range(Some("bytes=10-"), 10).is_none());
        assert!(byte_range(Some("bytes=0-1,4-5"), 10).is_none());
        assert_eq!(
            byte_range(Some("bytes=0-"), 80_000_000),
            Some((0, 8 * 1024 * 1024 - 1))
        );
    }
}
