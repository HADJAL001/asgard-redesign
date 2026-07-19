import sharp from "sharp"

// Chroma-key: sample the corners as the background color and make matching
// pixels transparent, with a soft feather ramp. Handles flat gray/black studio
// backdrops. Usage: node scripts/keyout.mjs <in> <out> [tolerance] [feather]
const [, , inPath, outPath, tolArg, featherArg] = process.argv
const tolerance = Number(tolArg ?? 62)
const feather = Number(featherArg ?? 26)

const { data, info } = await sharp(inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const ch = info.channels
const sample = (x, y) => {
  const i = (y * info.width + x) * ch
  return [data[i], data[i + 1], data[i + 2]]
}
const refs = [
  sample(2, 2),
  sample(info.width - 3, 2),
  sample(2, info.height - 3),
  sample(info.width - 3, info.height - 3),
]
const bg = [0, 1, 2].map((k) => refs.reduce((s, r) => s + r[k], 0) / refs.length)

for (let p = 0; p < data.length; p += ch) {
  const dr = data[p] - bg[0]
  const dg = data[p + 1] - bg[1]
  const db = data[p + 2] - bg[2]
  const dist = Math.sqrt(dr * dr + dg * dg + db * db)
  if (dist <= tolerance) data[p + 3] = 0
  else if (dist <= tolerance + feather) data[p + 3] = Math.round(((dist - tolerance) / feather) * 255)
}

await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } }).png().toFile(outPath)
console.log(`keyed ${inPath} -> ${outPath} (bg ~ rgb(${bg.map((v) => Math.round(v)).join(",")}), tol ${tolerance})`)
