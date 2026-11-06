"""Bake game UI art from assets/art into assets/game (run: python3 scripts/art/bake.py).
- glyph_<name>.png: the 8 glyph tokens as full discs (the generated sheet crops the edge tokens).
- icon_<name>.png: rounded cream UI icons drawn at 4x and downsampled (bundled PNGs, never runtime data URIs).
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(ROOT, "assets", "art")
OUT = os.path.join(ROOT, "assets", "game")

# ---------- glyph tokens ----------
sheet = Image.open(os.path.join(SRC, "glyph_tokens.png")).convert("RGBA")
R = 69  # token radius on the sheet
cells = {  # name: (cx, cy) centre on the sheet
    "leaf": (103 - R, 69), "drop": (181, 69), "lantern": (328, 69), "moon": (405 + R, 69),
    "kite": (103 - R, 217), "key": (181, 217), "cup": (328, 217), "star": (405 + R, 217),
}
S = 4
for name, (cx, cy) in cells.items():
    size = 2 * R + 8
    # Missing slice (edge tokens): extend each row's seam colour outward (rows follow the disc's top-to-bottom
    # shading), skipping seam pixels that belong to the glyph; then clip to the disc.
    crop = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x0, y0 = cx - size // 2, cy - size // 2
    crop.paste(sheet.crop((max(0, x0), max(0, y0), min(512, x0 + size), min(286, y0 + size))), (max(0, -x0), max(0, -y0)))
    ca = np.array(crop).astype(np.float32)
    left_missing = max(0, -x0); right_start = size - max(0, x0 + size - 512)
    seam_x = left_missing if left_missing else right_start - 1
    if left_missing or right_start < size:
        base = np.median(ca[size // 2 - 40:size // 2 + 40, seam_x + (4 if left_missing else -4), :3], axis=0)
        last = base
        for y in range(size):
            px = ca[y, seam_x]
            if px[3] > 200 and np.abs(px[:3] - base).sum() < 45:
                last = px[:3]
            rng = range(0, left_missing) if left_missing else range(right_start, size)
            for x in rng:
                ca[y, x, :3] = last; ca[y, x, 3] = 255
        # soften the filled band so no hard column shows
        filled = Image.fromarray(ca.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))
        fa = np.array(filled).astype(np.float32)
        band = slice(0, left_missing + 4) if left_missing else slice(right_start - 4, size)
        ca[:, band] = fa[:, band]
    mask = Image.new("L", (size * S, size * S), 0)
    ImageDraw.Draw(mask).ellipse([4 * S, 4 * S, (size - 4) * S, (size - 4) * S], fill=255)
    mask = np.array(mask.resize((size, size), Image.LANCZOS)).astype(np.float32) / 255.0
    ca[:, :, 3] = ca[:, :, 3] * mask
    out = Image.fromarray(ca.astype(np.uint8))
    out = out.resize((128, 128), Image.LANCZOS)
    out.save(os.path.join(OUT, f"glyph_{name}.png"))

# ---------- icons ----------
N = 96 * S  # canvas
INK = (255, 250, 240, 255)
SH = (40, 60, 70, 90)

def stroke_poly(d, pts, w, fill=INK):
    pts = [(x * N / 24, y * N / 24) for x, y in pts]
    d.line(pts, fill=fill, width=int(w * N / 24), joint="curve")
    r = w * N / 48
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

def arc_pts(cx, cy, r, a0, a1, n=40):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def poly(d, pts, fill=INK):
    d.polygon([(x * N / 24, y * N / 24) for x, y in pts], fill=fill)

def circ(d, cx, cy, r, fill=INK):
    d.ellipse([(cx - r) * N / 24, (cy - r) * N / 24, (cx + r) * N / 24, (cy + r) * N / 24], fill=fill)

def rrect(d, x0, y0, x1, y1, r, fill=INK):
    d.rounded_rectangle([x0 * N / 24, y0 * N / 24, x1 * N / 24, y1 * N / 24], radius=r * N / 24, fill=fill)

def draw_icon(name, d, c=INK):
    W = 2.6
    if name == "play":
        poly(d, [(8, 5.5), (19, 12), (8, 18.5)], c)
    elif name == "undo":
        stroke_poly(d, arc_pts(13, 13.5, 5.5, -90, 120), W, c)
        stroke_poly(d, [(13, 8), (8.5, 8)], W, c)
        poly(d, [(4.5, 8), (9.5, 3.8), (9.5, 12.2)], c)
    elif name == "redo":
        stroke_poly(d, arc_pts(11, 13.5, 5.5, 270, 60, ), W, c)
        stroke_poly(d, [(11, 8), (15.5, 8)], W, c)
        poly(d, [(19.5, 8), (14.5, 3.8), (14.5, 12.2)], c)
    elif name == "restart":
        stroke_poly(d, arc_pts(12, 13, 6.5, -60, 230), W, c)
        poly(d, [(18.5, 3.5), (19.6, 10.5), (12.8, 8.2)], c)
    elif name == "gear":
        for k in range(8):
            a = math.radians(k * 45)
            pts = []
            for dx, dy in ((-1.7, 6.2), (1.7, 6.2), (1.7, 9.6), (-1.7, 9.6)):
                pts.append((12 + dx * math.cos(a) - dy * math.sin(a), 12 + dx * math.sin(a) + dy * math.cos(a)))
            poly(d, pts, c)
        circ(d, 12, 12, 7, c)
        circ(d, 12, 12, 2.9, (0, 0, 0, 0))
    elif name == "cart":
        stroke_poly(d, [(2.5, 4.5), (5.5, 4.5), (8, 15), (18, 15)], W, c)
        poly(d, [(6.4, 7), (21, 7), (19, 13), (7.8, 13)], c)
        circ(d, 9, 19, 2, c); circ(d, 17, 19, 2, c)
    elif name == "map":
        poly(d, [(3, 6), (9, 4), (15, 6), (21, 4), (21, 18), (15, 20), (9, 18), (3, 20)], c)
        stroke_poly(d, [(9, 4.5), (9, 17.5)], 1.2, (0, 0, 0, 0))
        stroke_poly(d, [(15, 6.5), (15, 19.5)], 1.2, (0, 0, 0, 0))
    elif name == "home":
        poly(d, [(12, 3), (21.5, 11.5), (19, 11.5), (19, 20), (5, 20), (5, 11.5), (2.5, 11.5)], c)
        rrect(d, 10, 13.5, 14, 20, 1, (0, 0, 0, 0))
    elif name == "bulb":
        circ(d, 12, 10, 6.5, c)
        poly(d, [(8.5, 13), (15.5, 13), (14.5, 17), (9.5, 17)], c)
        rrect(d, 9.3, 18, 14.7, 20.3, 1, c)
    elif name == "close":
        stroke_poly(d, [(6, 6), (18, 18)], 3, c); stroke_poly(d, [(18, 6), (6, 18)], 3, c)
    elif name == "back":
        stroke_poly(d, [(15, 4.5), (8, 12), (15, 19.5)], 3.2, c)
    elif name == "cloud":
        circ(d, 8, 14, 4.5, c); circ(d, 13, 10.5, 5.5, c); circ(d, 17.5, 14.5, 4, c)
        rrect(d, 5, 13.5, 20, 18.5, 2.5, c)
    elif name == "track":
        stroke_poly(d, [(4, 20), (20, 4)], 2.2, c)
        for k in range(5):
            t = 0.12 + k * 0.19
            x, y = 4 + 16 * t, 20 - 16 * t
            stroke_poly(d, [(x - 3, y - 3), (x + 3, y + 3)], 1.8, c)
    elif name == "line":
        stroke_poly(d, [(3.5, 18), (9, 9), (15, 15), (20.5, 6)], 3.2, c)
        circ(d, 3.5, 18, 2.6, c); circ(d, 20.5, 6, 2.6, c)
    elif name == "tunnel":
        d.pieslice([4 * N / 24, 5 * N / 24, 20 * N / 24, 27 * N / 24], 180, 360, fill=c)
        d.pieslice([8 * N / 24, 10 * N / 24, 16 * N / 24, 24 * N / 24], 180, 360, fill=(0, 0, 0, 0))
        rrect(d, 3, 15.5, 21, 18.5, 1, c)
    elif name == "carriage":
        rrect(d, 3, 7, 21, 17, 3, c)
        for x in (6, 10.5, 15):
            rrect(d, x, 9, x + 3, 12, 0.8, (0, 0, 0, 0))
        circ(d, 7.5, 18.5, 1.8, c); circ(d, 16.5, 18.5, 1.8, c)
    elif name == "hub":
        circ(d, 12, 12, 8.5, c); circ(d, 12, 12, 5.8, (0, 0, 0, 0)); circ(d, 12, 12, 3.6, c)
    elif name == "lock":
        stroke_poly(d, arc_pts(12, 10, 4.2, 180, 360) , 2.6, c)
        stroke_poly(d, [(7.8, 10), (7.8, 11)], 2.6, c); stroke_poly(d, [(16.2, 10), (16.2, 11)], 2.6, c)
        rrect(d, 5.5, 11, 18.5, 20.5, 2.5, c)
    elif name == "pip":
        circ(d, 12, 8, 3.6, c)
        poly(d, [(6.5, 20.5), (7.5, 13.5), (12, 12), (16.5, 13.5), (17.5, 20.5)], c)
        rrect(d, 6.5, 13, 17.5, 20.5, 3, c)
    elif name == "calendar":
        rrect(d, 4, 6, 20, 20, 2.5, c)
        rrect(d, 6, 10.5, 18, 18, 1, (0, 0, 0, 0))
        rrect(d, 7, 3.5, 9, 8, 1, c); rrect(d, 15, 3.5, 17, 8, 1, c)
    elif name == "share":
        circ(d, 17.5, 5.5, 3, c); circ(d, 6.5, 12, 3, c); circ(d, 17.5, 18.5, 3, c)
        stroke_poly(d, [(17.5, 5.5), (6.5, 12), (17.5, 18.5)], 2, c)
    elif name == "duel":  # two riders facing each other
        circ(d, 7, 7.5, 3, c); rrect(d, 2.5, 11.5, 11.5, 20.5, 3.5, c)
        circ(d, 17, 7.5, 3, c); rrect(d, 12.5, 11.5, 21.5, 20.5, 3.5, c)
        stroke_poly(d, [(12, 12), (12, 20.5)], 1.4, (0, 0, 0, 0))
    elif name == "trophy":
        poly(d, [(6, 3.5), (18, 3.5), (17, 11), (12, 14), (7, 11)], c)
        stroke_poly(d, arc_pts(6, 7.5, 3, 90, 270), 1.8, c); stroke_poly(d, arc_pts(18, 7.5, 3, -90, 90), 1.8, c)
        rrect(d, 10.8, 13, 13.2, 17.5, 0.5, c); rrect(d, 7, 17, 17, 20.5, 1.5, c)
    elif name == "garden":  # a round tree on a little mound
        circ(d, 12, 9, 6.2, c); circ(d, 7.5, 11.5, 3.8, c); circ(d, 16.5, 11.5, 3.8, c)
        rrect(d, 10.8, 12, 13.2, 19, 0.8, c)
        d.pieslice([3 * N / 24, 17 * N / 24, 21 * N / 24, 25 * N / 24], 180, 360, fill=c)
    elif name == "flame":
        poly(d, [(12, 2.5), (17.8, 11)] + arc_pts(12, 14.5, 6.3, -20, 200)[1:] + [(6.2, 11)], c)
        poly(d, [(12, 10), (14.6, 14.5)] + arc_pts(12, 16, 2.9, -20, 200)[1:] + [(9.4, 14.5)], (0, 0, 0, 0))
    elif name == "people":  # friend room
        circ(d, 12, 6.5, 3, c); rrect(d, 7.5, 10.5, 16.5, 17.5, 3.5, c)
        circ(d, 5, 10, 2.2, c); rrect(d, 1.5, 13, 8.5, 19.5, 2.5, c)
        circ(d, 19, 10, 2.2, c); rrect(d, 15.5, 13, 22.5, 19.5, 2.5, c)

ICONS = ["play", "undo", "redo", "restart", "gear", "cart", "map", "home", "bulb", "close", "back", "cloud", "track", "line",
         "tunnel", "carriage", "hub", "lock", "pip", "calendar", "share", "duel", "trophy", "garden", "flame", "people"]
for name in ICONS:
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    draw_icon(name, ImageDraw.Draw(img))
    # carve holes drawn with alpha 0: ImageDraw overwrote pixels already, nothing else needed
    a = np.array(img)
    shadow = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    sa = np.zeros_like(a); sa[:, :, 0], sa[:, :, 1], sa[:, :, 2] = SH[0], SH[1], SH[2]
    sa[:, :, 3] = (a[:, :, 3].astype(np.float32) * SH[3] / 255).astype(np.uint8)
    shadow = Image.fromarray(sa).filter(ImageFilter.GaussianBlur(S * 1.2))
    final = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    final.alpha_composite(shadow, (0, int(S * 2.2)))
    final.alpha_composite(img)
    final.resize((96, 96), Image.LANCZOS).save(os.path.join(OUT, f"icon_{name}.png"))

print("baked", len(cells), "glyphs,", len(ICONS), "icons")

# ---------- token coin (soft currency) ----------
T = 128 * S
coin = Image.new("RGBA", (T, T), (0, 0, 0, 0))
d = ImageDraw.Draw(coin)
d.ellipse([6 * S, 10 * S, 122 * S, 126 * S], fill=(176, 112, 40, 255))  # lip
d.ellipse([6 * S, 4 * S, 122 * S, 118 * S], fill=(242, 182, 70, 255))
d.ellipse([16 * S, 14 * S, 112 * S, 108 * S], fill=(232, 160, 52, 255))
d.ellipse([20 * S, 17 * S, 108 * S, 104 * S], fill=(247, 205, 96, 255))
d.ellipse([28 * S, 18 * S, 74 * S, 44 * S], fill=(255, 238, 170, 160))  # highlight
icon = Image.new("RGBA", (N, N), (0, 0, 0, 0))
draw_icon("carriage", ImageDraw.Draw(icon), (190, 110, 30, 255))
icon = icon.resize((60 * S, 60 * S), Image.LANCZOS)
coin.alpha_composite(icon, (34 * S, 31 * S))
coin.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, "token.png"))
print("baked token")
