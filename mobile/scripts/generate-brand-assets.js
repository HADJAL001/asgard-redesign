#!/usr/bin/env node
/**
 * Генерирует брендированные icon/adaptive-icon/splash/favicon для mobile/assets/images
 * из простого SVG-эмблемы OSGARD (кольцо + гем), в цветах основного веб-приложения
 * (--background: #0A1128, --primary: #00F0FF, elite-chrome gold: #d4af37 — см. app/globals.css).
 *
 * Требует `sharp` (уже есть в devDependencies корневого package.json).
 * Запуск: node mobile/scripts/generate-brand-assets.js   (из корня репозитория)
 */
const path = require('path');
const sharp = require(path.join(__dirname, '..', '..', 'node_modules', 'sharp'));

const NAVY = '#0A1128';
const CYAN = '#00F0FF';
const GOLD = '#d4af37';

const OUT_DIR = path.join(__dirname, '..', 'assets', 'images');

function emblem({ ringRadius, gemHalfW, gemHalfH, strokeW }) {
  const cx = 512;
  const cy = 512;
  const top = `${cx},${cy - gemHalfH}`;
  const right = `${cx + gemHalfW},${cy}`;
  const bottom = `${cx},${cy + gemHalfH}`;
  const left = `${cx - gemHalfW},${cy}`;
  return `
    <circle cx="${cx}" cy="${cy}" r="${ringRadius}" fill="none" stroke="${GOLD}" stroke-width="${strokeW}" opacity="0.95" />
    <polygon points="${top} ${right} ${bottom} ${left}" fill="none" stroke="${CYAN}" stroke-width="${strokeW * 0.8}" stroke-linejoin="round" opacity="0.95" />
    <line x1="${cx - gemHalfW * 0.55}" y1="${cy - gemHalfH * 0.35}" x2="${cx + gemHalfW * 0.55}" y2="${cy - gemHalfH * 0.35}" stroke="${CYAN}" stroke-width="${strokeW * 0.5}" opacity="0.7" />
    <circle cx="${cx}" cy="${cy}" r="${strokeW * 0.9}" fill="${GOLD}" opacity="0.9" />
  `;
}

async function opaqueIcon(file, size) {
  const mark = emblem({ ringRadius: 360, gemHalfW: 190, gemHalfH: 290, strokeW: 26 });
  const svg = `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stop-color="#12234f" />
          <stop offset="100%" stop-color="${NAVY}" />
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#glow)" />
      ${mark}
    </svg>
  `;
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT_DIR, file));
}

async function transparentMark(file, size, ringRadius) {
  const mark = emblem({ ringRadius, gemHalfW: ringRadius * 0.53, gemHalfH: ringRadius * 0.8, strokeW: ringRadius * 0.075 });
  const svg = `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      ${mark}
    </svg>
  `;
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT_DIR, file));
}

async function main() {
  // iOS/general app icon — непрозрачный, во весь квадрат (система сама скруглит углы).
  await opaqueIcon('icon.png', 1024);
  // Android adaptive-icon foreground — прозрачный фон, метка внутри safe zone (~66% канвы),
  // чтобы не обрезалась круглой/квадратной маской лаунчера.
  await transparentMark('adaptive-icon.png', 1024, 300);
  // Splash — прозрачный фон, метка покрупнее (imageWidth в app.json задаёт итоговый размер).
  await transparentMark('splash-icon.png', 1024, 400);
  // Favicon (web) — уменьшенная версия непрозрачной иконки.
  await opaqueIcon('favicon.png', 196);

  console.log('Сгенерировано: icon.png, adaptive-icon.png, splash-icon.png, favicon.png →', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
