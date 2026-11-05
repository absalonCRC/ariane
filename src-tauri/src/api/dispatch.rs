use super::{handle, AppState, Request};
use crate::error::{AppResult, Result};
use tauri::Manager;
#[tauri::command]
pub async fn dispatch(
    app: tauri::AppHandle,
    request: serde_json::Value,
) -> Result<serde_json::Value> {
    crate::ipc::validate(&request)?;
    let permit = crate::ipc::admit(request["type"].as_str().ok_or("Commande invalide")?).await?;
    let request: Request = serde_json::from_value(request).app()?;
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let state = app2.state::<AppState>();
        handle(&app2, &state, request)
    })
    .await
    .map_err(|e| e.to_string())?
}
