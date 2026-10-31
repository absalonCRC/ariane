#!/usr/bin/env python3
"""Install the pinned offline proofreading engines for this Mac user."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile

ROOT = Path.home() / 'Library/Application Support/fr.ariane.writer/revision'
FILES = {
    'model.gguf': ('https://huggingface.co/BSC-LT/salamandraTA-2B-instruct-GGUF/resolve/f8dd48ca1de2f65ec494a6d03f1005f8d509a738/salamandrata_2b_inst_q8.gguf', '9cfebb63cd7e6b6d1755ea8ef001fcdadfa17831da1db96eafe3fc554913d5e1'),
    'languagetool.zip': ('https://languagetool.org/download/LanguageTool-6.6.zip', '53600506b399bb5ffe1e4c8dec794fd378212f14aaf38ccef9b6f89314d11631'),
    'java.tar.gz': ('https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.21%2B9/OpenJDK17U-jre_aarch64_mac_hotspot_17.0.21_9.tar.gz', 'a5ab5bacd6e719d5a5570580ed14dceb2ed532208a39af927906b9742da1745e'),
}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main():
    if sys.platform != 'darwin' or os.uname().machine != 'arm64':
        sys.exit('Cet installateur nécessite un Mac Apple Silicon.')
    if ROOT.exists():
        sys.exit(f'Installation existante conservée : {ROOT}')
    ROOT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.revision-install-', dir=ROOT.parent) as temp:
        base = Path(temp)
        staging = base / 'revision'
        staging.mkdir()
        for name, (url, sha) in FILES.items():
            path = base / name
            print(f'Téléchargement : {name}', flush=True)
            subprocess.run(['curl', '-fL', '--retry', '2', '--silent', '--show-error', '-o', str(path), url], check=True)
            if digest(path) != sha:
                sys.exit(f'Empreinte invalide : {name}')
        shutil.move(base / 'model.gguf', staging / 'salamandra-q8.gguf')
        # Reject archives containing paths outside the intended staging directory.
        for archive_path, opener in ((base / 'languagetool.zip', zipfile.ZipFile), (base / 'java.tar.gz', tarfile.open)):
            with opener(archive_path) as archive:
                names = archive.namelist() if isinstance(archive, zipfile.ZipFile) else archive.getnames()
                if any(Path(name).is_absolute() or '..' in Path(name).parts for name in names):
                    sys.exit('Archive contenant un chemin invalide.')
                if isinstance(archive, tarfile.TarFile):
                    archive.extractall(base, filter='data')
                else:
                    archive.extractall(base)
        shutil.move(base / 'LanguageTool-6.6', staging / 'languagetool')
        shutil.move(base / 'jdk-17.0.21+9-jre', staging / 'java')
        (staging / 'MANIFEST.txt').write_text('LanguageTool 6.6\nTemurin 17.0.21+9\nSalamandraTA 2B Q8\n', encoding='utf-8')
        os.rename(staging, ROOT)
    print(f'Moteurs de révision installés : {ROOT}')

if __name__ == '__main__':
    main()
