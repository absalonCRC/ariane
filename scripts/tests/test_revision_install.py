"""Reversible, checksum-verified JNA repair of an existing model installation."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1]/'setup-revision.py'
spec = importlib.util.spec_from_file_location('revision_installer', SCRIPT)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class RevisionInstall(unittest.TestCase):
    def test_repair_preserves_originals_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'revision';libraries=root/'languagetool/libs';libraries.mkdir(parents=True)
            source=Path(directory)/'source';source.mkdir()
            files={}
            originals={}
            for name in ['jna.jar','jna-platform.jar']:
                originals[name]=('old '+name).encode();(libraries/name).write_bytes(originals[name])
                content=('new '+name).encode();(source/name).write_bytes(content)
                files[name]=('unused',hashlib.sha256(content).hexdigest())
            model=root/'salamandra-q8.gguf';model.write_bytes(b'original model')
            with patch.object(installer,'FILES',files):
                installer.repair_jna(root,source)
                installer.repair_jna(root,source)
            self.assertEqual(model.read_bytes(),b'original model')
            for name,content in originals.items():
                backup=root/'.jna-backups'/hashlib.sha256(content).hexdigest()/name
                self.assertEqual(backup.read_bytes(),content)
                self.assertEqual((libraries/name).read_bytes(),(source/name).read_bytes())
            self.assertEqual(len(list((root/'.jna-backups').glob('*/*'))),2)

    def test_invalid_second_input_cannot_partially_replace_the_pair(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'revision';libraries=root/'languagetool/libs';libraries.mkdir(parents=True)
            source=Path(directory)/'source';source.mkdir()
            for name in ['jna.jar','jna-platform.jar']:
                (libraries/name).write_bytes(b'original');(source/name).write_bytes(b'new')
            files={'jna.jar':('unused',hashlib.sha256(b'new').hexdigest()),'jna-platform.jar':('unused','wrong checksum')}
            with patch.object(installer,'FILES',files), self.assertRaises(ValueError):
                installer.repair_jna(root,source)
            self.assertEqual((libraries/'jna.jar').read_bytes(),b'original')
            self.assertEqual((libraries/'jna-platform.jar').read_bytes(),b'original')


if __name__=='__main__':unittest.main()
