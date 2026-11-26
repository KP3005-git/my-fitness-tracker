"""Refresh curated two-frame demos from a pinned Free Exercise DB release (Pillow)."""
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
REV = "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5"
BASE = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/{REV}"
MOVES = {
    "hammer-strength-incline-press": "Leverage_Incline_Chest_Press",
    "underhand-cable-fly": "Low_Cable_Crossover",
    "leg-extension": "Single-Leg_Leg_Extension",
    "seated-barbell-shoulder-press": "Seated_Barbell_Military_Press",
    "iso-lateral-shoulder-press": "Leverage_Shoulder_Press",
    "machine-curl": "Machine_Preacher_Curls",
    "dumbbell-front-raise": "Front_Dumbbell_Raise",
    "rear-delt-fly": "Seated_Bent-Over_Rear_Delt_Raise",
    "dumbbell-shrug": "Dumbbell_Shrug",
    "seated-dumbbell-lateral-raise": "Seated_Side_Lateral_Raise",
    "chest-supported-dumbbell-row": "Dumbbell_Incline_Row",
}

if __name__ == "__main__":
    folder = ROOT / "demos/library"
    folder.mkdir(exist_ok=True)
    for exercise, source in MOVES.items():
        frames = []
        for index in range(2):
            with urlopen(f"{BASE}/exercises/{source}/{index}.jpg", timeout=25) as response:
                frame = Image.open(BytesIO(response.read())).convert("RGB")
                frames.append(ImageOps.pad(frame, (360, 260), color="white"))
        frames[0].save(folder / f"{exercise}.gif", save_all=True, append_images=frames[1:],
                       duration=850, loop=0, optimize=True)
    with urlopen(f"{BASE}/LICENSE.md", timeout=25) as response:
        (ROOT / "demos/licenses/Unlicense.txt").write_bytes(response.read())
