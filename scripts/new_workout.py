"""Validate a TITAN JSON or Markdown workout and install it by date."""
import argparse
import json
from pathlib import Path
import re
import subprocess

from import_sheet import ROOT, parse_date, resolve, weight, write_json


def parse_markdown(text, catalog):
    """A dated heading, optional title, and a four-column exercise table."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    header = re.fullmatch(r"# (\d{4}-\d{2}-\d{2})(?:\s+(.+))?", lines[0] if lines else "")
    if not header:
        raise ValueError("expected '# YYYY-MM-DD Workout title'")
    workout = dict(schemaVersion=1, date=parse_date(header[1]), blocks=[])
    if header[2]:
        workout["title"] = header[2]

    def cells(line):
        return [s.strip() for s in line.strip("|").split("|")]

    if (len(lines) < 4 or [s.lower() for s in cells(lines[1])] !=
            ["exercise", "weight", "sets", "reps"] or
            not all(re.fullmatch(r":?-{3,}:?", s) for s in cells(lines[2])) or
            len(cells(lines[2])) != 4):
        raise ValueError("expected an Exercise | Weight | Sets | Reps table")
    occurrences = {}
    for index, line in enumerate(lines[3:], 4):
        values = cells(line)
        if len(values) != 4:
            raise ValueError(f"line {index}: expected four columns")
        name, load, sets, reps = values
        span = re.fullmatch(r"(\d+)(?:\s*[-–]\s*(\d+))?", reps)
        if not name or not sets.isdecimal() or not span:
            raise ValueError(f"line {index}: expected exercise name, sets and reps or rep range")
        low, high = int(span[1]), int(span[2] or span[1])
        if low > high:
            raise ValueError(f"line {index}: reversed rep range")
        exercise_id = resolve(name, catalog)
        occurrences[exercise_id] = occurrences.get(exercise_id, 0) + 1
        block_id = f"{exercise_id}:{occurrences[exercise_id]}"
        workout["blocks"].append(dict(type="exercise", id=block_id, exerciseId=exercise_id,
                                      name=name, weightLb=weight(load),
                                      sets=int(sets), repMin=low, repMax=high))
    return workout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    try:
        source = args.source.read_text(encoding="utf-8-sig")
        if args.source.suffix.lower() in {".md", ".markdown"}:
            catalog = json.loads((args.data_dir / "exercises.json").read_text(encoding="utf-8"))
            workout = parse_markdown(source, catalog)
        else:
            workout = json.loads(source)
        if not isinstance(workout, dict):
            raise ValueError("expected a workout object")
        workout.setdefault("schemaVersion", 1)
        date = workout.get("date")
        if not isinstance(date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            raise ValueError("expected a YYYY-MM-DD workout date")
        destination = f"workouts/{date}.json"
        subprocess.run(["node", str(ROOT / "scripts/validate-data.mjs"), "--stdin", destination],
                       input=json.dumps(workout, allow_nan=False), text=True, check=True)
        write_json(args.data_dir / destination, workout)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{args.source}: {error}\n")
    print(f"Wrote {args.data_dir / destination}")


if __name__ == "__main__":
    main()
