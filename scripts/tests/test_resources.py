"""Packaging regressions: corrupt inputs must not be trusted or installed."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bundler', SCRIPTS / 'bundle-engines.py')
bundler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundler)


class Downloads(unittest.TestCase):
    def test_replaces_corrupt_cache_but_rejects_corrupt_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'upstream'
            source.write_bytes(b'verified upstream bytes')
            checksum = bundler.digest(source)
            cache = root / 'cache'
            cache.mkdir()
            (cache / checksum).write_bytes(b'corrupt cache')
            self.assertEqual(bundler.download(source.as_uri(), checksum, cache).read_bytes(), source.read_bytes())
            (cache / checksum).unlink()
            source.write_bytes(b'tampered upstream')
            with self.assertRaisesRegex(RuntimeError, 'Checksum mismatch'):
                bundler.download(source.as_uri(), checksum, cache)
            self.assertEqual(list(cache.iterdir()), [])

    def test_verifier_rejects_changed_missing_and_stale_resources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            shutil.copyfile(SCRIPTS / 'verify-resources.py', root / 'scripts/verify-resources.py')
            resources = root / 'src-tauri/resources'
            engine = resources / 'engine'
            engine.mkdir(parents=True)
            (resources / 'models').mkdir()
            model = resources / 'models/test.gguf'
            model.write_bytes(b'model')
            (root / 'resources.lock.json').write_text(json.dumps({'model': {'name': 'test.gguf', 'sha256': bundler.digest(model)}}))
            lock = root / 'native-dependencies.lock.json'
            lock.write_text('{}')
            names = ['llama-server', 'pandoc', 'typst', 'pdf-text', 'memory.py']
            for name in names:
                (engine / name).write_bytes(name.encode())
            (engine / 'checksums.json').write_text(json.dumps({'native_lock_sha256': bundler.digest(lock), 'files': {name: bundler.digest(engine / name) for name in names}}))
            def run():
                return subprocess.run([sys.executable, str(root / 'scripts/verify-resources.py')], capture_output=True, text=True)
            self.assertEqual(run().returncode, 0)
            (engine / 'memory.py').write_text('changed worker')
            self.assertIn('Checksum mismatch', run().stderr)
            (engine / 'memory.py').unlink()
            self.assertIn('Missing:', run().stderr)
            lock.write_text('{"changed":true}')
            self.assertIn('stale', run().stderr)


if __name__ == '__main__':
    unittest.main()
