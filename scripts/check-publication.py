"""Check Git's publishable file set without exposing matched secret contents."""
from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def public_files(root=ROOT):
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
    ).decode().split("\0")
    return sorted(set(name for name in names if name))


def check(root=ROOT):
    names = public_files(root)
    errors = []
    patterns = {
        "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "GitHub token": re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
        "personal absolute path": re.compile(rb"/Users/[A-Za-z0-9_.-]+/"),
    }
    forbidden = {"artifacts", "node_modules", "target", ".cache", "output", ".playwright-cli"}
    for name in names:
        path = root / name
        if forbidden.intersection(Path(name).parts) or path.is_symlink():
            errors.append(f"Private/generated path or symlink: {name}")
            continue
        if not path.is_file():
            errors.append(f"Missing source: {name}")
            continue
        data = path.read_bytes()
        if len(data) > 5 * 1024 * 1024:
            errors.append(f"File exceeds 5 MiB: {name}")
        if data[:4] in (b'\xcf\xfa\xed\xfe', b'\xca\xfe\xba\xbe') or path.suffix in {'.gguf', '.sqlite', '.p12', '.p8', '.key'}:
            errors.append(f"Binary, model, data or key: {name}")
        for label, pattern in patterns.items():
            if pattern.search(data):
                errors.append(f"{label}: {name}")
    for name in ['LICENSE', 'COPYRIGHT', 'README.md', 'THIRD_PARTY.md', 'src-tauri/resources/engine/memory.py']:
        if name not in names:
            errors.append(f"Required public file missing: {name}")
    npm = json.loads((root / 'package.json').read_text())
    tauri = json.loads((root / 'src-tauri/tauri.conf.json').read_text())
    import tomllib
    cargo = tomllib.loads((root / 'src-tauri/Cargo.toml').read_text())['package']
    if len({npm['version'], tauri['version'], cargo['version']}) != 1:
        errors.append('npm, Cargo and Tauri versions differ')
    if npm.get('license') != 'GPL-3.0-only' or cargo.get('license') != 'GPL-3.0-only':
        errors.append('Unexpected project license')
    return names, errors


if __name__ == '__main__':
    names, errors = check()
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Checked {len(names)} publishable files; no matches for the configured exclusion/secret checks.')
