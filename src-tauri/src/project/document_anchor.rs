use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnchor {
    pub version: u8,
    pub source_id: String,
    pub vault_id: String,
    pub path: String,
    pub fingerprint: String,
    pub page: u32,
    pub rectangles: Vec<[f64; 4]>,
    pub quote: String,
    pub before: String,
    pub after: String,
}
impl DocumentAnchor {
    pub fn verify(&self, root: &Path, index: &Path) -> Result<()> {
        use crate::vaults;
        if self.version != 1
            || self.page == 0
            || self.rectangles.is_empty()
            || self.rectangles.len() > 256
            || self.quote.len() > 40000
            || self.before.len() > 1024
            || self.after.len() > 1024
            || self.rectangles.iter().any(|r| {
                r.iter().any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
                    || r[0] >= r[2]
                    || r[1] >= r[3]
            })
        {
            return Err("Sélection documentaire invalide.".into());
        }
        let vaults = vaults::list(root, index)?;
        let source = vaults::source(index, &self.source_id, &vaults)?;
        if source.vault_id != self.vault_id
            || source.path != self.path
            || source.fingerprint != self.fingerprint
            || !(source.kind == "PDF"
                || (source.kind == "Image" && self.page == 1 && self.quote.is_empty()))
        {
            return Err("Source modifiée. Vérifiez le lien documentaire.".into());
        }
        crate::source_files::verified_file(
            &vaults::file(index, &self.source_id, &vaults)?,
            &self.fingerprint,
        )?;
        Ok(())
    }
}
