"""The public film size exception must not weaken other publication checks."""

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check-publication.py"
spec = importlib.util.spec_from_file_location("publication", SCRIPT)
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)

MIB = 1024 * 1024
FILM = "docs/media/ariane-film.mp4"


class Publication(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        for name in ["LICENSE", "COPYRIGHT", "README.md", "THIRD_PARTY.md",
                     "src-tauri/resources/engine/memory.py"]:
            self.write(name, b"")
        manifest = {"version": "0.2.0-alpha.1", "license": "GPL-3.0-only"}
        self.write("package.json", json.dumps(manifest).encode())
        self.write("src-tauri/tauri.conf.json", json.dumps(manifest).encode())
        self.write("src-tauri/Cargo.toml",
                   b'[package]\nversion = "0.2.0-alpha.1"\nlicense = "GPL-3.0-only"\n')

    def write(self, name, data=b"", size=None):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as handle:
            handle.write(data)
            if size is not None:
                handle.truncate(size)

    def errors(self):
        return publication.check(self.root)[1]

    def test_film_has_a_bounded_size_exception(self):
        self.write(FILM, size=15 * MIB)
        self.assertEqual(self.errors(), [])
        self.write(FILM, size=15 * MIB + 1)
        self.assertEqual(self.errors(), [f"File exceeds 15 MiB: {FILM}"])

    def test_other_paths_and_media_keep_the_five_mib_limit(self):
        for name in ["README.md", "docs/media/another-film.mp4",
                     "ariane-film.mp4"]:
            with self.subTest(name=name):
                self.write(name, size=5 * MIB)
                self.assertEqual(self.errors(), [])
                self.write(name, size=5 * MIB + 1)
                self.assertEqual(self.errors(), [f"File exceeds 5 MiB: {name}"])
                self.write(name)

    def test_large_film_still_checks_tokens_and_binary_magic(self):
        for data, label in [(b"ghp_" + b"x" * 36, "GitHub token"),
                            (b"\xcf\xfa\xed\xfe", "Binary, model, data or key")]:
            with self.subTest(label=label):
                self.write(FILM, data, size=6 * MIB)
                self.assertEqual(self.errors(), [f"{label}: {FILM}"])

    def test_film_symlink_is_still_rejected(self):
        path = self.root / FILM
        path.parent.mkdir(parents=True)
        path.symlink_to(self.root / "README.md")
        self.assertEqual(self.errors(), [f"Private/generated path or symlink: {FILM}"])


if __name__ == "__main__":
    unittest.main()
