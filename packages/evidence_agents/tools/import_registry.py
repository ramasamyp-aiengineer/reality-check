"""Convert an official registry export (CSV or XLSX) into a snapshot JSON.

Usage:
  python -m evidence_agents.tools.import_registry rbi_dla path/to/rbi_dla_export.xlsx
  python -m evidence_agents.tools.import_registry sebi_ia_ra path/to/sebi_list.csv

Headers are matched loosely, following RBI's Annex-I reporting format (Name of the DLA, Name of the owner of
DLA, Available on, Link to DLA, Website of RE) plus the regulated entity name column.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import UTC, datetime
from pathlib import Path

from evidence_agents.registry.loader import DATA_DIR, package_from_link

COLUMNS = {
    "name": ("name of the dla", "dla name", "app name", "name of dla", "name", "investment adviser", "research analyst"),
    "owner": ("name of the owner", "owner", "lsp"),
    "regulated_entity": ("name of re", "regulated entity", "name of the re", "entity name", "nbfc", "bank"),
    "platform": ("available on", "app store", "platform"),
    "link": ("link to dla", "link", "url"),
    "website": ("website of re", "website"),
    "registration_no": ("registration no", "registration number", "reg no"),
}
SOURCES = {
    "rbi_dla": ("RBI directory of Digital Lending Apps deployed by Regulated Entities",
                "https://data.rbi.org.in/BOE/OpenDocument/opendoc/custom.jsp?sIDType=CUID&iDocID=ARfEgy.WNSVIvFfvSIVmBCw"),
    "sebi_ia_ra": ("SEBI registered Investment Advisers and Research Analysts",
                   "https://www.sebi.gov.in/ (Intermediaries)"),
}


def _rows(path: Path) -> list[dict[str, str]]:
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        from openpyxl import load_workbook

        ws = load_workbook(path, read_only=True, data_only=True).active
        rows = [[("" if c is None else str(c)).strip() for c in r] for r in ws.iter_rows(values_only=True)]
        header_idx = next(i for i, r in enumerate(rows) if sum(1 for c in r if c) >= 3)
        header = [h.lower() for h in rows[header_idx]]
        return [dict(zip(header, r, strict=False)) for r in rows[header_idx + 1:] if any(r)]
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return [{(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(fh)]


def _pick(row: dict[str, str], field: str) -> str | None:
    # Aliases are ordered most specific first: "entity name" must not satisfy the generic "name" alias for the DLA.
    for alias in COLUMNS[field]:
        for key, value in row.items():
            if value and alias in " ".join(key.split()):
                return value
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registry", choices=sorted(SOURCES))
    parser.add_argument("export", type=Path)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    entries: list[dict[str, str | None]] = []
    for row in _rows(args.export):
        name = _pick(row, "name")
        if not name:
            continue
        link = (_pick(row, "link") or "").lstrip("?\u200b ").strip() or None
        entry = {
            "name": name, "owner": _pick(row, "owner"), "regulated_entity": _pick(row, "regulated_entity"),
            "platform": _pick(row, "platform"), "link": link, "package_id": package_from_link(link),
            "website": _pick(row, "website"), "registration_no": _pick(row, "registration_no"),
        }
        # Exports use merged cells: follow-on rows of the same regulated entity leave the entity columns blank.
        if entries and not entry["regulated_entity"]:
            prev = entries[-1]
            for field in ("regulated_entity", "website", "owner"):
                entry[field] = entry[field] or prev[field]
        entries.append(entry)
    title, source = SOURCES[args.registry]
    snapshot = {"registry": args.registry, "title": title, "source_url": source,
                "checked_at": datetime.now(UTC).isoformat(timespec="seconds"), "is_sample": False,
                "note": f"Imported from {args.export.name}", "entries": entries}
    out = args.out or DATA_DIR / f"{args.registry}.json"
    out.write_text(json.dumps(snapshot, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {out}")


if __name__ == "__main__":
    main()
