#!/usr/bin/env python3
"""Package an existing ad-hoc-signed Ariane.app for local macOS installation."""

import argparse
import hashlib
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def run(*args: str) -> str:
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    return result.stdout + result.stderr


def inspect_app(app: Path) -> str:
    if app.name != "Ariane.app" or not app.is_dir() or app.is_symlink():
        raise ValueError("Indiquer un dossier Ariane.app existant, sans lien symbolique.")
    info_path = app / "Contents" / "Info.plist"
    if not info_path.is_file() or info_path.is_symlink():
        raise ValueError("Info.plist absent du bundle.")
    with info_path.open("rb") as handle:
        info = plistlib.load(handle)
    if info.get("CFBundleIdentifier") != "fr.ariane.writer":
        raise ValueError("Identifiant du bundle Ariane inattendu.")
    version = info.get("CFBundleShortVersionString")
    executable = info.get("CFBundleExecutable")
    if not isinstance(version, str) or not version or not isinstance(executable, str):
        raise ValueError("Version ou exécutable absent du bundle.")
    if not all(c.isalnum() or c in ".-_" for c in version):
        raise ValueError("Version du bundle impropre à un nom de fichier.")
    binary = app / "Contents" / "MacOS" / executable
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError("Exécutable absent ou non exécutable.")
    arches = run("lipo", "-archs", str(binary)).split()
    if arches != ["arm64"]:
        raise ValueError(f"Architecture inattendue : {' '.join(arches)}")
    run("codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app))
    signature = run("codesign", "-dv", "--verbose=2", str(app))
    if "Signature=adhoc" not in signature:
        raise ValueError("Ce flux attend une signature ad hoc existante.")
    return version


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package(app: Path, output_dir: Path, version: str) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    name = f"Ariane-{version}-macOS-arm64-local-adhoc.dmg"
    dmg = output_dir / name
    manifest = output_dir / f"{name}.sha256"
    if dmg.exists() or manifest.exists():
        raise FileExistsError("Un paquet ou manifeste porte déjà ce nom ; choisir un autre dossier.")
    with tempfile.TemporaryDirectory(prefix=".ariane-package-", dir=output_dir) as temp:
        workspace = Path(temp)
        stage = workspace / "stage"
        stage.mkdir()
        run("ditto", str(app), str(stage / app.name))
        (stage / "Applications").symlink_to("/Applications", target_is_directory=True)
        instructions = Path(__file__).resolve().parents[1] / "docs" / "installing.md"
        shutil.copyfile(instructions, stage / "Installer Ariane.md")
        staged_app = stage / app.name
        inspect_app(staged_app)
        temporary_dmg = workspace / name
        run(
            "hdiutil", "create", "-srcfolder", str(stage), "-volname", "Ariane",
            "-format", "UDZO", "-imagekey", "zlib-level=9", str(temporary_dmg),
        )
        run("hdiutil", "verify", str(temporary_dmg))
        mount = workspace / "mounted"
        mount.mkdir()
        attached = False
        try:
            run(
                "hdiutil", "attach", "-readonly", "-nobrowse", "-noautoopen",
                "-mountpoint", str(mount), str(temporary_dmg),
            )
            attached = True
            if not (mount / "Applications").is_symlink() or os.readlink(mount / "Applications") != "/Applications":
                raise ValueError("Alias Applications absent du volume monté.")
            inspect_app(mount / app.name)
            original_binary = app / "Contents" / "MacOS" / "ariane"
            mounted_binary = mount / app.name / "Contents" / "MacOS" / "ariane"
            if sha256(original_binary) != sha256(mounted_binary):
                raise ValueError("L'exécutable du volume monté diffère du bundle source.")
        finally:
            if attached:
                run("hdiutil", "detach", str(mount))
        checksum = sha256(temporary_dmg)
        # Both names are reserved exclusively so reruns never replace an earlier build.
        os.link(temporary_dmg, dmg)
        try:
            with manifest.open("x", encoding="utf-8") as handle:
                handle.write(f"{checksum}  {name}\n")
        except BaseException:
            dmg.unlink()
            raise
    return dmg, manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path, help="Chemin du bundle Ariane.app déjà construit")
    parser.add_argument("output_dir", type=Path, nargs="?", help="Dossier de sortie neuf ou existant")
    parser.add_argument("--check-only", action="store_true", help="Vérifier le bundle sans créer de DMG")
    args = parser.parse_args()
    if not args.check_only and args.output_dir is None:
        parser.error("output_dir est requis pour créer le DMG")
    try:
        if args.app.is_symlink():
            raise ValueError("Indiquer le bundle directement, sans lien symbolique.")
        app = args.app.resolve(strict=True)
        version = inspect_app(app)
        print(f"Bundle Ariane {version} : arm64, signature ad hoc vérifiée.")
        if not args.check_only:
            dmg, manifest = package(app, args.output_dir.resolve(), version)
            print(f"DMG vérifié : {dmg}\nSHA-256 : {manifest}")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Échec : {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
