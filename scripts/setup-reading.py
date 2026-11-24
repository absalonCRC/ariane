"""Prepare Pocket TTS and the local word aligner for the macOS arm64 bundle."""
from pathlib import Path
import importlib.util
import json
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/reading"
OUT = ROOT / "src-tauri/resources/reading"
CACHE = ROOT / ".cache/reading"
spec = importlib.util.spec_from_file_location("engines", ROOT / "scripts/bundle-engines.py")
engines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engines)


def build_aligner(archive, output):
    with tempfile.TemporaryDirectory(prefix="ariane-align-") as directory:
        stage = Path(directory)
        with tarfile.open(archive) as opened:
            opened.extractall(stage, filter="data")
        src = stage / "whisper.cpp-1.9.6"
        build = stage / "build"
        sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
        includes = f"{sdk}/usr/include/c++/v1"
        subprocess.run(["cmake", "-S", src, "-B", build, "-DCMAKE_BUILD_TYPE=Release",
                        "-DBUILD_SHARED_LIBS=OFF", "-DGGML_METAL=OFF", "-DGGML_NATIVE=OFF",
                        "-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_BUILD_SERVER=OFF", "-DGGML_OPENMP=OFF",
                        f"-DCMAKE_OSX_SYSROOT={sdk}", f"-DCMAKE_CXX_FLAGS=-isystem {includes}"], check=True)
        subprocess.run(["cmake", "--build", build, "-j", "4", "--target", "whisper-cli"], check=True)
        libraries = ["examples/libcommon.a", "src/libwhisper.a", "ggml/src/libggml.a",
                     "ggml/src/libggml-cpu.a", "ggml/src/ggml-blas/libggml-blas.a", "ggml/src/libggml-base.a"]
        subprocess.run(["xcrun", "clang++", "-std=c++17", "-O2", "-isysroot", sdk, "-isystem", includes,
                        "-I", src / "include", "-I", src / "ggml/include", "-I", src / "examples",
                        SOURCE / "align.cpp", *(build / lib for lib in libraries),
                        "-framework", "Accelerate", "-o", output], check=True)


def main():
    lock = json.loads((ROOT / "resources.lock.json").read_text())["reading"]
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=OUT.parent) as directory:
        stage = Path(directory)
        pocket = lock["pocket"]
        with tarfile.open(engines.download(pocket["url"], pocket["sha256"], CACHE)) as archive:
            with archive.extractfile(pocket["member"]) as source, (stage / "pocket-tts").open("wb") as target:
                shutil.copyfileobj(source, target)
        if engines.digest(stage / "pocket-tts") != pocket["binary_sha256"]:
            raise RuntimeError("Pocket TTS binary checksum mismatch")
        (stage / "pocket-tts").chmod(0o755)
        whisper = lock["whisper"]
        build_aligner(engines.download(whisper["url"], whisper["sha256"], CACHE), stage / "align")
        for name in ["pocket-tts", "align"]:
            (stage / name).replace(OUT / name)
    receipt = {"align": engines.digest(OUT / "align"), "source": engines.digest(SOURCE / "align.cpp"),
               "whisper": lock["whisper"]["sha256"]}
    (OUT / "checksums.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
