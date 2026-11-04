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
import argparse

ROOT = Path.home() / 'Library/Application Support/fr.ariane.writer/revision'
FILES = {
    'model.gguf': ('https://huggingface.co/BSC-LT/salamandraTA-2B-instruct-GGUF/resolve/f8dd48ca1de2f65ec494a6d03f1005f8d509a738/salamandrata_2b_inst_q8.gguf', '9cfebb63cd7e6b6d1755ea8ef001fcdadfa17831da1db96eafe3fc554913d5e1'),
    'languagetool.zip': ('https://languagetool.org/download/LanguageTool-6.6.zip', '53600506b399bb5ffe1e4c8dec794fd378212f14aaf38ccef9b6f89314d11631'),
    'java.tar.gz': ('https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.21%2B9/OpenJDK17U-jre_aarch64_mac_hotspot_17.0.21_9.tar.gz', 'a5ab5bacd6e719d5a5570580ed14dceb2ed532208a39af927906b9742da1745e'),
    # JNA 5.12.1 aborts on long macOS dlopen errors before trying bundled Hunspell.
    'jna.jar': ('https://repo.maven.apache.org/maven2/net/java/dev/jna/jna/5.13.0/jna-5.13.0.jar', '66d4f819a062a51a1d5627bffc23fac55d1677f0e0a1feba144aabdd670a64bb'),
    'jna-platform.jar': ('https://repo.maven.apache.org/maven2/net/java/dev/jna/jna-platform/5.13.0/jna-platform-5.13.0.jar', '474d7b88f6e97009b6ec1d98c3024dd95c23187c65dabfbc35331bcac3d173dd'),
}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def repair_jna(root, source):
    names = ['jna.jar', 'jna-platform.jar']
    # Validate both inputs before replacing either member of the pair.
    for name in names:
        if digest(source/name) != FILES[name][1]:
            raise ValueError(f'Empreinte invalide : {name}')
    libraries = root/'languagetool/libs'
    if not libraries.is_dir():
        raise ValueError('LanguageTool local absent')
    for name in names:
        target = libraries/name
        if target.exists():
            old_digest = digest(target)
            if old_digest == FILES[name][1]:
                continue
            backup = root/'.jna-backups'/old_digest/name
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copyfile(target, backup)
            elif digest(backup) != old_digest:
                raise ValueError('Sauvegarde JNA incohérente')
        with tempfile.NamedTemporaryFile(dir=libraries, prefix='.jna-', delete=False) as temporary:
            temporary_path = Path(temporary.name)
        try:
            shutil.copyfile(source/name, temporary_path)
            os.replace(temporary_path, target)
        finally:
            temporary_path.unlink(missing_ok=True)
    (root/'JNA-VERSION.txt').write_text('5.13.0\n', encoding='utf-8')

def download(path, name):
    url, sha = FILES[name]
    subprocess.run(['curl', '-fL', '--retry', '2', '--silent', '--show-error', '-o', str(path), url], check=True)
    if digest(path) != sha:
        raise ValueError(f'Empreinte invalide : {name}')

def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('--repair-jna', action='store_true', help='Réparer uniquement JNA dans une installation existante, avec sauvegarde')
    args = parser.parse_args()
    if sys.platform != 'darwin' or os.uname().machine != 'arm64':
        sys.exit('Cet installateur nécessite un Mac Apple Silicon.')
    if args.repair_jna:
        if not ROOT.is_dir():
            sys.exit('Installation de révision locale absente.')
        with tempfile.TemporaryDirectory(prefix='.jna-repair-', dir=ROOT.parent) as temp:
            source = Path(temp)
            for name in ['jna.jar', 'jna-platform.jar']:
                download(source/name, name)
            repair_jna(ROOT, source)
        print('JNA 5.13.0 vérifié ; bibliothèques précédentes conservées dans .jna-backups.')
        return
    if ROOT.exists():
        sys.exit(f'Installation existante conservée : {ROOT}')
    ROOT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.revision-install-', dir=ROOT.parent) as temp:
        base = Path(temp)
        staging = base / 'revision'
        staging.mkdir()
        for name in FILES:
            path = base / name
            print(f'Téléchargement : {name}', flush=True)
            download(path, name)
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
        repair_jna(staging, base)
        (staging / 'MANIFEST.txt').write_text('LanguageTool 6.6\nJNA 5.13.0\nTemurin 17.0.21+9\nSalamandraTA 2B Q8\n', encoding='utf-8')
        os.rename(staging, ROOT)
    print(f'Moteurs de révision installés : {ROOT}')

if __name__ == '__main__':
    main()
