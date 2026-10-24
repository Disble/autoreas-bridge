"""Turn a 4x2 Codex sprite sheet into the 1x8 WebP strip the splash plays.

Usage: python build-strip.py <sheet.png> <out.webp> [cell_px=440] [quality=82]

Prints, per cell, the lowest opaque row (the feet: compare them, the ground line must hold), the
right edge, and opaque pixels touching the cell border (art bleeding in from a neighbour, or a head
at the edge). Requires Pillow and numpy.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

COLS, ROWS = 4, 2

sheet_path, out_path = Path(sys.argv[1]), Path(sys.argv[2])
cell_px = int(sys.argv[3]) if len(sys.argv) > 3 else 440
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 82

sheet = Image.open(sheet_path).convert('RGBA')
width, height = sheet.size
cell_w, cell_h = width // COLS, height // ROWS
print(f'sheet {width}x{height}, cell {cell_w}x{cell_h}')

strip = Image.new('RGBA', (cell_px * COLS * ROWS, cell_px), (0, 0, 0, 0))
for index in range(COLS * ROWS):
    col, row = index % COLS, index // COLS
    left, top = round(col * width / COLS), round(row * height / ROWS)
    cell = sheet.crop((left, top, left + cell_w, top + cell_h))
    alpha = np.asarray(cell)[..., 3] > 128
    ys, xs = np.where(alpha)
    border = {
        'left': int(alpha[:, :2].sum()), 'right': int(alpha[:, -2:].sum()),
        'top': int(alpha[:2].sum()), 'bottom': int(alpha[-2:].sum()),
    }
    touching = {side: count for side, count in border.items() if count}
    print(f'frame {index + 1}: feet y={ys.max()} right x={xs.max()} border={touching or "clear"}')
    strip.alpha_composite(cell.resize((cell_px, cell_px), Image.LANCZOS), (index * cell_px, 0))

strip.save(out_path, 'WEBP', quality=quality, method=6)
corners = strip.getchannel('A').getpixel((0, 0)), strip.getchannel('A').getpixel((strip.width - 1, cell_px - 1))
print(f'wrote {out_path} {strip.width}x{strip.height}, {out_path.stat().st_size} bytes, corner alpha {corners}')
