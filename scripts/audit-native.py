"""Query OSV for indexed native components; report remaining inventory explicitly."""
import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = {"pandoc": ("Hackage", "pandoc"), "typst": ("crates.io", "typst"), "openssl@4": ("OSS-Fuzz", "openssl"), "ggml": ("OSS-Fuzz", "ggml")}


def findings(results):
    return [(row["name"], vulnerability["id"]) for row in results for vulnerability in row.get("vulns", [])]


def main():
    inventory = json.loads((ROOT / "native-dependencies.lock.json").read_text())["packages"]
    queries, names, uncovered = [], [], []
    for package in inventory:
        revision = package.get("source", {}).get("revision")
        if revision:
            query = {"commit": revision}
        elif package["name"] in PACKAGES:
            ecosystem, name = PACKAGES[package["name"]]
            query = {"package": {"ecosystem": ecosystem, "name": name}, "version": package["version"]}
        else:
            uncovered.append({"name": package["name"], "version": package["version"]})
            continue
        queries.append(query)
        names.append(package["name"])
    request = urllib.request.Request("https://api.osv.dev/v1/querybatch", data=json.dumps({"queries": queries}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        results = json.load(response)["results"]
    if len(results) != len(names):
        raise RuntimeError("Incomplete OSV response")
    rows = [dict(result, name=name) for name, result in zip(names, results)]
    print(json.dumps({"indexedQueries": rows, "manualReviewRequired": uncovered, "coverage": "OSV indexed advisories only; no result does not prove absence of a vulnerability"}, indent=2))
    return bool(findings(rows))


if __name__ == "__main__":
    sys.exit(main())
