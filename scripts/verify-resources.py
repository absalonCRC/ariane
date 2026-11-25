"""Verify the model and native files against the delivered package manifest."""
from pathlib import Path
import hashlib
import json
import sys

workspace = Path(__file__).resolve().parents[1]
resources = Path(sys.argv[1]) if len(sys.argv) > 1 else workspace / "src-tauri/resources"
manifest = json.loads((workspace / "resources.lock.json").read_text())
bundled_model = "models/" + manifest["model"]["name"]
expected = {bundled_model: manifest["model"]["sha256"]}
native = json.loads((resources / "engine/checksums.json").read_text())
with (workspace / "native-dependencies.lock.json").open("rb") as source:
    lock_hash = hashlib.file_digest(source, "sha256").hexdigest()
if native.get("native_lock_sha256") != lock_hash:
    raise SystemExit("Native resources are stale. Run python3 scripts/setup-resources.py")
files = native["files"]
required = {"llama-server", "pandoc", "typst", "pdf-text", "memory.py", "memory-model.txt", "ai-policy.json"}
if not required.issubset(files) or any(Path(name).name != name for name in files):
    raise SystemExit("Invalid native resource manifest")
if not any(name.startswith("libggml-cpu-") and name.endswith(".so") for name in files):
    raise SystemExit("Missing ggml CPU backend")
expected.update({"engine/" + name: checksum for name, checksum in files.items()})
if "reading" in manifest:
    reading = workspace / "scripts/reading"
    lock = manifest["reading"]
    receipt = json.loads((resources / "reading/checksums.json").read_text())
    if (receipt["source"] != hashlib.sha256((reading / "align.cpp").read_bytes()).hexdigest()
            or receipt["whisper"] != lock["whisper"]["sha256"]):
        raise SystemExit("Reading resources are stale. Run python3 scripts/setup-reading.py")
    expected["reading/align"] = receipt["align"]
    expected["reading/pocket-tts"] = lock["pocket"]["binary_sha256"]
if len(sys.argv) > 1:
    for file in resources.rglob("*"):
        if file.is_file() and file != resources / bundled_model and (file.suffix in (".safetensors", ".gguf") or file.name in ("align.bin", "whisper-tiny-q5_1.bin")):
            raise SystemExit(f"Unexpected optional model in the application bundle: {file.name}")
errors = []
for name, checksum in expected.items():
    path = resources / name
    if not path.is_file():
        errors.append("Missing: " + name)
        continue
    with path.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != checksum:
        errors.append("Checksum mismatch: " + name)
if errors:
    raise SystemExit("\n".join(errors))
print(f"Verified {len(expected)} runtime files in {resources}")
