#!/usr/bin/env python3
"""Run the installed batch voice path, sample owned processes, and score scripts.

Speech is synthetic: WER is relative to the requested TTS script, not a human
transcription. The watchdog stops only its own process group and retains all
completed cases. RSS on Apple unified memory is not total Metal allocation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
import unicodedata

ROOT = Path(__file__).resolve().parents[1]


def words(text):
    return re.findall(r"[^\W_]+", unicodedata.normalize("NFC", text).casefold(), re.UNICODE)


def folded(text):
    return " ".join(words("".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))))


NUMBERS = {
    "fr": {"mille deux cents": "1200", "neuf cents": "900", "cent vingt": "120", "quarante deux": "42", "vingt quatre": "24", "trente": "30", "quinze": "15", "douze": "12"},
    "en": {"one hundred and twenty": "120", "nine hundred": "900"},
    "es": {"ciento veinte": "120", "novecientos": "900", "doce": "12"},
    "de": {"hundertzwanzig": "120", "neunhundert": "900"},
    "it": {"centoventi": "120", "novecento": "900", "dodici": "12"},
}


def normalized(text, language):
    text = " "+folded(text)+" "
    for source, number in NUMBERS.get(language, {}).items():
        text = text.replace(" "+source+" ", " "+number+" ")
    return text.split()


def edit_counts(reference, hypothesis):
    # Each cell stores (distance, substitutions, deletions, insertions).
    row = [(i, 0, 0, i) for i in range(len(hypothesis)+1)]
    for i, token in enumerate(reference):
        next_row = [(i+1, 0, i+1, 0)]
        for j, candidate in enumerate(hypothesis):
            if token == candidate:
                next_row.append(row[j])
                continue
            diagonal, above, left = row[j], row[j+1], next_row[j]
            next_row.append(min((diagonal[0]+1, diagonal[1]+1, diagonal[2], diagonal[3]),
                                (above[0]+1, above[1], above[2]+1, above[3]),
                                (left[0]+1, left[1], left[2], left[3]+1)))
        row = next_row
    distance, substitutions, deletions, insertions = row[-1]
    return {"referenceWords": len(reference), "distance": distance, "substitutions": substitutions,
            "deletions": deletions, "insertions": insertions,
            "wer": distance/len(reference) if reference else None}


def score(report):
    scored = []
    for row in report.get("rows", []):
        case = row["case"]
        if case.get("expectedError") or "error" in row:
            scored.append({"id": case["id"], "iteration": row["iteration"], "error": row.get("error"),
                           "expectedErrorObserved": bool(row.get("error")) == bool(case.get("expectedError"))})
            continue
        output = row["output"]
        reference = case["expected"]
        item = {"id": case["id"], "iteration": row["iteration"], "variant": case["variant"],
                "kind": case["kind"], "language": case["language"], "cleanupRequested": case["cleanup"],
                "cleaned": output["cleaned"], "elapsedMs": row["elapsedMs"],
                "audioSeconds": case["durationSeconds"],
                "realTimeFactor": row["elapsedMs"]/1000/case["durationSeconds"]}
        for key in ["raw", "text"]:
            hypothesis = output[key]
            norm = normalized(hypothesis, case["language"])
            gold = normalized(reference, case["language"])
            item[key] = {"strict": edit_counts(reference.split(), hypothesis.split()),
                         "normalized": edit_counts(gold, norm),
                         "namesPresent": [name for name in case["names"] if " "+folded(name)+" " in " "+folded(hypothesis)+" "],
                         "namesExact": [name for name in case["names"] if " "+" ".join(words(name))+" " in " "+" ".join(words(hypothesis))+" "],
                         "namesExpected": case["names"],
                         "tailLastWordPresent": bool(gold and norm and gold[-1] == norm[-1]),
                         "tailFive": edit_counts(gold[-5:], norm[-5:]),
                         "emptyNegative": not hypothesis.strip() if not reference else None}
        scored.append(item)
    groups = {}
    for row in scored:
        if "raw" not in row:
            continue
        group = groups.setdefault(row["language"]+":"+row["variant"], {"cases": 0, "referenceWords": 0, "rawErrors": 0, "finalErrors": 0, "audioSeconds": 0., "inferenceSeconds": 0.})
        group["cases"] += 1
        group["referenceWords"] += row["raw"]["normalized"]["referenceWords"]
        group["rawErrors"] += row["raw"]["normalized"]["distance"]
        group["finalErrors"] += row["text"]["normalized"]["distance"]
        group["audioSeconds"] += row["audioSeconds"]
        group["inferenceSeconds"] += row["elapsedMs"]/1000
    for group in groups.values():
        group["rawWer"] = group["rawErrors"]/group["referenceWords"] if group["referenceWords"] else None
        group["finalWer"] = group["finalErrors"]/group["referenceWords"] if group["referenceWords"] else None
    return {"scorerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "note": "Script-relative synthetic WER. Strict scoring retains case, punctuation, accents and number spellings on whitespace-delimited words. Normalized scoring folds case, punctuation, accents and the declared number phrases; no reference is adapted after inference.",
            "numberAliases": NUMBERS, "groups": groups, "cases": scored}


def processes():
    result = {}
    for line in subprocess.check_output(["ps", "-axo", "pid=,ppid=,rss=,time=,comm="], text=True).splitlines():
        parts = line.strip().split(None, 4)
        if len(parts) != 5:
            continue
        pid, parent, rss, cpu, command = parts
        seconds = 0.
        for value in cpu.split(":"):
            seconds = seconds*60+float(value)
        result[int(pid)] = {"pid": int(pid), "parent": int(parent), "rssKiB": int(rss), "cpuSeconds": seconds, "command": command}
    return result


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--data", type=Path, default=Path.home()/"Library/Application Support/fr.ariane.writer")
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--postprocess", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    report_path = output/"native-speech.json"
    if not args.postprocess:
        output.mkdir(parents=True, exist_ok=False)
        env = os.environ | {"ARIANE_SPEECH_MANIFEST": str(args.manifest.resolve()), "ARIANE_SPEECH_REPORT": str(report_path), "ARIANE_VOICE_TEST_DATA": str(args.data)}
        sources = [args.manifest, Path(__file__), ROOT/"src-tauri/src/voice.rs", ROOT/"src-tauri/src/voice/fidelity.rs", ROOT/"src-tauri/resources/voice/transcribe.py", ROOT/"src-tauri/src/ai_benchmark/speech.rs"]
        (output/"provenance.json").write_text(json.dumps({"startedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "files": {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}, "watchdog": {"ownedTotalRssLimitGiB": 6, "ownedProcessRssLimitGiB": 4, "criticalPressureConsecutiveSamples": 4, "sampleSeconds": 2}}, indent=2)+"\n")
        started = time.monotonic()
        samples = []
        critical = 0
        aborted = None
        active_case = None
        case_started = started
        with (output/"native.log").open("w") as log:
            process = subprocess.Popen(["cargo", "test", "--locked", "--manifest-path", "src-tauri/Cargo.toml", "ai_benchmark::speech_stress_evaluation", "--", "--ignored", "--exact", "--nocapture"], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                while process.poll() is None:
                    table = processes()
                    owned = {process.pid}
                    for _ in range(8):
                        owned |= {pid for pid, p in table.items() if p["parent"] in owned}
                    rows = [table[pid] for pid in owned if pid in table]
                    pressure = int(subprocess.check_output(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True))
                    critical = critical+1 if pressure == 4 else 0
                    total_rss = sum(p["rssKiB"] for p in rows)
                    sample = {"elapsedSeconds": time.monotonic()-started, "pressure": pressure, "ownedRssKiB": total_rss, "owned": rows}
                    samples.append(sample)
                    log_text = (output/"native.log").read_text()
                    starts = re.findall(r'^speech-start (.+)$', log_text, re.MULTILINE)
                    pending = starts[-1] if starts and not re.search(r'^speech-case '+re.escape(starts[-1])+r' \d+ms$', log_text, re.MULTILINE) else None
                    if pending != active_case:
                        active_case = pending
                        case_started = time.monotonic()
                    sample["activeCase"] = active_case
                    if total_rss > 6*1024*1024 or any(p["rssKiB"] > 4*1024*1024 for p in rows):
                        aborted = "owned RSS exceeded bounded test budget"
                    elif critical >= 4:
                        aborted = "sustained system critical memory pressure"
                    elif time.monotonic()-started > args.timeout_seconds:
                        aborted = "test time budget exceeded"
                    elif active_case and time.monotonic()-case_started > 180:
                        aborted = "single speech case exceeded 180 seconds"
                    if aborted:
                        os.killpg(process.pid, signal.SIGTERM)
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                        break
                    time.sleep(2)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=10)
                (output/"process-samples.json").write_text(json.dumps({"aborted": aborted, "exitCode": process.returncode, "samples": samples}, indent=2)+"\n")
        print(json.dumps({"exitCode": process.returncode, "aborted": aborted, "report": str(report_path)}), flush=True)
    if report_path.exists():
        report = json.loads(report_path.read_text())
        scored = score(report)
        (output/"scores.json").write_text(json.dumps(scored, ensure_ascii=False, indent=2)+"\n")
        print(json.dumps({"complete": report["complete"], "groups": scored["groups"]}, ensure_ascii=False))
    if not args.postprocess and (aborted or process.returncode):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
