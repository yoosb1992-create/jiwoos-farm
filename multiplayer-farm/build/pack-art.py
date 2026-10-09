"""Optional art-authoring helper (Pillow): trim transparent padding, size and WebP-pack.
Usage: python build/pack-art.py source-manifest.json
The manifest is [{"id": "house", "path": "/path/to/generated.png"}, ...].
No color keying, alpha removal, painting or world geometry changes.
"""
import json
import hashlib
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2] / "public/assets/art-foundation"
sources = {p["id"]: Path(p["path"]) for p in json.load(open(sys.argv[1]))}
frames = {
    "house": (448, 384), "stone-well": (224, 208), "broadleaf": (256, 320),
    "pine": (256, 320), "flowering-bush": (192, 128), "grass-tuft": (96, 72),
    "reed": (96, 128), "water-lily": (96, 128), "bridge": (256, 320),
    "storage-chest": (128, 96), "crafting-table": (128, 96), "small-rock": (96, 72),
    "cow": (140, 128), "sheep": (140, 128), "chicken": (64, 64), "mushroom": (96, 128),
    "decor-board": (148, 172),
}
def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    image.save(temporary, format="WEBP", quality=90, method=6)
    temporary.replace(path)
    Image.open(path).verify()

def trim(image):
    return image.crop(image.getchannel("A").getbbox())

for key, path in sources.items():
    image = Image.open(path).convert("RGBA")
    if key in frames:
        width, height = frames[key]
        image = trim(image)
        low = key in ["cow", "sheep", "chicken", "water-lily"]
        image.thumbnail((round(width * .96), round(height * (.78 if low else .94))), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (width, height))
        out.alpha_composite(image, ((width - image.width) // 2, round(height * (.88 if low else .96)) - image.height))
        save(out, root / "sprites" / f"{key}.webp")
    elif key in ["grass", "dirt", "stone", "gravel", "soil", "water"]:
        save(image.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS), root / "terrain" / f"{key}.webp")
    elif key.startswith("crop-"):
        family = key.removeprefix("crop-")
        cell_width = image.width / 4
        # Generated strips are visually spaced, not exact machine grids. Split in
        # transparent gutters so an adjacent leaf never leaks into a small sprout.
        columns = image.getchannel("A").point(lambda a: 255 if a > 48 else 0).getprojection()[0]
        cuts = [0]
        for i in range(1, 4):
            candidates = [x for x in range(round((i - .35) * cell_width), round((i + .35) * cell_width)) if not columns[x]]
            if not candidates:
                raise ValueError(f"{key}: no transparent gutter before frame {i}")
            cuts.append(min(candidates, key=lambda x: abs(x - i * cell_width)))
        cuts.append(image.width)
        cells = [trim(image.crop((cuts[i], 0, cuts[i + 1], image.height))) for i in range(4)]
        scale = min(74 / max(c.width for c in cells), 78 / max(c.height for c in cells))
        for stage, cell in zip(["seed", "sprout", "growing", "mature"], cells):
            cell = cell.resize((max(1, round(cell.width * scale)), max(1, round(cell.height * scale))), Image.Resampling.LANCZOS)
            out = Image.new("RGBA", (80, 104))
            out.alpha_composite(cell, ((80 - cell.width) // 2, 86 - cell.height))
            save(out, root / "crops" / f"{family}-{stage}.webp")
    elif key.startswith("mature-"):
        image = trim(image)
        image.thumbnail((74, 78), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (80, 104))
        out.alpha_composite(image, ((80 - image.width) // 2, 86 - image.height))
        save(out, root / "crops" / f"{key.removeprefix('mature-')}-mature.webp")

paths = list(root.rglob("*.webp"))
assets = []
for path in sorted(paths):
    with Image.open(path) as image:
        image.load()
        assets.append({"path": str(path.relative_to(root)), "width": image.width,
                       "height": image.height, "bytes": path.stat().st_size,
                       "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(root / "manifest.json").write_text(json.dumps({"version": 1,
    "style": "Warm painted farm RPG, upper-left sunlight", "assets": assets}, indent=2) + "\n")
print(f"Packed {len(paths)} assets, {sum(p.stat().st_size for p in paths):,} bytes")
