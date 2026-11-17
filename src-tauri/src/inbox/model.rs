use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct Selection {
    pub anchor: usize,
    pub head: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    pub operation_id: String,
    pub project_path: String,
    pub project_id: String,
    pub branch_id: String,
    pub section_id: String,
    pub title: String,
    pub fingerprint: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capture {
    pub id: String,
    pub revision: i64,
    pub text: String,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
    pub selection: Selection,
    pub destination: Option<Destination>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_destination: Option<Destination>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mirror_pending: Option<bool>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub shortcut: Option<String>,
    pub volume: f64,
    pub sound: bool,
    pub typewriter: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            shortcut: Some("Mod+Shift+Space".into()),
            volume: 1.,
            sound: false,
            typewriter: true,
        }
    }
}
#[derive(Deserialize, Serialize)]
pub struct Page {
    pub items: Vec<Capture>,
    pub more: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub operation_id: String,
    pub capture_id: String,
    pub capture_revision: i64,
    pub project_path: String,
    pub project_id: String,
    pub branch_id: String,
    pub title: String,
}
