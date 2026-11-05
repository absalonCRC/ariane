use serde::{Deserialize, Serialize};
pub fn default_included() -> bool { true }
pub fn manuscript_role() -> String { "manuscript".into() }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tag_ids: Vec<String>,
    pub id: String,
    pub parent: Option<String>,
    pub title: String,
    pub kind: String,
    pub position: i64,
    pub text: String,
    #[serde(default)]
    pub outline: Option<Outline>,
    pub revision: i64,
    pub synopsis: String,
    pub status: String,
    pub goal: i64,
    #[serde(default = "manuscript_role")]
    pub role: String,
    #[serde(default)]
    pub trashed: bool,
    #[serde(default = "default_included")]
    pub included: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    #[serde(default)]
    pub smart_tags: Vec<SmartTag>,
    pub path: String,
    pub name: String,
    pub sections: Vec<Section>,
    pub settings: serde_json::Value,
    pub recovered: bool,
    #[serde(default)]
    pub trash: Vec<Section>,
    #[serde(default)]
    pub can_undo_structure: bool,
    #[serde(default)]
    pub conflicts: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPatch {
    pub id: String,
    pub revision: i64,
    pub text: String,
    #[serde(default)]
    pub outline: Option<Outline>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outline {
    pub version: i64,
    pub nodes: Vec<OutlineNode>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineNode {
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub properties: std::collections::BTreeMap<String, serde_json::Value>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub property_conflicts: std::collections::BTreeMap<String, Vec<serde_json::Value>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tag_ids: Vec<String>,
    pub id: String,
    pub parent: Option<String>,
    pub start: usize,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartTag {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub properties: Vec<TagProperty>,
    pub id: String,
    pub name: String,
    pub color: String,
    pub category: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagProperty {
    pub id: String,
    pub name: String,
    pub r#type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inherit: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
    pub id: String,
    pub path: String,
    pub name: String,
    pub scope: Vec<String>,
    pub count: i64,
    pub available: bool,
    #[serde(default)]
    pub owned: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    #[serde(default)]
    pub fingerprint: String,
    pub id: String,
    pub vault_id: String,
    pub path: String,
    pub title: String,
    pub kind: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub fields: serde_json::Value,
    pub text: String,
    pub page: Option<i64>,
    pub matched: Option<String>,
    pub score: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enrichment: Option<crate::enrichment::Enrichment>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    pub name: String,
    pub created: String,
    pub scope: Option<String>,
    pub sections: Vec<Section>,
    #[serde(default)]
    pub automatic: bool,
    #[serde(default)]
    pub branch_id: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub merge_parent_id: Option<String>,
}
