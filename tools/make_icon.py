#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 CodeStats 应用图标（九宫格方案 A）

只依赖标准库：zlib + struct 手写 PNG。
- background.png : 1024x1024 纯色底（#101814）
- foreground.png : 1024x1024 透明 + 九宫格图案（系统叠加在 background 上）
- startIcon.png  : 144x144  背景与图案合成（启动画面）

图案比例（相对画布）：
  单格 0.1758、间距 0.0391、圆角 0.0508，整体占画布 60.5%，落在安全区内。
"""

import math
import os
import struct
import zlib

BG = (16, 24, 20)
DARK = (30, 43, 34)
MID = (46, 122, 74)
HI = (57, 211, 83)

CELL = 0.17578125
GAP = 0.0390625
RADIUS = 0.05078125

GRID = [
    [DARK, MID, DARK],
    [MID, HI, DARK],
    [DARK, DARK, MID],
]

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'harmony')


def new_buffer(size, rgba):
    return bytearray(bytes(rgba) * (size * size))


def fill_rounded(buf, size, x0, y0, w, h, r, rgba):
    """按行填充圆角矩形；坐标与尺寸都是整数像素"""
    if x0 < 0:
        w += x0
        x0 = 0
    if y0 < 0:
        h += y0
        y0 = 0
    if x0 + w > size:
        w = size - x0
    if y0 + h > size:
        h = size - y0
    if w <= 0 or h <= 0:
        return
    px = bytes(rgba) + b'\xff' if len(rgba) == 3 else bytes(rgba)
    r = max(0, min(r, w // 2, h // 2))
    for yy in range(y0, y0 + h):
        dy = 0
        if yy < y0 + r:
            dy = (y0 + r) - yy
        elif yy >= y0 + h - r:
            dy = yy - (y0 + h - r) + 1
        dx = 0
        if dy > 0:
            dyc = dy - 0.5
            dx = int(round(r - math.sqrt(max(0.0, r * r - dyc * dyc))))
        start = (yy * size + x0 + dx) * 4
        count = w - 2 * dx
        if count > 0:
            buf[start:start + count * 4] = px * count


def downsample(buf, size, factor):
    """因子 x 因子 盒式平均；按预乘 alpha 混合，避免透明边缘发暗"""
    out_size = size // factor
    out = bytearray(out_size * out_size * 4)
    f2 = factor * factor
    for y in range(out_size):
        base_y = y * factor
        for x in range(out_size):
            r = g = b = a = 0
            for dy in range(factor):
                idx = ((base_y + dy) * size + x * factor) * 4
                for _ in range(factor):
                    pa = buf[idx + 3]
                    if pa:
                        r += buf[idx] * pa
                        g += buf[idx + 1] * pa
                        b += buf[idx + 2] * pa
                        a += pa
                    idx += 4
            o = (y * out_size + x) * 4
            if a:
                out[o] = min(255, int(round(r / a)))
                out[o + 1] = min(255, int(round(g / a)))
                out[o + 2] = min(255, int(round(b / a)))
                out[o + 3] = min(255, a // f2)
    return out


def write_png(path, size, buf):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += buf[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        c += struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def draw_grid(buf, size, ss):
    total = size * (3 * CELL + 2 * GAP)
    cell = size * CELL
    gap = size * GAP
    radius = size * RADIUS
    start = (size - total) / 2.0
    for row in range(3):
        for col in range(3):
            x = int(round((start + col * (cell + gap)) * ss))
            y = int(round((start + row * (cell + gap)) * ss))
            w = int(round(cell * ss))
            h = int(round(cell * ss))
            fill_rounded(buf, int(size * ss), x, y, w, h, int(round(radius * ss)), GRID[row][col])


def build(size, ss, with_bg):
    big = int(size * ss)
    buf = new_buffer(big, (BG + (255,)) if with_bg else (0, 0, 0, 0))
    draw_grid(buf, size, ss)
    assert len(buf) == big * big * 4, 'buffer resized'
    return downsample(buf, big, ss)


def main():
    out_dirs = [
        os.path.join(ROOT, 'AppScope', 'resources', 'base', 'media'),
        os.path.join(ROOT, 'entry', 'src', 'main', 'resources', 'base', 'media'),
    ]
    bg = build(1024, 2, True)
    fg = build(1024, 2, False)
    start = build(144, 4, True)

    for d in out_dirs:
        if not os.path.isdir(d):
            continue
        write_png(os.path.join(d, 'background.png'), 1024, bg)
        write_png(os.path.join(d, 'foreground.png'), 1024, fg)
        icon = os.path.join(d, 'startIcon.png')
        if os.path.exists(icon):
            write_png(icon, 144, start)
        print('written:', d)


if __name__ == '__main__':
    main()
