"""Prepare the offline macOS runtime; weights are verified before installation."""
from pathlib import Path
import hashlib
import json
import importlib.util
import platform
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "src-tauri" / "resources"


def main():
    if sys.platform != "darwin" or platform.machine() != "arm64":
        raise SystemExit("Les moteurs de ce paquet ciblent macOS Apple Silicon.")
    if int(platform.mac_ver()[0].split(".")[0]) < 26:
        raise SystemExit("macOS 26 ou ultérieur est requis.")
    for executable in ["swiftc", "otool", "install_name_tool", "codesign"]:
        if not shutil.which(executable):
            raise SystemExit("Installer les outils Xcode : xcode-select --install")
    spec = importlib.util.spec_from_file_location("bundle_engines", ROOT / "scripts/bundle-engines.py")
    native = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(native)
    files = native.bundle(ROOT)
    engine = RESOURCES / "engine"
    engine.mkdir(parents=True, exist_ok=True)
    subprocess.run(["swiftc", "-O", str(ROOT / "scripts/pdf-text.swift"), "-o", str(engine / "pdf-text")], check=True)
    subprocess.run(["codesign", "--force", "--sign", "-", str(engine / "pdf-text")], check=True, capture_output=True)
    files += ["pdf-text", "memory.py", "memory-model.txt"]
    manifest = json.loads((ROOT / "resources.lock.json").read_text())
    model = manifest["model"]
    weights = RESOURCES / "models" / model["name"]
    weights.parent.mkdir(parents=True, exist_ok=True)

    def valid(path):
        if not path.is_file() or path.stat().st_size != model["bytes"]:
            return False
        with path.open("rb") as source:
            return hashlib.file_digest(source, "sha256").hexdigest() == model["sha256"]

    if not valid(weights):
        partial = weights.with_suffix(".download")
        url = model["url"] + "/resolve/" + model.get("revision", "main") + "/" + model["name"]
        print("Téléchargement du modèle local…", flush=True)
        try:
            with urllib.request.urlopen(url) as source, partial.open("wb") as target:
                shutil.copyfileobj(source, target)
            if not valid(partial):
                raise RuntimeError("Le modèle ne correspond pas à l’empreinte attendue.")
            partial.replace(weights)
        finally:
            partial.unlink(missing_ok=True)
    checksums = {
        "native_lock_sha256": native.digest(ROOT / "native-dependencies.lock.json"),
        "files": {name: native.digest(engine / name) for name in sorted(files)},
    }
    (engine / "checksums.json").write_text(json.dumps(checksums, indent=2) + "\n")
    print("Modèle vérifié. Les moteurs et les poids sont prêts.")


if __name__ == "__main__":
    main()
