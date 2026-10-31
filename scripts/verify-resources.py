"""Verify the model and native files against the delivered package manifest."""
from pathlib import Path
import hashlib
import json
import sys

workspace = Path(__file__).resolve().parents[1]
resources = Path(sys.argv[1]) if len(sys.argv) > 1 else workspace / "src-tauri/resources"
manifest = json.loads((workspace / "resources.lock.json").read_text())
expected = {"models/" + manifest["model"]["name"]: manifest["model"]["sha256"]}
native = json.loads((resources / "engine/checksums.json").read_text())
with (workspace / "native-dependencies.lock.json").open("rb") as source:
    lock_hash = hashlib.file_digest(source, "sha256").hexdigest()
if native.get("native_lock_sha256") != lock_hash:
    raise SystemExit("Native resources are stale. Run python3 scripts/setup-resources.py")
files = native["files"]
required = {"llama-server", "pandoc", "typst", "pdf-text", "memory.py"}
if not required.issubset(files) or any(Path(name).name != name for name in files):
    raise SystemExit("Invalid native resource manifest")
expected.update({"engine/" + name: checksum for name, checksum in files.items()})
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
print(f"Verified {len(expected)} model and engine files in {resources}")
