"""Convert both complete TITAN Lift Log exports to the tracker's v1 feeds."""
import argparse
import csv
from datetime import datetime
from hashlib import sha256
import json
import math
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LOG = ["Date", "Day", "Exercise", "Weight", "Weight Note", "Sets",
       "Reps (per set)", "Hit Top of Range?", "PR?", "Notes"]
TARGET = ["Exercise", "Next Weight", "Target Sets x Reps", "Rule"]


def write_json(path, value):
    content = (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()
    if path.exists() and path.read_bytes() == content:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temp = Path(stream.name)
        stream.write(content)
    try:
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def normalize(name):
    name = name.lower().replace("&", " and ").replace("'", "").replace("â€™", "")
    return " ".join("".join(c for c in name if c.isalnum() or c.isspace() or c == "-")
                    .replace("-", " ").split())


def resolve(name, catalog):
    key = normalize(name)
    aliases = {
        "underhand low to high cable fly": "underhand-cable-fly",
        "barbell deadlift squat rack": "deadlift",
        "barbell incline bench press": "barbell-incline-bench",
        "single arm hammer strength chest supported row": "single-arm-hammer-strength-row",
        "leg curl both legs": "leg-curl",
        "single leg extension": "leg-extension",
        "single leg extension right post acl": "leg-extension",
        "single leg extension left": "leg-extension",
        "iso lateral shoulder press machine": "iso-lateral-shoulder-press",
    }
    if aliases.get(key) in catalog["exercises"]:
        catalog.setdefault("lookup", {})[key] = aliases[key]
    if not key:
        raise ValueError("missing exercise name")
    lookup = catalog.setdefault("lookup", {})
    exercises = catalog["exercises"]
    if key in lookup:
        if lookup[key] not in exercises:
            raise ValueError(f"catalog has a broken alias for {name}")
        return lookup[key]
    for eid, item in exercises.items():
        if any(normalize(s) == key for s in [eid, item.get("name", ""), *item.get("aliases", [])]):
            lookup[key] = eid
            return eid
    eid = key.replace(" ", "-")
    exercises[eid] = {"id": eid, "name": name, "aliases": [name]}
    lookup[key] = eid
    return eid


def weight(value):
    if not value:
        return None
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(?:lbs?\.?)?", value, re.I)
    if not match:
        raise ValueError(f"expected pounds or an empty weight, got {value!r}")
    number = match[1]
    result = float(number) if "." in number else int(number)
    if isinstance(result, float) and not math.isfinite(result):
        raise ValueError("weight exceeds numeric range")
    return result


def parse_date(value):
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"invalid date {value!r}")


def reps(value):
    def counts(part):
        if not re.fullmatch(r"\d+(?:\s*,\s*\d+)*", part.strip()):
            raise ValueError(f"invalid reps {value!r}")
        return list(map(int, part.split(",")))
    sides = re.fullmatch(r"R(?:ight)?\s*:?\s*([\d, ]+)\s*/\s*L(?:eft)?\s*:?\s*([\d, ]+)", value, re.I)
    if sides:
        return {"right": counts(sides[1]), "left": counts(sides[2])}
    return counts(value) if value else []


def flag(value):
    key = value.lower()
    if key in ("yes", "true", "y", "1"):
        return True
    if key in ("no", "false", "n", "0"):
        return False
    if not key:
        return None
    raise ValueError(f"invalid yes/no flag {value!r}")


