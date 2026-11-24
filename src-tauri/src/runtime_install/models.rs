//! User-selected weights live in Application Support. Only verified files are published.
use super::{Installer, Module};
use crate::error::{AppResult, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

const READING: &str = include_str!("../../../scripts/reading/assets.json");

#[derive(Deserialize)]
struct Asset {
    url: String,
    sha256: String,
    bytes: u64,
}

pub(crate) fn cleanup(data: &Path) -> PathBuf {
    installed_path(
        data,
        "voice/models/cleanup-1-q8_0.gguf",
        "cleanup-1-q8_0.gguf",
    )
}

pub(crate) fn salamandra(data: &Path) -> PathBuf {
    installed_path(data, "revision/salamandra-q8.gguf", "salamandra-q8.gguf")
}

fn installed_path(data: &Path, legacy: &str, filename: &str) -> PathBuf {
    let legacy = data.join(legacy);
    if legacy.is_file() {
        legacy
    } else {
        data.join("models").join(filename)
    }
}

pub(crate) fn reading_dir(data: &Path, lang: &str) -> PathBuf {
    data.join(format!("reading-{lang}"))
}

pub(crate) fn aligner_weights(data: &Path) -> PathBuf {
    data.join("models/whisper-tiny-q5_1.bin")
}

pub(crate) fn reading_ready(data: &Path, lang: &str) -> bool {
    let dir = reading_dir(data, lang);
    aligner_weights(data).is_file()
        && [
            "model.safetensors",
            "voice.safetensors",
            "tokenizer.json",
            "config.yaml",
        ]
        .iter()
        .all(|file| dir.join(file).is_file())
}

impl Installer {
    pub(super) fn install_weights(&self, data: &Path, module: Module) -> Result<()> {
        let models = data.join("models");
        fs::create_dir_all(&models).app()?;
        let staged = tempfile::tempdir_in(&models).app()?;
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(3600))
            .build()
            .app()?;
        self.phase(module, "download")?;
        if let Some((lang, config)) = module.reading() {
            let assets: HashMap<String, Asset> = serde_json::from_str(READING).app()?;
            let dir = staged.path().join("voice");
            fs::create_dir(&dir).app()?;
            for file in ["model.safetensors", "tokenizer.json", "voice.safetensors"] {
                self.fetch(&client, &assets[&format!("{lang}/{file}")], &dir.join(file))?;
            }
            fs::write(dir.join("config.yaml"), config).app()?;
            let shared = aligner_weights(data);
            let download_shared = !shared.is_file();
            let temporary = staged.path().join("align.bin");
            if download_shared {
                self.fetch(&client, &assets["align.bin"], &temporary)?;
            }
            self.phase(module, "verify")?;
            let _publishing = self.progress.lock().app()?;
            self.check()?;
            if download_shared {
                fs::rename(temporary, shared).app()?;
            }
            return super::publish(&dir, data, module);
        }
        let (target, asset) = match module {
            Module::Semantic => return Err("Le modèle inclus dans ariane est manquant.".into()),
            Module::Cleanup | Module::Salamandra => {
                let assets: HashMap<String, Asset> =
                    serde_json::from_str(include_str!("../../../scripts/optional-models.json"))
                        .app()?;
                let target = if module == Module::Cleanup {
                    cleanup(data)
                } else {
                    salamandra(data)
                };
                let asset = assets
                    .into_iter()
                    .find(|(name, _)| name == module.name())
                    .ok_or("Modèle inconnu.")?
                    .1;
                (target, asset)
            }
            _ => return Err("Modèle inconnu.".into()),
        };
        let file = staged.path().join("download");
        self.fetch(&client, &asset, &file)?;
        self.phase(module, "verify")?;
        let _publishing = self.progress.lock().app()?;
        self.check()?;
        fs::rename(file, target).app()
    }

    fn fetch(&self, client: &Client, asset: &Asset, dest: &Path) -> Result<()> {
        self.check()?;
        let mut stream = client
            .get(&asset.url)
            .send()
            .app()?
            .error_for_status()
            .app()?;
        self.copy_verified(&mut stream, asset, dest)
    }

    fn copy_verified(&self, stream: &mut impl Read, asset: &Asset, dest: &Path) -> Result<()> {
        let mut file = fs::File::create_new(dest).app()?;
        let mut digest = Sha256::new();
        let mut bytes = 0;
        let mut buf = [0; 65536];
        loop {
            self.check()?;
            let n = stream.read(&mut buf).app()?;
            if n == 0 {
                break;
            }
            bytes += n as u64;
            if bytes > asset.bytes {
                return Err("Téléchargement trop volumineux.".into());
            }
            file.write_all(&buf[..n]).app()?;
            digest.update(&buf[..n]);
        }
        if bytes != asset.bytes || format!("{:x}", digest.finalize()) != asset.sha256 {
            return Err("Le modèle téléchargé ne correspond pas à son empreinte.".into());
        }
        file.sync_all().app()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_the_size_and_digest_before_activation() {
        let stage = tempfile::tempdir().unwrap();
        let installer = Installer::default();
        let asset = Asset {
            url: String::new(),
            sha256: format!("{:x}", Sha256::digest(b"abc")),
            bytes: 3,
        };
        for (name, mut content) in [
            ("short", b"ab".as_slice()),
            ("long", b"abcd".as_slice()),
            ("corrupt", b"abd".as_slice()),
        ] {
            assert!(installer
                .copy_verified(&mut content, &asset, &stage.path().join(name))
                .is_err());
        }
        let path = stage.path().join("complete");
        installer
            .copy_verified(&mut b"abc".as_slice(), &asset, &path)
            .unwrap();
        assert_eq!(fs::read(path).unwrap(), b"abc");
    }

    #[test]
    fn recognises_independent_modules_and_previously_installed_weights() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path();
        let installer = Installer::default();
        assert!(installer.status(data, data).unwrap().installed.is_empty());
        assert_eq!(fs::read_dir(data).unwrap().count(), 0);
        let lang = reading_dir(data, "es");
        fs::create_dir(&lang).unwrap();
        for file in [
            "model.safetensors",
            "voice.safetensors",
            "config.yaml",
            "tokenizer.json",
        ] {
            fs::write(lang.join(file), "fixture").unwrap();
        }
        assert!(!reading_ready(data, "es"));
        fs::create_dir(data.join("models")).unwrap();
        fs::write(aligner_weights(data), "fixture").unwrap();
        for path in [
            "voice/models/cleanup-1-q8_0.gguf",
            "revision/salamandra-q8.gguf",
        ] {
            let file = data.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, "previous").unwrap();
        }
        let expected = [Module::ReadingEs, Module::Cleanup, Module::Salamandra];
        assert_eq!(installer.status(data, data).unwrap().installed, expected);
        for module in expected {
            installer.install(data, data, module).unwrap();
        }
        assert_eq!(fs::read_to_string(cleanup(data)).unwrap(), "previous");
        assert_eq!(fs::read_to_string(salamandra(data)).unwrap(), "previous");
        // Earlier manual installations can be usable without installer receipts.
        for path in [
            "voice/runtime/bin/python",
            "voice/models/parakeet/model.safetensors",
            "voice/transcribe.py",
            "revision/java/Contents/Home/bin/java",
            "revision/languagetool/languagetool-server.jar",
        ] {
            let file = data.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, "previous").unwrap();
        }
        for module in [Module::Voice, Module::Revision] {
            assert!(module.ready(data, data));
            installer.install(data, data, module).unwrap();
        }
        assert!(!data.join("runtime-install").exists());
    }
}
