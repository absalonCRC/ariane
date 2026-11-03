"""Only the documented package/version/advisory/time tuple may be excepted."""
from datetime import date
import json
from pathlib import Path
import sys


def evaluate(report, policy, today):
    failures, accepted = set(), set()
    for dependency in report["dependencies"]:
        if dependency.get("skip_reason"):
            failures.add((dependency["name"], "unscanned"))
        for vulnerability in dependency.get("vulns", []):
            item = (dependency["name"], vulnerability["id"])
            if (dependency["name"] == policy["package"] and dependency["version"] == policy["version"]
                    and vulnerability["id"] in policy["advisories"] and today <= date.fromisoformat(policy["expires"])):
                accepted.add(item)
            else:
                failures.add(item)
    return sorted(failures), sorted(accepted)


if __name__ == "__main__":
    policy = json.loads(Path(__file__).with_name("python-security-exceptions.json").read_text())
    failures, accepted = evaluate(json.loads(Path(sys.argv[1]).read_text()), policy, date.today())
    print(json.dumps({"failures": failures, "temporaryExposureExceptions": accepted, "expires": policy["expires"]}, indent=2))
    sys.exit(bool(failures))
