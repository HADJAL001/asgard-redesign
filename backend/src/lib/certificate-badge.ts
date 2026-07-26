/* ================================================================
   OSGARD · Embeddable SVG-бейдж credential «OSGARD Certified Vibecoder»
   ----------------------------------------------------------------
   Чистый рендер разметки — без похода в БД (см. certificate.ts) и
   без HTTP-специфики (см. routes/certified.routes.ts). Три визуальных
   статуса; для revoked/not-found НЕ рисуем 404-подобную ошибку —
   бейдж всегда должен быть валидным embeddable-изображением.

   Золото — захардкоженный hex (SVG рендерится на сервере, CSS-переменные
   ему не видны): #F7E05E/#D4AF37/#B8860B = app/globals.css --eg-gold-1/2/3.
   ================================================================ */

export type BadgeStatus = "issued" | "revoked" | "not-found"

const GOLD_LIGHT = "#F7E05E"
const GOLD_MID = "#D4AF37"
const GOLD_DARK = "#B8860B"
const NAVY = "#0A1128"
const NEUTRAL_BG = "#4a4a4a"
const NEUTRAL_FG = "#d0d0d0"

const TIER_LABELS: Record<string, string> = {
  founder_track: "Founder Track",
  founder_circle: "Founder Circle",
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Грубая оценка ширины текста (Verdana/Geneva 11px) — без точных метрик шрифта на сервере. */
function textWidth(text: string): number {
  return Math.round(text.length * 6.4)
}

function messageFor(status: BadgeStatus, tier?: string | null): string {
  if (status === "issued") {
    const tierLabel = (tier && TIER_LABELS[tier]) || "Certified"
    return tierLabel
  }
  if (status === "revoked") return "Revoked"
  return "Unverified"
}

/** Рендерит готовый SVG-бейдж 2-сегментного вида (shields.io-подобный). */
export function renderBadgeSvg(status: BadgeStatus, tier?: string | null): string {
  const label = "OSGARD"
  const message = messageFor(status, tier)

  const messageColor = status === "issued" ? GOLD_MID : NEUTRAL_BG
  const messageTextColor = status === "issued" ? NAVY : NEUTRAL_FG
  const labelColor = NAVY

  const height = 20
  const paddingX = 10
  const labelWidth = textWidth(label) + paddingX * 2
  const messageWidth = textWidth(message) + paddingX * 2
  const totalWidth = labelWidth + messageWidth
  const radius = 3

  const labelTextX = labelWidth / 2
  const messageTextX = labelWidth + messageWidth / 2
  const textY = height / 2 + 4

  const goldGradient =
    status === "issued"
      ? `<linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="${GOLD_LIGHT}"/>
           <stop offset="100%" stop-color="${GOLD_DARK}"/>
         </linearGradient>`
      : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${escapeXml(
    label,
  )}: ${escapeXml(message)}">
  <title>${escapeXml(label)}: ${escapeXml(message)}</title>
  <defs>
    ${goldGradient}
    <clipPath id="clip"><rect width="${totalWidth}" height="${height}" rx="${radius}"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="${labelWidth}" height="${height}" fill="${labelColor}"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="${height}" fill="${
      status === "issued" ? "url(#goldGrad)" : messageColor
    }"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelTextX}" y="${textY}" fill="${GOLD_MID}">${escapeXml(label)}</text>
    <text x="${messageTextX}" y="${textY}" fill="${messageTextColor}">${escapeXml(message)}</text>
  </g>
</svg>`
}
