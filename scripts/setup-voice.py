#!/usr/bin/env python3
"""Install Ariane's local dictation runtime and pinned model files on macOS."""
from pathlib import Path
import shutil
import subprocess
import sys

root = Path.home() / "Library/Application Support/fr.ariane.writer/voice"
python = root / "runtime/bin/python"
uv = shutil.which("uv")
if not uv:
    sys.exit("L’installation de la dictée nécessite uv (https://docs.astral.sh/uv/).")
root.mkdir(parents=True, exist_ok=True)
if not python.exists():
    subprocess.run([uv, "venv", "--python", sys.executable, str(root / "runtime")], check=True)
subprocess.run([uv, "pip", "install", "--python", str(python), "parakeet-mlx==0.5.3"], check=True)
download = r'''
from huggingface_hub import snapshot_download, hf_hub_download
from pathlib import Path
import sys
root = Path(sys.argv[1])
snapshot_download("animaslabs/parakeet-tdt-0.6b-v3-mlx-4bit", revision="65247a0a9e735426eba06056a9535f7e67dcbbb9", local_dir=root / "models/parakeet")
hf_hub_download("spokenly/cleanup-1-gguf", filename="cleanup-1-q8_0.gguf", revision="79936c95e5c0ea9162ae7a435e64cb3127020e36", local_dir=root / "models")
'''
subprocess.run([str(python), "-c", download, str(root)], check=True)
print("Les modèles de dictée sont installés localement.")
