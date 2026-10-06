#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Estrae i fotogrammi dai 3 video e li converte in WebP compressi.
#
#   tools/extract-frames.sh                 # 30 fps (default)
#   tools/extract-frames.sh --interpolate   # interpola a 60 fps (minterpolate)
#   FPS=24 DESKTOP_W=1600 tools/extract-frames.sh
#
# Input  : videos/scene1*.{mp4,mov,webm}, videos/scene2*, videos/scene3*
# Output : frames/sceneN/desktop/0001.webp ...  (tutti i frame, max DESKTOP_W px)
#          frames/sceneN/mobile/0001.webp  ...  (1 frame ogni 2, max MOBILE_W px)
#          frames/manifest.js                   (conteggi e dimensioni, letti dal sito)
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FPS="${FPS:-30}"
DESKTOP_W="${DESKTOP_W:-1920}"
MOBILE_W="${MOBILE_W:-960}"
Q_DESKTOP="${Q_DESKTOP:-72}"
Q_MOBILE="${Q_MOBILE:-62}"
INTERPOLATE=0
[[ "${1:-}" == "--interpolate" ]] && INTERPOLATE=1

command -v ffmpeg >/dev/null || { echo "ffmpeg non trovato: installalo (brew/apt/choco install ffmpeg)"; exit 1; }

if (( INTERPOLATE )); then
  # Interpolazione con compensazione del movimento: raddoppia la fluidità
  # quando il video sorgente è a 24/30 fps e lo scroll risulta a scatti.
  RATE="minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
else
  RATE="fps=${FPS}"
fi

dims() { ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=, "$1"; }

MANIFEST="window.FRAME_MANIFEST = {"
for n in 1 2 3; do
  src="$(ls videos/scene${n}*.{mp4,mov,webm,m4v} 2>/dev/null | head -n1 || true)"
  [[ -z "$src" ]] && { echo "✗ Manca videos/scene${n}*.mp4"; exit 1; }
  out="frames/scene${n}"
  rm -rf "$out/desktop" "$out/mobile"
  mkdir -p "$out/desktop" "$out/mobile"
  echo "→ scene${n}: $src"

  ffmpeg -hide_banner -loglevel error -y -i "$src" -an \
    -vf "${RATE},scale='min(${DESKTOP_W},iw)':-2:flags=lanczos" \
    -c:v libwebp -quality "$Q_DESKTOP" -compression_level 6 -preset picture \
    "$out/desktop/%04d.webp"

  # Mobile: un frame ogni due + risoluzione ridotta
  ffmpeg -hide_banner -loglevel error -y -i "$src" -an \
    -vf "${RATE},select='not(mod(n\,2))',setpts=N/FRAME_RATE/TB,scale='min(${MOBILE_W},iw)':-2:flags=lanczos" \
    -c:v libwebp -quality "$Q_MOBILE" -compression_level 6 -preset picture \
    "$out/mobile/%04d.webp"

  dc=$(ls "$out/desktop" | wc -l | tr -d ' ')
  mc=$(ls "$out/mobile" | wc -l | tr -d ' ')
  IFS=, read -r dw dh <<<"$(dims "$out/desktop/0001.webp")"
  IFS=, read -r mw mh <<<"$(dims "$out/mobile/0001.webp")"
  size=$(du -sh "$out" | cut -f1)
  echo "  ✓ desktop ${dc} frame ${dw}x${dh} · mobile ${mc} frame ${mw}x${mh} · ${size}"
  MANIFEST+="
  scene${n}: { desktop: { count: ${dc}, width: ${dw}, height: ${dh} }, mobile: { count: ${mc}, width: ${mw}, height: ${mh} } },"
done
MANIFEST+="
};"
printf '%s\n' "/* Generato da tools/extract-frames.sh — non modificare a mano */" "$MANIFEST" > frames/manifest.js
echo "✓ frames/manifest.js aggiornato"
