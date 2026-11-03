"""Verified, relocatable Python runtimes, activated only after validation."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid


@contextmanager
def staged_install(root: Path):
    root.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{root.name}-install-", dir=root.parent))
    backup = root.with_name(f"{root.name}.previous-{uuid.uuid4().hex}")
    activated = False
    try:
        yield stage
        # Keep a previous installation for rollback; never delete the user's runtime.
        if root.exists() or root.is_symlink():
            root.rename(backup)
        try:
            stage.rename(root)
        except BaseException:
            if backup.exists() or backup.is_symlink():
                backup.rename(root)
            raise
        activated = True
    finally:
        if not activated:
            shutil.rmtree(stage, ignore_errors=True)


def install_python(stage: Path, uv: str, lock: Path) -> Path:
    runtime = stage / "runtime"
    subprocess.run([uv, "venv", "--relocatable", "--python", "3.11", str(runtime)], check=True)
    python = runtime / "bin/python"
    subprocess.run([uv, "pip", "sync", "--python", str(python), "--require-hashes", "--only-binary", ":all:", str(lock)], check=True)
    subprocess.run([uv, "pip", "check", "--python", str(python)], check=True)
    return python


def inventory(stage: Path, python: Path, uv: str, lock: Path) -> dict:
    return {"schema": 2, "lockSha256": hashlib.sha256(lock.read_bytes()).hexdigest(),
            "python": subprocess.check_output([str(python), "--version"], text=True).strip(),
            "packages": subprocess.check_output([uv, "pip", "freeze", "--python", str(python)], text=True).splitlines()}


# Executed by the isolated runtime, which owns the pinned huggingface_hub package.
DOWNLOAD = r'''
import hashlib, json, sys
from pathlib import Path
from huggingface_hub import HfApi, hf_hub_download
root, specs = Path(sys.argv[1]), json.loads(sys.argv[2])
manifest = {}
for name, spec in specs.items():
    info = HfApi().model_info(spec['repository'], revision=spec['revision'], files_metadata=True)
    if info.sha != spec['revision']:
        raise RuntimeError('Unexpected model revision')
    files = {f.rfilename: f for f in info.siblings}
    expected = spec.get('files') or [n for n in files if not n.startswith('.') and not n.lower().endswith(('.md', '.png', '.jpg'))]
    target = root / 'models' / name
    records = {}
    for filename in expected:
        metadata = files[filename]
        path = Path(hf_hub_download(repo_id=spec['repository'], revision=spec['revision'], filename=filename, local_dir=target))
        lfs = metadata.lfs
        digest = hashlib.sha256() if lfs else hashlib.sha1()
        if not lfs:
            digest.update(f'blob {path.stat().st_size}\0'.encode())
        with path.open('rb') as file:
            while chunk := file.read(1024 * 1024): digest.update(chunk)
        expected_hash = lfs.sha256 if lfs else metadata.blob_id
        if not expected_hash or digest.hexdigest() != expected_hash:
            raise RuntimeError(f'Artifact integrity mismatch: {name}/{filename}')
        records[filename] = {'bytes': path.stat().st_size, 'digest': expected_hash, 'algorithm': 'sha256' if lfs else 'git-sha1'}
    manifest[name] = {'repository': spec['repository'], 'revision': info.sha, 'files': records}
(root / 'models-verified.json').write_text(json.dumps(manifest, indent=2) + '\n')
'''


def download_models(stage: Path, python: Path, models: dict) -> dict:
    subprocess.run([str(python), "-c", DOWNLOAD, str(stage), json.dumps(models)], check=True)
    return json.loads((stage / "models-verified.json").read_text())
