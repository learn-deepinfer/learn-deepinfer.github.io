"""Prepare the generated mark for web and organization use (requires Pillow)."""

from pathlib import Path
from shutil import copyfile

from PIL import Image, ImageChops

PROJECT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).parent / "2026-10-20/logo-original.png"
BRAND = PROJECT / "web/public/brand"
GREEN = (25, 101, 78)
PAPER = (245, 244, 239)

original = Image.open(SOURCE).convert("RGB")
red, green, _ = original.split()
# Isolate the dark green silhouette; reject the faint tint in the AI background.
saturation = ImageChops.subtract(green, red).point(lambda p: 255 if p > 20 else 0)
dark = red.point(lambda p: 255 if p < 160 else 0)
mask = ImageChops.multiply(saturation, dark)
bounds = mask.getbbox()
if not bounds:
    raise ValueError("The source contains no green mark")
mask = mask.crop(bounds)


def icon(extent: int, background: tuple[int, ...] = (0, 0, 0, 0)) -> Image.Image:
    resized = mask.copy()
    resized.thumbnail((extent, extent), Image.Resampling.LANCZOS)
    mark = Image.new("RGBA", resized.size, GREEN + (255,))
    mark.putalpha(resized)
    canvas = Image.new("RGBA", (1024, 1024), background)
    canvas.alpha_composite(mark, ((1024 - mark.width) // 2, (1024 - mark.height) // 2))
    return canvas


logo = icon(860)
logo.save(BRAND / "logo.png", optimize=True)
for size in (32, 192, 512):
    logo.resize((size, size), Image.Resampling.LANCZOS).save(BRAND / f"logo-{size}.png")
logo.resize((180, 180), Image.Resampling.LANCZOS).save(BRAND / "apple-touch-icon.png")
logo.save(BRAND / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
copyfile(BRAND / "favicon.ico", PROJECT / "web/public/favicon.ico")
icon(690, PAPER + (255,)).convert("RGB").save(BRAND / "org-avatar.png", optimize=True)

# These compatibility assets remain available at their original public URLs.
legacy = PROJECT / "web/public/assets"
for name in ("logo.png", "logo-32.png", "logo-192.png", "logo-512.png", "org-avatar.png", "apple-touch-icon.png"):
    if (legacy / name).exists():
        copyfile(BRAND / name, legacy / name)
print(f"Prepared logo variants from {SOURCE.name}; source bounds={bounds}")
