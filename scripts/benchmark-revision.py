#!/usr/bin/env python3
"""Record local revision engines, then run the production display filters."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--data", type=Path, default=Path.home()/"Library/Application Support/fr.ariane.writer")
    parser.add_argument("--postprocess", action="store_true")
    parser.add_argument("--corpus", type=Path, default=ROOT/"benchmarks/fixtures/ai/revision.json")
    args = parser.parse_args()
    args.corpus = args.corpus.resolve()
    if args.output.exists() and not args.postprocess:
        parser.error("Use a new output file; --postprocess reuses a recorded inference")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ | {"ARIANE_REVISION_REPORT": str(args.output.resolve()), "ARIANE_REVISION_TEST_DATA": str(args.data), "ARIANE_REVISION_CORPUS": str(args.corpus.resolve())}
    if not args.postprocess:
        subprocess.run(["cargo", "test", "--locked", "--manifest-path", "src-tauri/Cargo.toml", "ai_benchmark::revision_context_evaluation", "--", "--ignored", "--exact"], cwd=ROOT, env=env, check=True)
    subprocess.run(["npx", "vitest", "run", "tests/revision-evaluation.test.ts"], cwd=ROOT, env=env, check=True)
    report = json.loads(args.output.read_text())
    paths = [args.corpus, ROOT/"src-tauri/src/revision.rs", ROOT/"src/revision/suggestions.ts", ROOT/"tests/revision-evaluation.test.ts", Path(__file__)]
    report["manifest"] = {"commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "hardware": platform.platform(), "files": {str(p.relative_to(ROOT)): digest(p) for p in paths},
        "models": {str(p.relative_to(args.data)): digest(p) for p in [args.data/"revision/salamandra-q8.gguf", args.data/"revision/languagetool/languagetool-server.jar", args.data/"revision/languagetool/libs/jna.jar", args.data/"revision/languagetool/libs/jna-platform.jar"]},
        "note": "Paired synthetic examples. The first LanguageTool request includes process startup; first useful result timings are not a browser rendering measurement."}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps(report["displayMetrics"], ensure_ascii=False))


if __name__ == "__main__":
    main()
