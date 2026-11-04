#!/usr/bin/env python3
"""Archive a speech result URL observed in the connected provider's web UI.

This script never generates or bills a model request. It downloads the exact
result, records provenance and stops if estimated accumulated cost exceeds the
frozen corpus budget. Generated media stays outside Git.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--clip", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--directory", type=Path, default=ROOT/"artifacts/ai-2026-11-03/validation-elargie")
    parser.add_argument("--provider-seconds", type=float)
    parser.add_argument("--balance-observed", type=float)
    parser.add_argument("--corpus", type=Path, default=ROOT/"benchmarks/fixtures/ai/speech-stress.json")
    args = parser.parse_args()
    corpus = json.loads(args.corpus.read_text())
    clip = next(c for c in corpus["clips"] if c["id"] == args.clip)
    url = urllib.parse.urlparse(args.url)
    if url.scheme != "https" or not url.hostname.endswith(".fal.media"):
        parser.error("An observed HTTPS fal media result is required")
    ledger_path = args.directory/"voice-generation-ledger.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {
        "provider": "fal web playground via Safari", "endpoint": "elevenlabs/tts/eleven-v4",
        "rateUsdPer1000Characters": .08, "maxBudgetUsd": 3, "rows": []}
    rate = clip.get("rateUsdPer1000Characters", ledger["rateUsdPer1000Characters"])
    cost = len(clip["text"])*rate/1000
    if any(r["clip"] == args.clip for r in ledger["rows"]):
        parser.error("This clip is already archived; retain the original provenance")
    if sum(r["estimatedUsd"] for r in ledger["rows"])+cost > ledger["maxBudgetUsd"]:
        parser.error("Frozen budget exceeded")
    extension = ".wav" if url.path.endswith(".wav") else ".mp3"
    target = args.directory/"voices"/f"{args.clip}{extension}"
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(args.url, timeout=60) as response:
        audio = response.read(64*1024*1024+1)
    if len(audio) > 64*1024*1024:
        raise ValueError("Unexpectedly large audio result")
    target.write_bytes(audio)
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "quiet", "-show_format", "-show_streams", "-of", "json", str(target)], text=True))
    row = {"clip": clip["id"], "voice": clip["voice"], "seed": clip.get("seed"), "language": clip["language"],
        "endpoint": clip["source"], "rateUsdPer1000Characters": rate,
        "characters": len(clip["text"]), "estimatedUsd": cost, "creditBalanceObservedAfter": args.balance_observed,
        "providerElapsedSecondsObserved": args.provider_seconds, "url": args.url, "path": str(target),
        "sha256": hashlib.sha256(audio).hexdigest(), "durationSeconds": float(probe["format"]["duration"]),
        "streams": [{k:s[k] for k in ["codec_name", "sample_rate", "channels"] if k in s} for s in probe["streams"]],
        "downloadedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    ledger["rows"].append(row)
    ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"clip": row["clip"], "durationSeconds": row["durationSeconds"], "bytes": len(audio),
        "estimatedTotalUsd": sum(r["estimatedUsd"] for r in ledger["rows"])}))


if __name__ == "__main__":
    main()
