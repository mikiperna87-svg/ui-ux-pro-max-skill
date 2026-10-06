#!/usr/bin/env node
/**
 * Genera i 3 video DEMO (segnaposto) in ../../videos/ usando Chromium headless.
 * Sostituiscili con i tuoi video reali e lancia tools/extract-frames.sh.
 *
 *   node tools/demo-video/render.mjs [--seconds 4] [--fps 30]
 */
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Playwright locale (npm i -D playwright) oppure installato globalmente
async function loadPlaywright() {
  try { return await import('playwright'); } catch {
    const root = execFileSync('npm', ['root', '-g']).toString().trim();
    return createRequire(import.meta.url)(createRequire(import.meta.url).resolve('playwright', { paths: [root] }));
  }
}
const { chromium } = await loadPlaywright();

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'videos');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const seconds = arg('seconds', 4);
const fps = arg('fps', 30);
const frames = seconds * fps;
const names = { 1: 'scene1-spin', 2: 'scene2-explosion', 3: 'scene3-flythrough' };

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(pathToFileURL(join(here, 'render.html')).href);

for (const scene of [1, 2, 3]) {
  const tmp = mkdtempSync(join(tmpdir(), `scene${scene}-`));
  for (let i = 0; i < frames; i++) {
    const data = await page.evaluate(([s, t]) => {
      window.renderFrame(s, t);
      return document.getElementById('c').toDataURL('image/png');
    }, [scene, i / (frames - 1)]);
    writeFileSync(join(tmp, `${String(i + 1).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  const out = join(outDir, `${names[scene]}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(tmp, '%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', out]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ ${out} (${frames} frame)`);
}
await browser.close();
