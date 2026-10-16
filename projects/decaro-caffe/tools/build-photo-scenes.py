#!/usr/bin/env python3
"""
Crea i 3 video delle scene a scroll partendo da foto reali ad alta risoluzione
(img/source/), con movimenti di camera lenti e fluidi (push-in, pan, dissolvenza).
Ogni frame è ricampionato con precisione sub-pixel, quindi niente tremolio.

    python3 tools/build-photo-scenes.py            # 96 frame per scena, 1920x1080
    python3 tools/build-photo-scenes.py --frames 120
    tools/extract-frames.sh                         # poi: video -> WebP

Quando avrai video girati (o generati) delle stesse scene, mettili in videos/
con lo stesso nome e salta questo script.
Richiede: Pillow (pip install pillow) e ffmpeg.
"""
import argparse
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'img' / 'source'
OUT = ROOT / 'videos'
W, H = 1920, 1080


def ease(t):
    return 0.5 - math.cos(math.pi * t) / 2


def lerp(a, b, t):
    return a + (b - a) * t


def shot(img, zoom, cx, cy):
    """Inquadratura W×H centrata in (cx, cy) [0..1] con zoom relativo al 'cover'."""
    iw, ih = img.size
    cover = max(W / iw, H / ih)
    s = cover * zoom                      # pixel di output per pixel sorgente
    vw, vh = W / s, H / s                 # finestra visibile in pixel sorgente
    x0 = min(max(cx * iw - vw / 2, 0), iw - vw)
    y0 = min(max(cy * ih - vh / 2, 0), ih - vh)
    # trasformazione affine output -> sorgente (float, sub-pixel)
    return img.transform((W, H), Image.AFFINE, (1 / s, 0, x0, 0, 1 / s, y0), resample=Image.BICUBIC)


def grade(frame, light):
    frame = ImageEnhance.Brightness(frame).enhance(light)
    return ImageEnhance.Color(frame).enhance(1.06)


# Movimenti di camera: (zoom, centro x, centro y, luminosità) all'inizio e alla fine
SCENES = {
    # 1. Hero: lento push-in sul chicco adagiato sul macinato
    'scene1-chicco': [('scene1-chicco.jpg', (1.00, 0.50, 0.50, 0.82), (1.14, 0.50, 0.42, 1.0))],
    # 2. Tostatura: carrellata laterale dentro la tostatrice
    'scene2-tostatura': [('scene2-tostatura.jpg', (1.18, 0.30, 0.50, 0.85), (1.42, 0.62, 0.56, 1.0))],
    # 3. Dal raccolto alla tazzina: piantagione -> dissolvenza -> crema
    'scene3-viaggio': [('scene3a-raccolta.jpg', (1.00, 0.50, 0.45, 0.9), (1.16, 0.56, 0.55, 1.0)),
                       ('scene3b-crema.jpg', (1.04, 0.42, 0.50, 0.95), (1.45, 0.36, 0.48, 1.05))],
}


def render(name, parts, frames):
    images = [(Image.open(SRC / f).convert('RGB'), a, b) for f, a, b in parts]
    OUT.mkdir(exist_ok=True)
    out = OUT / f'{name}.mp4'
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                           '-s', f'{W}x{H}', '-r', '30', '-i', '-', '-c:v', 'libx264', '-crf', '14',
                           '-preset', 'slow', '-pix_fmt', 'yuv420p', str(out)], stdin=subprocess.PIPE)
    n = len(images)
    xfade = 0.16  # durata della dissolvenza tra due foto (frazione della scena)
    for i in range(frames):
        t = i / (frames - 1)
        seg = min(int(t * n), n - 1)
        def frame_of(k):
            img, a, b = images[k]
            local = ease(min(max(t * n - k, 0), 1))
            z, cx, cy, light = (lerp(a[j], b[j], local) for j in range(4))
            return grade(shot(img, z, cx, cy), light)
        f = frame_of(seg)
        edge = (seg + 1) / n
        if seg < n - 1 and t > edge - xfade / 2:
            mix = min((t - (edge - xfade / 2)) / xfade, 1)
            f = Image.blend(f, frame_of(seg + 1), ease(mix))
        elif seg > 0 and t < seg / n + xfade / 2:
            mix = (t - (seg / n - xfade / 2)) / xfade
            f = Image.blend(frame_of(seg - 1), f, ease(mix))
        ff.stdin.write(f.tobytes())
    ff.stdin.close()
    ff.wait()
    print(f'✓ {out.relative_to(ROOT)} ({frames} frame)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=96)
    args = ap.parse_args()
    for name, parts in SCENES.items():
        render(name, parts, args.frames)
