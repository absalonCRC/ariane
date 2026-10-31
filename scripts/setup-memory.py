#!/usr/bin/env python3
"""Install pinned, offline memory models into Ariane's application support folder."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


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
    ROOT.mkdir(parents=True, exist_ok=True)
    python = ROOT / "runtime/bin/python"
    if not python.exists():
        subprocess.run([uv, "venv", "--python", "3.11", str(ROOT / "runtime")], check=True)
    env = os.environ.copy()
    env["UV_LINK_MODE"] = "hardlink"
    print("Installation des dépendances CPU dans le runtime Ariane…", flush=True)
    subprocess.run([uv, "pip", "install", "--python", str(python), "-r", str(Path(__file__).with_name("memory-requirements.lock"))], check=True, env=env)
    download = r'''
import os
from pathlib import Path
import sys
from huggingface_hub import hf_hub_download
root = Path(sys.argv[1])
models = __import__("json").loads(sys.argv[2])
os.environ["HF_HOME"] = str(root / "hf-cache")
for name, spec in models.items():
    target = root / "models" / name
    target.mkdir(parents=True, exist_ok=True)
    for filename in spec["files"]:
        print(f"{name}: {filename}", file=sys.stderr, flush=True)
        hf_hub_download(repo_id=spec["repository"], revision=spec["revision"], filename=filename, local_dir=target)
'''
    print("Téléchargement des révisions figées…", flush=True)
    subprocess.run([str(python), "-c", download, str(ROOT), json.dumps(MODELS)], check=True)
    manifest = {"schema": 1, "python": subprocess.check_output([str(python), "--version"], text=True).strip(), "packages": subprocess.check_output([uv, "pip", "freeze", "--python", str(python)], text=True).splitlines(), "models": {}}
    for name, spec in MODELS.items():
        target = ROOT / "models" / name
        files = {}
        for filename in spec["files"]:
            path = target / filename
            with path.open("rb") as source:
                digest = hashlib.file_digest(source, "sha256").hexdigest()
            files[filename] = {"bytes": path.stat().st_size, "sha256": digest}
        manifest["models"][name] = {k: v for k, v in spec.items() if k != "files"} | {"files": files}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    worker = Path(__file__).resolve().parents[1] / "src-tauri/resources/engine/memory.py"
    print("Préparation locale des poids quantifiés…", flush=True)
    subprocess.run([str(python), str(worker), "--root", str(ROOT), "--prepare"], check=True)
    print(f"Runtime mémoire prêt : {ROOT}", flush=True)


if __name__ == "__main__":
    main()