def log_row(row, catalog):
    d, day, name, load, note, sets, repetitions, top, pr, notes = row
    if sets and not re.fullmatch(r"\d+", sets):
        raise ValueError(f"invalid sets {sets!r}")
    pr = pr.lower()
    if pr == "baseline":
        pr = ""
    if pr == "rep pr":
        pr = "rep"
    if re.fullmatch(r"pr(?: \(\d+\))?", pr):
        pr = "yes"
    if pr in ("no", "n", "false", "0"):
        pr = ""
    if pr in ("yes", "y", "true", "1"):
        pr = "yes"
    if pr not in ("", "yes", "weight", "rep", "weight+rep"):
        raise ValueError("expected a yes/no PR flag or weight, rep, weight+rep")
    top = re.sub(r"\s*\(.*\)$", "", top)
    if top.lower().startswith("bottom of "):
        top = "no"
    recorded = reps(repetitions.replace("(not reported)", "").removesuffix(" (assumed)").removesuffix(" each arm"))
    if "each arm" in repetitions:
        recorded = {"right": recorded, "left": recorded}
    elif name.startswith("Single-leg extension ("):
        right = "(RIGHT" in name
        recorded = {"right": recorded if right else [], "left": [] if right else recorded}
    loads = [weight(part.strip().removesuffix(" per side")) for part in load.split("/")]
    entry = dict(date=parse_date(d), day=day, exerciseId=resolve(name, catalog), exercise=name,
                 weightLb=loads[0], weightNote=note, sets=int(sets) if sets else None,
                 reps=recorded, hitTopOfRange=flag(top), pr=pr or None, notes=notes)
    if "(assumed)" in repetitions:
        entry["notes"] = (notes + " | " if notes else "") + "Reps assumed in source."
    third = re.search(r"set 3 at (\d+)/side", note)
    if third:
        loads = [loads[0], loads[0], int(third[1])]
    if len(loads) > 1:
        if len(loads) == 2 and "last set" in note.lower():
            loads = [loads[0]] * (len(recorded) - 1) + loads[1:]
        if not isinstance(recorded, list) or len(loads) != len(recorded):
            raise ValueError("mixed loads must identify weights for each set")
        entry["setDetails"] = [dict(set=i, weightLb=w, reps=r)
                               for i, (w, r) in enumerate(zip(loads, recorded), 1)]
    digest = sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()[:20]
    return {"id": "sheet-" + digest, **entry}


def target_row(row, catalog):
    name, load, prescription, rule = row
    name = re.sub(r"\s*\(updated [^)]+\)$", "", name, flags=re.I)
    match = re.fullmatch(r"(\d+)\s*[xÃ—]\s*(.+)", prescription, re.I)
    scalar = re.match(r"^(\d+(?:\.\d+)?)(?:\s*lb\b|$)", load, re.I)
    return dict(exerciseId=resolve(name, catalog), name=name, nextWeightLb=weight(scalar[1]) if scalar else None,
                nextWeightText=load,
                targetSets=int(match[1]) if match else None,
                targetReps=match[2].strip() if match else prescription or None, rule=rule)


def read_rows(path, columns, convert, catalog, key):
    records = {}
    revised = set()
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        headers = [s.strip() for s in reader.fieldnames or []]
        headers = ["Reps (per set)" if s == "Reps" else s for s in headers]
        if len(set(headers)) != len(headers) or set(columns) - set(headers):
            raise ValueError(f"{path}: expected columns {', '.join(columns)}")
        reader.fieldnames = headers
        for row in reader:
            try:
                if None in row or any(row[c] is None for c in columns):
                    raise ValueError("wrong column count (quote comma-separated reps)")
                values = [row[c].strip() for c in columns]
                if not any(values):
                    continue
                result = convert(values, catalog)
                identity = result[key]
                update = columns == TARGET and " (updated " in values[0].lower()
                if identity in revised and not update:
                    continue
                if identity in records and records[identity] != result and (not update or identity in revised):
                    raise ValueError(f"conflicting rows for {identity}")
                if update:
                    revised.add(identity)
                records[identity] = result
            except ValueError as error:
                raise ValueError(f"{path}:{reader.line_num}: {error}") from error
    return list(records.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", type=Path, default=ROOT / "imports/Log.csv")
    parser.add_argument("--targets", type=Path, default=ROOT / "imports/Next Targets.csv")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    catalog_path = args.data_dir / "exercises.json"
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        if catalog.get("schemaVersion") != 1:
            raise ValueError("expected a version 1 exercise catalog")
        entries = read_rows(args.log, LOG, log_row, catalog, "id")
        targets = read_rows(args.targets, TARGET, target_row, catalog, "exerciseId")
        write_json(catalog_path, catalog)
        write_json(args.data_dir / "log.json", dict(schemaVersion=1, entries=entries))
        write_json(args.data_dir / "targets.json", dict(schemaVersion=1, targets=targets))
    except (ValueError, OSError, csv.Error, KeyError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Imported {len(entries)} log entries and {len(targets)} targets.")


if __name__ == "__main__":
    main()
