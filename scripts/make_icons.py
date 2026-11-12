"""Generate CampusRadar PWA icons (radar-sweep motif) into frontend/public/icons."""
from PIL import Image, ImageDraw
import math
import os

OUT = "/home/z/my-project/campusradar/frontend/public/icons"

INK = (11, 16, 32, 255)        # #0b1020
CYAN = (34, 211, 238)          # #22d3ee
MINT = (52, 211, 153)          # #34d399


def draw_radar(size: int, safe_margin: float = 0.0) -> Image.Image:
    """size: canvas edge px; safe_margin: extra margin fraction for maskable icons."""
    img = Image.new("RGBA", (size, size), INK)
    d = ImageDraw.Draw(img)
    c = size / 2
    r_outer = size / 2 * (1 - safe_margin)

    # outer disc background (slightly lighter than page ink)
    d.ellipse([c - r_outer, c - r_outer, c + r_outer, c + r_outer], fill=(16, 24, 46, 255))

    # concentric rings
    for i, frac in enumerate((1.0, 0.72, 0.46, 0.22)):
        r = r_outer * frac
        alpha = 110 - i * 18
        w = max(2, size // 128)
        d.ellipse([c - r, c - r, c + r, c + r], outline=(*CYAN, alpha), width=w)

    # sweep wedge fading tail
    for k in range(26):
        a0 = -90 - k * 1.3
        a1 = a0 - 1.35
        alpha = int(150 * (1 - k / 26))
        d.pieslice([c - r_outer * 0.95, c - r_outer * 0.95, c + r_outer * 0.95, c + r_outer * 0.95],
                   a1, a0, fill=(*CYAN, alpha))

    # crosshair ticks
    tick = r_outer * 0.10
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        x0 = c + dx * (r_outer * 0.90)
        y0 = c + dy * (r_outer * 0.90)
        if dx:
            d.line([x0 - dx * tick / 2, y0, x0 + dx * tick / 2, y0], fill=(*CYAN, 170),
                   width=max(2, size // 170))
        else:
            d.line([x0, y0 - dy * tick / 2, x0, y0 + dy * tick / 2], fill=(*CYAN, 170),
                   width=max(2, size // 170))

    # centre dot + halo
    r_dot = size * 0.055
    d.ellipse([c - r_dot, c - r_dot, c + r_dot, c + r_dot], fill=(*CYAN, 255))
    r_halo = size * 0.085
    d.ellipse([c - r_halo, c - r_halo, c + r_halo, c + r_halo], outline=(*CYAN, 120),
              width=max(2, size // 140))

    # helper blip on the 2nd ring
    ang = math.radians(-35)
    br = r_outer * 0.46
    bx, by = c + br * math.cos(ang), c + br * math.sin(ang)
    r_blip = size * 0.042
    d.ellipse([bx - r_blip, by - r_blip, bx + r_blip, by + r_blip], fill=(*MINT, 255))

    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    base = draw_radar(1024)
    base.resize((512, 512), Image.LANCZOS).save(f"{OUT}/icon-512.png")
    base.resize((192, 192), Image.LANCZOS).save(f"{OUT}/icon-192.png")
    base.resize((180, 180), Image.LANCZOS).save(f"{OUT}/apple-touch-icon.png")
    base.resize((32, 32), Image.LANCZOS).save(f"{OUT}/favicon-32.png")
    maskable = draw_radar(1024, safe_margin=0.14)
    maskable.resize((512, 512), Image.LANCZOS).save(f"{OUT}/icon-maskable-512.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
