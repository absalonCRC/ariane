#!/usr/bin/env python3
"""Install pinned, offline memory models into Ariane's application support folder."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from install_runtime import staged_install, install_python, inventory, download_models


ROOT = Path.home() / "Library/Application Support/fr.ariane.writer/memory"
MODELS = {
    "gliner": {
        "repository": "fastino/gliner2-multi-v1",
        "revision": "ce747d79a8e362d3dee0b0b26d1201f7f1a8615a",
        "license": "apache-2.0",
        "files": ["config.json", "encoder_config/config.json", "model.safetensors", "added_tokens.json", "special_tokens_map.json", "spm.model", "tokenizer.json", "tokenizer_config.json"],
    },
}


def main() -> None:
    if sys.platform != "darwin":
        raise SystemExit("Le runtime mémoire cible macOS.")
    uv = shutil.which("uv")
    if not uv:
        raise SystemExit("uv est requis pour installer le runtime mémoire.")
    lock = Path(__file__).with_name("memory-requirements.lock")
    with staged_install(ROOT) as stage:
        python = install_python(stage, uv, lock)
        models = download_models(stage, python, MODELS)
        manifest = inventory(stage, python, uv, lock) | {"models": models}
        # The worker consumes the existing schema-1 model manifest fields too.
        for name, entry in manifest["models"].items():
            entry["license"] = MODELS[name]["license"]
            for filename, value in entry["files"].items():
                with (stage / "models" / name / filename).open("rb") as source:
                    value["sha256"] = hashlib.file_digest(source, "sha256").hexdigest()
        (stage / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        worker = Path(__file__).resolve().parents[1] / "src-tauri/resources/engine/memory.py"
        print("Préparation locale des poids quantifiés…", flush=True)
        subprocess.run([str(python), str(worker), "--root", str(stage), "--prepare"], check=True)
    print(f"Runtime mémoire prêt : {ROOT}", flush=True)


if __name__ == "__main__":
    main()
