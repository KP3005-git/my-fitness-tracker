# My Fitness Tracker

A mobile workout log for TITAN’s programming. Open Today at the rack, enter reps, and tap Rest. Each input saves on the device. History combines TITAN’s accepted records with your local sets. Next Targets shows TITAN’s current prescription and your latest logged performance.

## Run locally

Install Node.js 22 or newer with npm. From this folder run:

```sh
npm ci
npm test
npm run build
npm start
```

Open [the local tracker](http://127.0.0.1:4173/my-fitness-tracker/). The server also serves the site at its root. The app has zero npm dependencies. The deployable site is the contents of `dist/`. Run the build again after editing source, JSON, or demos.

## Publish and install

1. On GitHub, create an **empty public repository** named `my-fitness-tracker`.
2. The starter includes two animated equipment placeholders. To install TITAN’s demo library, copy `illustrations/`, `video/`, `ATTRIBUTION.md`, and `licenses/` from `/workspace/exercise-demos/` into `demos/`. Keep the two starter license texts and `placeholders/`. Use the openly licensed GIFs as regular Git files. Keep personal clips outside the repository.
3. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**. Push this project to `main`. If you already pushed, run **Actions → Deploy to GitHub Pages → Run workflow** after enabling Pages.
4. After the workflow succeeds, open `https://<YOUR_GITHUB_USERNAME>.github.io/my-fitness-tracker/` in iPhone Safari. Tap **Share → Add to Home Screen** and enable **Open as Web App** if offered.
5. Launch from the home screen while online. Open a programmed date and wait for **Offline ready**. Turn on airplane mode, log a set, close and reopen the app, then verify the reps and use **Share to TITAN → Copy text** or **JSON**. The rest timer uses elapsed time. Keep the screen awake for its alert.

The prepared project folder has a local `main` branch. For a freshly extracted source ZIP, first run `git init -b main`, `git add .`, and `git commit -m "Add My Fitness Tracker"`. After copying additional demos, commit those files too. Replace the username placeholder in these commands:

```sh
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/my-fitness-tracker.git
git push -u origin main
```

## How TITAN updates the app

See [TITAN's daily workout contract and import guide](docs/TITAN.md) for the full workout example, CSV import command, and history and target formats.

All committed data files have numeric `schemaVersion: 1`. The files in `data/` include a sample workout, recurring weekly templates, and empty history and target lists. Dates use `YYYY-MM-DD` in America/Indianapolis. Loads are pounds. Use `null` for unknown values.

| File | Contents |
| --- | --- |
| `data/workouts/YYYY-MM-DD.json` | Date, split, warm-up, coach note, ordered exercise/superset/circuit blocks and optional abs. Group items inherit rounds and rest. Keep block and exercise IDs stable across edits. |
| `data/weekly/{mon,tue,wed,thu,fri,sat,sun}.json` | Schema-v1 templates for Today. The reference dates are January 3–9, 2000, in weekday order. The app uses the current Indianapolis date for logging. |
| `data/exercises.json` | Stable IDs, aliases, normalized name lookup, laterality, demo paths and credits. Paths are relative, e.g. `demos/illustrations/deadlift.gif`. |
| `data/log.json` | Accepted history with reps as an integer array or separate right/left arrays. |
| `data/targets.json` | Target weights, set and rep goals, and TITAN’s progression rules. |
| `data/meta.json` | Optional latest workout date and message. |

To publish a daily workout, copy [the sample](data/workouts/2000-01-01.json), set its `date` to the filename’s date, and fill in `title`, `split` and `blocks`. An exercise block uses `type: "exercise"` with `id`, `exerciseId` and `name`. Add `sets`, `repMin`, `repMax`, `weightLb`, `restSec` and `rir` only when known. Use `laterality: "unilateral"` and `sideNote` for side-specific instructions, and `weightNote` for a load range. An empty `abs.items` array supports an abs check-in with no fixed exercises. If you use `latestWorkoutDate` in `data/meta.json`, point it at an actual dated workout.

Commit the JSON and push to `main`. The build indexes dated workout files and available demos. A valid dated workout, including a cached copy, takes priority over the weekday template. The sample remains selectable by date. Weekly templates repeat without an end date and are included in the offline app.

## Logging and handoff

- Reps start empty. Enter each side separately for unilateral work. The programmed load can be edited per set. The top-of-range flag requires all prescribed sets and both sides when applicable. You can override it under **Session notes**.
- Workout export contains the selected date’s device entries. History export includes accepted and unsynced rows for the chosen date. Identical date, exercise ID, loads and reps reconcile into one synced record. TITAN’s committed history stays read-only.
- Copy or share the text summary, download/share JSON, or download a sheet-compatible CSV. With varying loads, compact text and CSV list loads in set order. JSON preserves exact set numbers, per-set weights, partial unilateral sets, and side notes in `setDetails`.
- Weight charts use the heaviest recorded set per session. Volume sums load × reps across logged sets and both sides. An unknown working load leaves a gap. Only TITAN changes the programmed next targets.
- Bodyweight, soreness, notes and in-progress logs live on this device. Share an export to hand entries back to TITAN. Keep important exports before clearing website data or changing phones.

**Possible later: device-side GitHub sync.** Browser-held tokens can be exposed to scripts or someone with device access. Any future token must be fine-grained, restricted to this repo, and never committed. v1 uses manual exports.

<details>
<summary>Artwork sources and image prompt</summary>

The [overhead-lifter logo](assets/lifter-mark.svg) supplies the header mark and all three install icons. The [workout header](assets/hero-training.webp) was generated with the built-in ImageGen tool using this prompt.

> Use case: photorealistic-natural. Generate one ultrawide panoramic editorial sports photograph for the header of a dark charcoal personal training app. Right-weighted composition: a strong adult male weightlifter in a worn sleeveless slate shirt captured from behind in three-quarter view, both hands gripping the knurled barbell held against his upper back, elbows pointing down, about to squat in a gritty early-morning gym. Warm copper sunlight on his shoulder and forearm, cool steel reflections on the bar and worn black bumper plates. Candid, focused, tactile, muscular but realistic. Medium close-up, arms and back the focal point, athlete and the near plate occupy the rightmost 48 percent. The left 52 percent is intentionally quiet charcoal gym shadow with subtle depth for white UI text to be added separately. Atmospheric shafts of warm light angled across the distant gym, controlled film grain, rich blacks, elegant magazine photography. Natural human anatomy, exactly two arms, no legible words, logos, digits or graphic overlays. Frame for a responsive panoramic crop of about 3:1. Make the human subject, skin highlights and steel bar clear in the middle horizontal band; avoid large bright objects at the left.

</details>
