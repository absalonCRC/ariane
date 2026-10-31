"""Bundle pinned Homebrew bottles without a Homebrew installation.

Archives are read as data; no install scripts run or archive paths are extracted.
Only the dependency closure of the three entry points is copied.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def download(url, checksum, cache):
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / checksum
    if target.is_file() and digest(target) == checksum:
        return target
    headers = {}
    if url.startswith("https://ghcr.io/v2/"):
        repository = url.split("/v2/", 1)[1].split("/blobs/", 1)[0]
        query = urllib.parse.urlencode({"service": "ghcr.io", "scope": f"repository:{repository}:pull"})
        with urllib.request.urlopen("https://ghcr.io/token?" + query, timeout=60) as response:
            token = json.load(response)["token"]
        headers["Authorization"] = "Bearer " + token
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as pending:
        partial = Path(pending.name)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as response:
                shutil.copyfileobj(response, pending)
            pending.close()
            if digest(partial) != checksum:
                raise RuntimeError("Checksum mismatch: " + url)
            partial.replace(target)
        finally:
            partial.unlink(missing_ok=True)
    return target


def bundle(root=ROOT):
    lock = json.loads((root / "native-dependencies.lock.json").read_text())
    engine = root / "src-tauri/resources/engine"
    engine.mkdir(parents=True, exist_ok=True)
    notices = root / "src-tauri/resources/notices/native"
    notices.mkdir(parents=True, exist_ok=True)
    entries, aliases = {}, {}
    executables = {"llama-server", "pandoc", "typst"}
    with tempfile.TemporaryDirectory(prefix="ariane-native-") as temporary:
        stage = Path(temporary)
        for package in lock["packages"]:
            print(f"Preparing {package['name']} {package['version']}…", flush=True)
            bottle = package["bottle"]
            archive = download(bottle["url"], bottle["sha256"], root / ".cache/native")
            with tarfile.open(archive) as source:
                for member in source.getmembers():
                    name = Path(member.name).name
                    parts = Path(member.name).parts
                    wanted = ("lib" in parts and name.endswith(".dylib")) or ("libexec" in parts and name.startswith("libggml-") and name.endswith(".so")) or ("bin" in parts and name in executables)
                    if wanted and member.issym():
                        aliases[name] = Path(member.linkname).name
                    elif wanted and member.isfile():
                        if name in entries:
                            raise RuntimeError("Duplicate native library: " + name)
                        path = stage / name
                        with source.extractfile(member) as reader, path.open("wb") as writer:
                            shutil.copyfileobj(reader, writer)
                        path.chmod(0o755)
                        entries[name] = path
                    elif member.isfile() and (name.upper().startswith(("LICENSE", "COPYING", "NOTICE")) or ".brew" in parts):
                        folder = notices / package["name"].replace("/", "-")
                        folder.mkdir(parents=True, exist_ok=True)
                        with source.extractfile(member) as reader:
                            (folder / name).write_bytes(reader.read())

        def resolve(name):
            visited = set()
            while name in aliases:
                if name in visited:
                    raise RuntimeError("Cyclic native alias: " + name)
                visited.add(name)
                name = aliases[name]
            if name not in entries:
                raise RuntimeError("Missing pinned native dependency: " + name)
            return name

        copied = {}

        def copy(name):
            name = resolve(name)
            if name in copied:
                return name
            source = entries[name]
            destination = engine / name
            copied[name] = destination
            shutil.copy2(source, destination)
            links = subprocess.check_output(["otool", "-L", str(source)], text=True).splitlines()[1:]
            for line in links:
                link = line.strip().split(" (")[0]
                if link.startswith(("/System/", "/usr/lib/")):
                    continue
                dependency = resolve(Path(link).name)
                if dependency == name:
                    continue
                copy(dependency)
                subprocess.run(["install_name_tool", "-change", link, "@loader_path/" + dependency, str(destination)], check=True, capture_output=True)
            if destination.suffix == ".dylib":
                subprocess.run(["install_name_tool", "-id", "@loader_path/" + name, str(destination)], check=True, capture_output=True)
            subprocess.run(["codesign", "--force", "--sign", "-", str(destination)], check=True, capture_output=True)
            return name

        backends = sorted(name for name in entries if name.startswith("libggml-") and name.endswith(".so"))
        if not backends or not any(name.startswith("libggml-cpu-") for name in backends):
            raise RuntimeError("Pinned ggml archive does not contain CPU backends")
        for name in sorted(executables) + backends:
            copy(name)
    (notices / "provenance.json").write_text(json.dumps(lock, indent=2) + "\n")
    return sorted(copied)


if __name__ == "__main__":
    bundle()
