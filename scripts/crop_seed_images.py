"""Crop per-plant images out of the original garden photos in seed/photos.

Produces seed/images/<slug>-front.webp, <slug>-back.webp and cell-<label>.webp,
which the app's first-run seed attaches to each species and planting.

Usage: python3 scripts/crop_seed_images.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "seed" / "photos"
OUT = ROOT / "seed" / "images"

# (left, top, right, bottom) boxes in the 1256x1674 originals.
PACKET_FRONTS = {
    "rosemary": (40, 165, 290, 425),
    "oregano": (325, 105, 580, 415),
    "thyme": (20, 420, 275, 705),
    "cilantro": (305, 428, 580, 710),
    "dill": (0, 710, 255, 990),
    "parsley": (310, 755, 580, 1055),
    "basil": (0, 1050, 265, 1435),
    "sage": (300, 1115, 585, 1435),
    "lavender": (628, 355, 890, 605),
    "cauliflower": (925, 115, 1170, 415),
    "broccoli": (940, 420, 1185, 765),
    "bunching-onion": (935, 775, 1205, 1130),
    "lettuce": (950, 1135, 1210, 1530),
}

PACKET_BACKS = {
    "rosemary": (85, 280, 300, 495),
    "oregano": (345, 165, 585, 470),
    "thyme": (85, 505, 320, 780),
    "cilantro": (345, 485, 585, 790),
    "dill": (85, 795, 335, 1075),
    "parsley": (345, 795, 590, 1075),
    "basil": (95, 1095, 340, 1450),
    "sage": (375, 1115, 610, 1440),
    "lavender": (665, 790, 885, 1090),
    "cauliflower": (890, 95, 1120, 440),
    "broccoli": (900, 435, 1135, 780),
    "bunching-onion": (935, 780, 1185, 1130),
    "lettuce": (960, 1130, 1205, 1515),
}

# Seed tray: columns 1-4 left to right, rows A-D top to bottom (as printed on the tray).
TRAY_ROWS = {"A": (105, 275), "B": (290, 475), "C": (505, 700), "D": (720, 920)}
TRAY_COLS = {1: (130, 345), 2: (375, 565), 3: (592, 785), 4: (800, 1000)}


def save(img: Image.Image, name: str, max_side: int = 900) -> None:
    img = img.convert("RGB")
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    img.save(OUT / f"{name}.webp", "WEBP", quality=86)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fronts = Image.open(PHOTOS / "packets-front.webp")
    backs = Image.open(PHOTOS / "packets-back.webp")
    trays = Image.open(PHOTOS / "trays-2026-10-14.webp")

    for slug, box in PACKET_FRONTS.items():
        save(fronts.crop(box), f"{slug}-front")
    for slug, box in PACKET_BACKS.items():
        # Packet backs are small print; upscale so they stay legible.
        crop = backs.crop(box)
        crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
        save(crop, f"{slug}-back", max_side=1400)

    for row, (y0, y1) in TRAY_ROWS.items():
        for col, (x0, x1) in TRAY_COLS.items():
            save(trays.crop((x0, y0, x1, y1)), f"cell-{col}{row}", max_side=600)
    # Lavender and mint each span two cells in row C.
    save(trays.crop((TRAY_COLS[1][0], TRAY_ROWS["C"][0], TRAY_COLS[2][1], TRAY_ROWS["C"][1])), "cell-1-2C")
    save(trays.crop((TRAY_COLS[3][0], TRAY_ROWS["C"][0], TRAY_COLS[4][1], TRAY_ROWS["C"][1])), "cell-3-4C")
    save(trays.crop((100, 60, 1030, 950)), "tray-seed-tray", max_side=1200)
    save(trays.crop((100, 968, 1200, 1520)), "tray-egg-carton", max_side=1200)


if __name__ == "__main__":
    main()
