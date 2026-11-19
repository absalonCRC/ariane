use super::{handle, AppState, Request};
use crate::error::{AppResult, Result};
use tauri::Manager;
#[tauri::command]
pub async fn dispatch(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: serde_json::Value,
) -> Result<serde_json::Value> {
    crate::ipc::validate(&request)?;
    authorize(window.label(), &request)?;
    let permit = crate::ipc::admit(request["type"].as_str().ok_or("Commande invalide")?).await?;
    let request: Request = serde_json::from_value(request).app()?;
    let label = window.label().to_owned();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let state = app2.state::<AppState>();
        match request {
            Request::AppReady => {
                crate::app_lifecycle::ready(&app2, &label)?;
                Ok(serde_json::json!(true))
            }
            Request::AppFlushed { id, error } => {
                crate::app_lifecycle::acknowledge(&app2, &label, &id, error)
                    .map(serde_json::Value::Bool)
            }
            request => handle(&app2, &state, request),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn authorize(label: &str, request: &serde_json::Value) -> Result<()> {
    if label == "main" {
        return Ok(());
    }
    let kind = request["type"].as_str().unwrap_or_default();
    let allowed = label == "capture"
        && matches!(
            kind,
            "inboxDraft"
                | "inboxSave"
                | "inboxFinish"
                | "appReady"
                | "appFlushed"
                | "captureWindow"
                | "appClose"
                | "quit"
                | "inboxPreferences"
                | "predictionPreferences"
                | "predictWord"
                | "predictionFeedback"
        );
    if !allowed
        || (kind == "appClose"
            && !matches!(request["action"].as_str(), Some("hide-capture" | "quit")))
        || (kind == "inboxPreferences" && !request["value"].is_null())
        || (matches!(kind, "predictionPreferences" | "predictWord" | "predictionFeedback")
            && (!request["projectPath"].is_null() || !request["value"].is_null()))
    {
        return Err("Cette fenêtre ne peut pas modifier le projet ou ses réglages.".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compact_cannot_activate_or_mutate_a_project() {
        for kind in [
            "bootstrap",
            "open",
            "create",
            "save",
            "settings",
            "inboxTransfer",
            "inboxBackup",
            "projectBackup",
            "projectRestoreCopy",
            "installRuntime",
            "resetPrediction",
            "forgetPredictionProject",
            "globalShortcutRecording",
        ] {
            assert!(authorize("capture", &serde_json::json!({"type":kind})).is_err());
        }
        assert!(authorize("capture", &serde_json::json!({"type":"inboxSave"})).is_ok());
        assert!(authorize(
            "capture",
            &serde_json::json!({"type":"inboxPreferences","value":{"volume":1}})
        )
        .is_err());
        assert!(authorize("other", &serde_json::json!({"type":"inboxSave"})).is_err());
    }

    #[test]
    fn compact_only_queries_and_rates_the_common_profile() {
        for kind in ["predictWord", "predictionFeedback", "predictionPreferences"] {
            assert!(authorize("capture", &serde_json::json!({"type":kind})).is_ok());
            assert!(authorize("capture", &serde_json::json!({"type":kind,"projectPath":"/project"})).is_err());
            assert!(authorize("capture", &serde_json::json!({"type":kind,"value":{"enabled":true}})).is_err());
        }
    }
}
