"""Render the extension icon (same design as assets/icon.svg) to PNGs.

Pure Python (zlib only), so no image libraries are needed:
    python3 scripts/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
SIZES = [16, 32, 48, 128]
SS = 4  # supersampling per axis

# Geometry in a 512x512 design space (matches assets/icon.svg).
BG = (16, 16, 496, 496, 112)  # x0, y0, x1, y1, corner radius
BACK_TRI = [(150, 140), (330, 256), (150, 372)]
FRONT_TRI = [(218, 140), (398, 256), (218, 372)]
STROKE_R = 18  # half of stroke-width 36, round joins
C_TOP, C_BOTTOM = (0x63, 0x66, 0xF1), (0x43, 0x38, 0xCA)


def in_rounded_rect(x, y):
    x0, y0, x1, y1, r = BG
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def seg_dist(px, py, a, b):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def in_round_tri(x, y, tri):
    a, b, c = tri
    def side(p, q):
        return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
    s1, s2, s3 = side(a, b), side(b, c), side(c, a)
    if (s1 >= 0 and s2 >= 0 and s3 >= 0) or (s1 <= 0 and s2 <= 0 and s3 <= 0):
        return True
    return min(seg_dist(x, y, a, b), seg_dist(x, y, b, c), seg_dist(x, y, c, a)) <= STROKE_R


def sample(x, y):
    """Premultiplied RGBA at a design-space point."""
    if not in_rounded_rect(x, y):
        return (0.0, 0.0, 0.0, 0.0)
    t = (x + y) / 1024  # diagonal gradient
    r, g, b = (C_TOP[i] + (C_BOTTOM[i] - C_TOP[i]) * t for i in range(3))
    def over(base, alpha):  # white at `alpha` over base
        return tuple(v + (255 - v) * alpha for v in base)
    col = (r, g, b)
    if in_round_tri(x, y, BACK_TRI):
        col = over(col, 0.45)
    if in_round_tri(x, y, FRONT_TRI):
        col = (255, 255, 255)
    return (*col, 1.0)


# Chrome Web Store guideline: 128px icon = 96px artwork + 16px transparent padding.
PADDING = {128: 16}


def render(size):
    pad = PADDING.get(size, 0)
    # BG spans 16..496 in design space; map that span onto the art area.
    art = size - 2 * pad
    scale = 480 / art
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter: none
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    s = sample(16 + (px - pad + (sx + 0.5) / SS) * scale, 16 + (py - pad + (sy + 0.5) / SS) * scale)
                    for i in range(3):
                        acc[i] += s[i] * s[3]
                    acc[3] += s[3]
            n = SS * SS
            a = acc[3] / n
            rgb = [round(acc[i] / acc[3]) if acc[3] else 0 for i in range(3)]
            row += bytes(rgb + [round(a * 255)])
        rows.append(bytes(row))
    return png(size, size, b"".join(rows))


def png(w, h, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for s in SIZES:
        (OUT / f"icon{s}.png").write_bytes(render(s))
        print("wrote", OUT / f"icon{s}.png")
