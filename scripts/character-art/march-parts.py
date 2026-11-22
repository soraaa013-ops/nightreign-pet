"""Register the cast hands and the revealed porcelain face on the neutral puppet."""
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2] / "art/revenant"
layout = json.loads((ROOT / "layout.json").read_text())
layout["layers"] = [layer for layer in layout["layers"] if not layer["id"].startswith("March")]
parts = {layer["id"]: layer for layer in layout["layers"]}


def save(name, image, x, y, z):
    box = image.getchannel("A").point(lambda a: 255 if a > 3 else 0).getbbox()
    image = image.crop(box)
    file = f"parts/{name}.png"
    image.save(ROOT / file)
    layout["layers"].append(dict(id=name, file=file, x=x + box[0], y=y + box[1],
                                 width=image.width, height=image.height, z=z))


# Arm and relaxed fingers share a short overlap inside the cuff at the wrist.
for side, role, wrist, theta in [
    ("L", "PluckArm", (531, 392), -51),
    ("R", "HoldArm", (654, 481), 12),
]:
    layer = parts[role]
    original = Image.open(ROOT / layer["file"]).convert("RGBA")
    angle = math.radians(theta)
    dx, dy = math.cos(angle), math.sin(angle)
    for piece, z in [("Sleeve", 13), ("Fingers", 15)]:
        mask = Image.new("L", original.size)
        for y in range(original.height):
            for x in range(original.width):
                along = (x + layer["x"] - wrist[0]) * dx + (y + layer["y"] - wrist[1]) * dy
                value = (2.5 - along) / 2 if piece == "Sleeve" else (along + 2.5) / 2
                mask.putpixel((x, y), round(max(0, min(1, value)) * 255))
        out = original.copy()
        out.putalpha(ImageChops.multiply(original.getchannel("A"), mask))
        save(f"March{piece}{side}", out, layer["x"], layer["y"], z + int(side == "R"))

# The outstretched palms retain their wrist registration as the elbow turns.
hands = Image.open(ROOT / "painted-march-hands.png").convert("RGBA")
for side, crop, pin, wrist, length, z in [
    ("L", (82, 59, 707, 655), (690, 361), (531, 392), 95, 17),
    ("R", (1463, 60, 2090, 658), (1480, 361), (654, 481), 82, 18),
]:
    cut = hands.crop(crop)
    alpha = cut.getchannel("A").point(lambda a: 0 if a < 24 else a)
    cut.putalpha(alpha)
    scale = length / cut.width
    cut = cut.resize((length, round(cut.height * scale)), Image.Resampling.LANCZOS)
    pin_x, pin_y = (pin[0] - crop[0]) * scale, (pin[1] - crop[1]) * scale
    # Register every drawable at the actual neutral wrist angle. Cubism's additive
    # keyforms use the neutral shaped mesh as their reference.
    angle = math.radians((-38 - 180) if side == "L" else -12)
    c, sn = math.cos(angle), math.sin(angle)
    centre = 118
    cut = cut.transform((2 * centre, 2 * centre), Image.Transform.AFFINE,
                        (c, sn, pin_x - centre * (c + sn),
                         -sn, c, pin_y - centre * (c - sn)), Image.Resampling.BICUBIC)
    save("MarchPalm" + side, cut, wrist[0] - centre, wrist[1] - centre, z)


face = Image.open(ROOT / "painted-march-cry.png").convert("RGBA")
# Keep the original forehead, lashes of the intact eye and chin. The eye socket
# and mouth have individual registrations and small feathered boundaries.
for name, polygon, crop, place, z in [
    ("MarchSkull", [(614,167),(620,157),(636,153),(659,156),(680,162),
                    (690,176),(686,193),(679,207),(662,220),(645,237),(624,251),
                    (611,255),(616,243),(621,231),(615,233),(611,229),(611,209),
                    (607,196),(608,181)], (601,146,699,261), (510,168,76,91), 11),
    ("MarchMouth", [(565,227),(568,212),(573,201),(582,198),(598,198),
                    (608,205),(615,224),(614,240),(608,246),(569,246)],
     (559,193,622,252), (474,215,50,46), 12),
]:
    mask = Image.new("L",face.size)
    ImageDraw.Draw(mask).polygon(polygon,fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2.7))
    cut = face.crop(crop)
    cut.putalpha(ImageChops.multiply(cut.getchannel("A"),mask.crop(crop)))
    x,y,w,h = place
    save(name,cut.resize((w,h),Image.Resampling.LANCZOS),x,y,z)

(ROOT / "layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n")
