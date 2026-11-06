"""Refresh the `adrs` list of a CALM architecture file from the konspekt instance's ADR waypoints.

prototype.architecture.json is edited by hand. This script rewrites only its `adrs` field: the repo-relative paths
of the waypoints with `subtype: adr`, leaving out a rejected ADR and one that is the `to` of a supersedes edge.

    python sync_adrs.py prototype.architecture.json
"""
import json, re, sys
from pathlib import Path

INSTANCE = Path(__file__).resolve().parent.parent / ".konspekt" / "instance"


def adr_paths():
    edges = (INSTANCE / "edges" / "edges.md").read_text(encoding="utf-8")
    superseded = set(re.findall(r"^\|[^|]*\|\s*supersedes\s*\|[^|]*\|\s*waypoint:([\w-]+)\s*\|", edges, re.M))
    out = []
    for f in sorted((INSTANCE / "waypoints").glob("*.md")):
        front = f.read_text(encoding="utf-8").split("```", 2)[1]
        if re.search(r"^subtype:\s*adr\s*$", front, re.M) and not re.search(r"^review:\s*rejected\s*$", front, re.M) \
                and f.stem not in superseded:
            out.append(f.relative_to(INSTANCE.parent.parent).as_posix())
    return out


if __name__ == "__main__":
    path = Path(sys.argv[1])
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["adrs"] = adr_paths()
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"{len(doc['adrs'])} ADRs written to {path}")
