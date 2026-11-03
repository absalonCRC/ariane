import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("install_runtime", Path(__file__).resolve().parents[1] / "install_runtime.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StagingTests(unittest.TestCase):
    def test_failure_preserves_current_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "voice"
            root.mkdir()
            (root / "current").write_text("valid")
            with self.assertRaises(RuntimeError):
                with MODULE.staged_install(root) as stage:
                    (stage / "unverified").write_text("bad")
                    raise RuntimeError("hash mismatch")
            self.assertEqual((root / "current").read_text(), "valid")
            self.assertEqual(list(Path(directory).iterdir()), [root])

    def test_validated_activation_keeps_previous_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "memory"
            root.mkdir()
            (root / "version").write_text("old")
            with MODULE.staged_install(root) as stage:
                (stage / "version").write_text("new")
            self.assertEqual((root / "version").read_text(), "new")
            self.assertEqual(next(Path(directory).glob("memory.previous-*")).joinpath("version").read_text(), "old")

    def test_pip_uses_hashes_and_checks_consistency(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(MODULE.subprocess, "run") as run:
            MODULE.install_python(Path(directory), "uv", Path("voice-requirements.lock"))
            commands = [call.args[0] for call in run.call_args_list]
            self.assertIn("--relocatable", commands[0])
            self.assertIn("--require-hashes", commands[1])
            self.assertIn("sync", commands[1])
            self.assertIn("check", commands[2])
