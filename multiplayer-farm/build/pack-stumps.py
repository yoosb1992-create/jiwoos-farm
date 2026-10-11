"""Pack the generated 8-by-3 stump atlas without painting or color keying.
Usage: python build/pack-stumps.py /path/to/transparent-atlas.png
Requires Pillow, numpy, scipy for isolated alpha-component extraction.
"""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects, binary_dilation

source = Path(sys.argv[1])
image = Image.open(source).convert("RGBA")
rgba = np.array(image)
labels, _ = label(rgba[:, :, 3] > 48)
sizes = np.bincount(labels.ravel())
boxes = find_objects(labels)
parts = []
for i, size in enumerate(sizes):
    if i and size > 1000:
        y, x = boxes[i - 1]
        parts.append((i, (x.start + x.stop) / 2, (y.start + y.stop) / 2))
assert len(parts) == 24, f"Expected 24 isolated silhouettes, got {len(parts)}"
species = ["cherry", "pine", "maple", "willow", "birch", "oak", "bamboo", "metasequoia"]
stages = ["mature", "giant", "guardian"]
dimensions = [(80, 64), (108, 84), (136, 104)]  # 2x displayed size
root = Path(__file__).resolve().parents[2] / "public/assets/nature/stumps"
root.mkdir(parents=True, exist_ok=True)
assets = []
for col in range(3):
    column = sorted([p for p in parts if int(p[1] * 3 / image.width) == col], key=lambda p: p[2])
    assert len(column) == 8
    for row, (part, _, _) in enumerate(column):
        # Retain the generated edge alpha; exclude neighboring sprites that may
        # overlap the bounding box without changing any sprite's RGB values.
        mask = binary_dilation(labels == part, iterations=4)
        pixels = rgba.copy()
        pixels[:, :, 3] = np.where(mask, pixels[:, :, 3], 0)
        sprite = Image.fromarray(pixels)
        sprite = sprite.crop(sprite.getchannel("A").getbbox())
        width, height = dimensions[col]
        sprite.thumbnail((width - 4, round(height * .90)), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (width, height))
        out.alpha_composite(sprite, ((width - sprite.width) // 2, round(height * .92) - sprite.height))
        name = f"tree_{species[row]}_stump_{stages[col]}.webp"
        path = root / name
        out.save(path, "WEBP", lossless=True, method=6)
        assets.append({"file": name, "width": width, "height": height,
                       "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(root / "manifest.json").write_text(json.dumps({
    "source": "Original imagegen stump atlas, generated for Jiwoo's Farm; no external game assets",
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "style": "Existing warm painted 3/4 farm trees; upper-left light; true transparent alpha",
    "prompt": "Eight rows: cherry lenticels, rough pine, red maple, fibrous willow, white scarred birch, rugged oak, hollow bamboo clusters, red ribbed metasequoia. Three columns: compact mature, broad rooted giant, gnarled guardian. Distinct silhouettes, bark, endgrain and roots. No scenery, labels or grid.",
    "origin": {"x": .5, "y": .92}, "assets": assets,
}, ensure_ascii=False, indent=2) + "\n")
print(f"Packed {len(assets)} distinct alpha sprites into {root}")
