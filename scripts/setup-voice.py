#!/usr/bin/env python3
"""Install and verify the pinned voice runtime before activating it."""
from pathlib import Path
import json
import shutil
import sys
from install_runtime import staged_install, install_python, inventory, download_models

ROOT = Path.home() / "Library/Application Support/fr.ariane.writer/voice"
MODELS = {
    "parakeet": {"repository": "animaslabs/parakeet-tdt-0.6b-v3-mlx-4bit", "revision": "65247a0a9e735426eba06056a9535f7e67dcbbb9"},
    "cleanup": {"repository": "spokenly/cleanup-1-gguf", "revision": "79936c95e5c0ea9162ae7a435e64cb3127020e36", "files": ["cleanup-1-q8_0.gguf"]},
}


def main():
    if sys.platform != "darwin":
        raise SystemExit("Le runtime de dictée cible macOS.")
    uv = shutil.which("uv")
    if not uv:
        raise SystemExit("L’installation de la dictée nécessite uv (https://docs.astral.sh/uv/).")
    lock = Path(__file__).with_name("voice-requirements.lock")
    with staged_install(ROOT) as stage:
        python = install_python(stage, uv, lock)
        models = download_models(stage, python, MODELS)
        # Preserve the path used by the native cleanup engine.
        (stage / "models/cleanup/cleanup-1-q8_0.gguf").rename(stage / "models/cleanup-1-q8_0.gguf")
        if not (stage / "models/parakeet/model.safetensors").is_file():
            raise RuntimeError("Poids Parakeet manquants")
        manifest = inventory(stage, python, uv, lock) | {"models": models}
        (stage / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print("Les modèles de dictée vérifiés sont installés localement.")


if __name__ == "__main__":
    main()
