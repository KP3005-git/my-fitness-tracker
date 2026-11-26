# Updating My Fitness Tracker

## Live Google Sheet

Edit the existing **Workouts**, **Log** and **Next Targets** tabs in TITAN Lift Log - Kaelen. Keep the tabs in place so their numeric tab IDs stay stable. The app reads each tab independently on open, workout date change, reconnect, and return to the app. Reload to fetch edits immediately. A valid sheet workout takes precedence over the dated repository workout and weekly template. A successful empty log or targets tab clears that feed. A missing date falls back to repository programming. On a failed or malformed response, the tracker uses that tab’s last valid offline copy, then the bundled JSON. The sync note identifies the source.

For anonymous access, open the workbook, choose **Share → General access → Anyone with the link → Viewer → Done**. This grants read access to the whole workbook. Keep the spreadsheet editable only by its owners and TITAN.

**Workouts header row** (one exercise per row):

```text
Date | Title | Order | Block ID | Block Type | Rounds | Exercise | Exercise ID | Item ID | Sets | Rep Min | Rep Max | Weight lb | Weight Note | Rest Sec | RIR | Laterality | Cues | Swap | Warm-up | Warm-up Min | Abs | Coach Note | Split | Minutes | Progression Rule | Last Session | Goal | Demo
```

Add the optional **Demo** header immediately after Goal. Set it to a mapped exercise ID, a local image path such as `demos/library/leg-extension.gif`, or a full HTTPS image/GIF URL. Leave it blank for automatic matching. The [per-exercise credits](../demos/CREDITS.md) list the bundled assets.

Use ISO dates and a unique numeric Order per date. For each standalone lift use a unique Block ID and Block Type `exercise`. For a superset or circuit, repeat the Block ID, Block Type, Rounds and Rest Sec across its rows, and give each item a distinct Item ID. Leave unknown loads blank. Exercise ID refers to the catalog. Put shared day fields (Title, Split, Minutes, Warm-up, Warm-up Min, Coach Note, Progression Rule and Abs) on the first row. Abs accepts a v1 JSON object with rounds and items. The [complete example rows](workouts-example.csv) include a straight set, a two-exercise superset, and an abs block.

Keep the Log and Next Targets headers from the original CSV exports. The manual workflow below also maintains the bundled fallback.

TITAN maintains dated workouts, accepted lift history, and next targets. Open a GitHub issue titled `[TITAN] ...` for code changes. Pull before editing or pushing. Data committed here is public.

## Daily workout contract (v1)

Write `data/workouts/YYYY-MM-DD.json`. The three required fields are numeric `schemaVersion: 1`, a valid calendar `date` identical to the filename, and an ordered `blocks` array. An empty array is valid. A dated workout takes priority over today's weekly template. The sample has its own date.

| Object | Fields and types |
| --- | --- |
| Workout | Optional text fields: `id`, `title`, `split`, `coachNote`, `progressionRule`. Optional nonnegative number: `estimatedMinutes`. Optional objects: `warmup`, `abs`. |
| Warm-up | `instructions` (text), `durationMin` (nonnegative number). |
| Exercise | Supply at least one nonempty string among `id`, `exerciseId`, and `name`. Use a stable block ID and the catalog exercise ID for consistent logging. Set `type` to `exercise` for a standalone lift. `weightLb` is a nonnegative number or null. `sets`, `repMin`, `repMax`, `restSec` are nonnegative integers. `rir` is a nonnegative number or text range. `laterality` is `unilateral` for separate right/left inputs or `bilateral` for one rep count. `weightNote`, `cues`, `sideNote`, `swap`, `lastSession`, `goal`, and `demo` are optional text. |
| Group | `type` is `superset` or `circuit`. Supply an `items` array of exercises. Assign a stable `id`. Optional `rounds` and `restSec` are nonnegative integers inherited by items without their own values. |
| Abs | Optional nonnegative integer `rounds` and `restSec`; `items` is an array of objects with text `exerciseId` and/or `name` and a `reps` count or text prescription. |

Optional prescription fields can be omitted or null. Keep unknown loads null. The app and push check use the same [workout validator](../src/model.js).

### Example for `data/workouts/2030-04-02.json`

```json
{
  "schemaVersion": 1,
  "date": "2030-04-02",
  "id": "pull-a",
  "title": "Pull and accessories",
  "split": "back",
  "warmup": {"durationMin": 5, "instructions": "Easy row"},
  "blocks": [
    {"type": "exercise", "id": "pull", "exerciseId": "deadlift", "name": "Barbell deadlift",
     "sets": 3, "repMin": 6, "repMax": 8, "weightLb": 95, "restSec": 120,
     "rir": "1–2", "laterality": "bilateral", "cues": "Reset between reps", "swap": "Smith machine RDL"},
    {"type": "superset", "id": "pair", "rounds": 3, "restSec": 75, "items": [
      {"id": "row", "exerciseId": "single-arm-hammer-strength-row", "name": "Single-arm row",
       "weightLb": null, "laterality": "unilateral", "repMin": 8, "repMax": 10, "sideNote": "Log each side"},
      {"id": "face-pull", "exerciseId": "face-pull", "name": "Face pull", "repMin": 10, "repMax": 12}
    ]}
  ],
  "abs": {"rounds": 2, "restSec": 45, "items": [{"exerciseId": "cable-crunch", "name": "Cable crunch", "reps": 12}]}
}
```

## History and targets

For a Sheet refresh, save the complete CSV exports to `imports/Log.csv` and `imports/Next Targets.csv`, then run `python scripts/import_sheet.py`. This replaces both feeds, resolves aliases in `data/exercises.json`, and applies labeled target revisions. Keep the Sheet current when making direct JSON edits so the next import retains them.

For an accepted set, append a row to `entries` in `data/log.json`, for example `{"date":"2030-04-02","exerciseId":"deadlift","weightLb":95,"sets":1,"reps":[8]}`. Group multiple sets of the same lift into its reps array. Use `{"right":[8],"left":[7]}` for per-side reps. For varying loads add `setDetails`, e.g. `[{"set":1,"weightLb":95,"reps":8},{"set":2,"weightLb":100,"reps":6}]`, alongside `"reps":[8,6]`.

For a target update, replace the row for that exercise in `targets` in `data/targets.json`, for example `{"exerciseId":"deadlift","name":"Barbell deadlift","nextWeightLb":100,"targetSets":3,"targetReps":"6-8","rule":"Reach 3x8 before increasing"}`. Set `nextWeightText` for ranges, per-side loads, or other display details and update it whenever the load changes. Both feed roots require numeric `schemaVersion: 1`.

Run `node scripts/validate-data.mjs` before committing. Push to main to deploy through Pages. Actions validates every push and pull request and blocks deployment if validation fails.
