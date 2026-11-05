use crate::{history, model::*, project};
use serde::Deserialize;
fn all_revision_stages() -> String {
    "all".into()
}
#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Request {
    Bootstrap,
    NoteActivity {
        project_path: String,
        before: Option<i64>,
    },
    RecordNoteActivity {
        project_path: String,
        value: project::activity::EventInput,
    },
    AppLanguage {
        value: String,
    },
    Annotations {
        project_path: String,
    },
    AddAnnotation {
        project_path: String,
        section: String,
        revision: i64,
        from: usize,
        to: usize,
        note: String,
    },
    UpdateAnnotation {
        project_path: String,
        id: String,
        revision: i64,
        note: String,
        done: bool,
    },
    ImportPreview {
        source: String,
    },
    ImportIntoProject {
        source: String,
        project_path: String,
    },
    ManuscriptOperation {
        project_path: String,
        operation: project::manuscript::Operation,
    },
    Projects,
    ProjectCatalog {
        path: String,
        pinned: bool,
        archived: bool,
    },
    LibraryOperation {
        operation: project::library::Operation,
    },
    BrowseSources {
        query: String,
        vault: Option<String>,
        kind: Option<String>,
        folder: Option<String>,
        offset: usize,
    },
    Create {
        path: String,
        name: String,
        vault_path: Option<String>,
        initial_title: Option<String>,
    },
    Open {
        path: String,
    },
    Save {
        patches: Vec<TextPatch>,
    },
    Add {
        parent: Option<String>,
        title: String,
        kind: String,
        role: Option<String>,
    },
    Update {
        section: Section,
    },
    Reorder {
        ids: Vec<String>,
        id: String,
        parent: Option<String>,
    },
    Settings {
        value: serde_json::Value,
    },
    ResolveExternal {
        id: String,
        keep_local: bool,
        pending: Option<String>,
    },
    Vaults,
    ConnectVault {
        path: String,
    },
    CreateOwnedVault,
    NoteSuggestions {
        project_path: String,
        query: String,
    },
    ClassifyCreatedNote {
        project_path: String,
        id: String,
        #[serde(default)]
        context: String,
    },
    NoteReferences {
        project_path: String,
        ids: Vec<String>,
    },
    CreateQuickNote {
        project_path: String,
        name: String,
        #[serde(default)]
        context: String,
    },
    CreateVaultEntity {
        kind: String,
        name: String,
        description: String,
    },
    VaultScope {
        id: String,
        scope: Vec<String>,
    },
    RemoveVault {
        id: String,
    },
    Index,
    Scan,
    CancelIndex,
    Suggest {
        text: String,
        depth: u8,
        allow_end: bool,
        anchor: Option<String>,
    },
    Search {
        query: String,
    },
    Source {
        id: String,
    },
    SourceFile {
        id: String,
    },
    Versions {
        #[serde(default)]
        offset: usize,
    },
    Version {
        id: String,
    },
    Capture {
        name: String,
        scope: Option<String>,
    },
    AutomaticVersion {
        project_path: String,
        scope: String,
    },
    HistoryState {
        project_path: String,
    },
    CreateBranch {
        project_path: String,
        name: String,
        from_version: Option<String>,
    },
    SwitchBranch {
        project_path: String,
        id: String,
    },
    PromoteVersion {
        project_path: String,
        id: String,
        name: String,
    },
    MergePreview {
        project_path: String,
        source: String,
    },
    MergeBranch {
        project_path: String,
        source: String,
        token: String,
        resolutions: Vec<history::MergeResolution>,
    },
    Restore {
        id: String,
    },
    Export {
        path: String,
        format: String,
        scope: Option<String>,
    },
    Cite {
        id: String,
        payload: serde_json::Value,
    },
    Enrich {
        project_path: String,
    },
    IgnoreEnrichment {
        project_path: String,
        source: String,
        evidence: Option<String>,
    },
    MemoryActivity {
        active: bool,
    },
    MemoryStatus,
    MemoryQueue {
        project_path: String,
        section: String,
        node: Option<String>,
        revision: i64,
        depth: u8,
        #[serde(default)]
        semantic: bool,
    },
    MemoryEntities {
        project_path: String,
        section: String,
        node: Option<String>,
        revision: i64,
    },
    MemoryContext {
        project_path: String,
        section: String,
        node: Option<String>,
        depth: u8,
    },
    InlineEntities {
        project_path: String,
        section: String,
        revision: i64,
        #[serde(default)]
        auto_create: bool,
    },
    ResolveDetectedEntity {
        project_path: String,
        section: String,
        revision: i64,
        from: usize,
        to: usize,
        source: String,
    },
    UpdateSourceAliases {
        project_path: String,
        source: String,
        fingerprint: String,
        aliases: Vec<String>,
    },
    CreateDetectedEntity {
        project_path: String,
        section: String,
        revision: i64,
        from: usize,
        to: usize,
        kind: String,
    },
    MemoryEntity {
        project_path: String,
        id: String,
    },
    MemoryList {
        project_path: String,
    },
    MemoryDismiss {
        project_path: String,
        id: String,
        hash: String,
    },
    MemorySession {
        project_path: String,
        value: Option<serde_json::Value>,
    },
    MemorySource {
        id: String,
        fingerprint: Option<String>,
    },
    EngineStatus,
    VoiceStatus,
    VoicePermission,
    VoicePrepare,
    RevisionStatus,
    RevisionCheck {
        text: String,
        language: String,
        #[serde(default = "all_revision_stages")]
        stage: String,
        #[serde(default)]
        before: String,
        #[serde(default)]
        after: String,
    },
    VoiceTranscribe {
        audio: String,
        language: String,
        #[serde(default)]
        live: bool,
        #[serde(default)]
        before: String,
        #[serde(default)]
        after: String,
        #[serde(default)]
        project_path: Option<String>,
    },
    Quit,
    CancelExport,
    MarginPins {
        project_path: String,
        section: String,
    },
    PinSource {
        project_path: String,
        section: String,
        id: String,
    },
    UnpinSource {
        project_path: String,
        section: String,
        id: String,
    },
    Associate {
        section: String,
        id: String,
        payload: serde_json::Value,
    },
    Links {
        section: String,
    },
}

#[cfg(test)]
mod tests {
    use super::Request;

    #[test]
    fn frontend_save_fixture_preserves_revisions_and_utf16_offsets() {
        let request: Request =
            serde_json::from_str(include_str!("../../../tests/fixtures/ipc-save.json")).unwrap();
        let Request::Save { patches } = request else {
            panic!("Expected save");
        };
        assert_eq!(patches.len(), 1);
        assert_eq!(patches[0].revision, 7);
        assert_eq!(patches[0].text, "Été 🌿\nDeuxième ligne");
        let outline = patches[0].outline.as_ref().unwrap();
        assert_eq!(outline.nodes[1].start, "Été 🌿\n".encode_utf16().count());
        assert_eq!(outline.nodes[1].parent, None);
    }
}
