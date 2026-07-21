import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { generateAiArtifactContent, computeUniqueHash, ARTIFACT_RARITIES } from "../services/ai-artifact-generator"
import { asyncHandler } from "../utils/async-handler"

const router = Router()

const RARITIES = ["common", "rare", "epic", "legendary", "mythic"]
const RARITY_MULT: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 }
const NEXT_RARITY: Record<string, string | null> = {
  common: "rare",
  rare: "epic",
  epic: "legendary",
  legendary: "mythic",
  mythic: null,
}
const LIST_CURRENCY_BY_RARITY: Record<string, string> = {
  common: "credits",
  rare: "shards",
  epic: "shards",
  legendary: "crystals",
  mythic: "timecoin",
}

const FORGE_COST_TC = 50 /* стоимость создания артефакта в TimeCoin */
const EVOLVE_COST_TC = 30 /* стоимость улучшения (уровень +1) */
const EVOLVE_RARITY_COST_TC = 120 /* стоимость перехода на следующую редкость (каждые 5 уровней) */

const AI_GENERATE_COST_TC = FORGE_COST_TC /* стоимость AI-генерации — паритет с ручной ковкой */
const AI_UNIQUENESS_MAX_ATTEMPTS = 3 /* попыток регенерации при коллизии имени, затем — суффикс */

/* ---------------- Премиум-усиление (за TimeCoin, мгновенно) ----------------
   Правила:
   - Обычное усиление (/evolve): до уровня 5, за Credits/TimeCoin, занимает 24 часа (эмулируется на фронте).
   - Премиум усиление (/premium-upgrade): до уровня 10, за TimeCoin, мгновенно.
   - Цена одного премиум-апгрейда = PREMIUM_UPGRADE_COST_TC_PER_LEVEL × текущий_уровень.
   - Шанс критического усиления: 25% (даёт +2 уровня вместо +1).
   - Уровень 10+ открывает уникальные визуальные эффекты (поле visualEffect).
------------------------------------------------------------------------------ */
const PREMIUM_MAX_LEVEL = 10
const PREMIUM_UPGRADE_COST_TC_PER_LEVEL = 20 /* цена = уровень × эта константа */
const PREMIUM_CRIT_CHANCE = 0.25 /* 25% шанс критического усиления (+2 уровня) */
const NORMAL_CRIT_CHANCE = 0.05 /* для сравнения: 5% у обычного усиления */

function premiumUpgradeCost(level: number): number {
  return level * PREMIUM_UPGRADE_COST_TC_PER_LEVEL
}


function computePrice(a: any): number {
  const statSum = a.power + a.defense + a.magic + a.speed
  const base = statSum * 5
  const afterRarity = base * (RARITY_MULT[a.rarity] || 1)
  const demand = Math.max(1, Math.round(a.views_24h / 10))
  return Math.round(afterRarity * (demand / Math.max(1, a.supply)))
}

/* ---------------- GET /artifacts/mine ---------------- */
router.get("/mine", requireAuth, (req: AuthRequest, res) => {
  const artifacts = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency,
              description, lore, ai_visual as aiVisual, visual_effect as visualEffect, source, created_at as createdAt
       FROM artifacts WHERE owner_id = ? ORDER BY created_at DESC`,
    )
    .all(req.user!.userId)

  res.json({ artifacts })
})

/* ---------------- POST /artifacts/forge ---------------- */
router.post("/forge", requireAuth, (req: AuthRequest, res) => {
  const { name, type, projectId } = req.body || {}

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Укажите название артефакта" })
  }
  if (!type || typeof type !== "string") {
    return res.status(400).json({ error: "Укажите тип артефакта" })
  }

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден" })
  if (wallet.timecoin < FORGE_COST_TC) {
    return res.status(400).json({ error: `Недостаточно TimeCoin (нужно ${FORGE_COST_TC})` })
  }

  /* Случайная генерация характеристик нового артефакта */
  const power = 10 + Math.floor(Math.random() * 30)
  const defense = 10 + Math.floor(Math.random() * 30)
  const magic = 10 + Math.floor(Math.random() * 30)
  const speed = 10 + Math.floor(Math.random() * 30)
  const rarity = "common"
  const level = 1
  const supply = 1
  const now = Date.now()

  const price = computePrice({ power, defense, magic, speed, rarity, views_24h: 0, supply })

  db.prepare(
    `UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`,
  ).run(FORGE_COST_TC, now, req.user!.userId)

  const info = db
    .prepare(
      `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed, status, views_24h, supply, price, list_currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'kept', 0, ?, ?, ?)`,
    )
    .run(
      req.user!.userId,
      projectId || null,
      name,
      type,
      rarity,
      level,
      power,
      defense,
      magic,
      speed,
      supply,
      price,
      LIST_CURRENCY_BY_RARITY[rarity],
    )

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'forge', ?, 'Кузница Артефактов', ?, 'timecoin', 'done')`,
  ).run(req.user!.userId, name, FORGE_COST_TC)

  const artifact = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency, created_at as createdAt
       FROM artifacts WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))

  res.status(201).json({ artifact })
})

/* ---------------- POST /artifacts/generate-ai ----------------
   AI-генерация уникального артефакта (Grok → DeepSeek → локальный fallback).
   Работает РЯДОМ с ручной "Кузницей" (/forge), не заменяя её. Каждый артефакт
   проверяется на уникальность имени в БД перед сохранением; при коллизии —
   до AI_UNIQUENESS_MAX_ATTEMPTS повторных генераций, затем — детерминированный
   суффикс, чтобы запрос никогда не падал из-за совпадения имени.
------------------------------------------------------------------------- */
router.post("/generate-ai", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const hint = typeof req.body?.hint === "string" && req.body.hint.trim() ? req.body.hint.trim() : undefined

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден" })
  if (wallet.timecoin < AI_GENERATE_COST_TC) {
    return res.status(400).json({ error: `Недостаточно TimeCoin (нужно ${AI_GENERATE_COST_TC})` })
  }

  const nameExists = (name: string): boolean =>
    !!db.prepare(`SELECT id FROM artifacts WHERE name = ?`).get(name)

  let generated = await generateAiArtifactContent(hint)
  let attempts = 1
  while (nameExists(generated.name) && attempts < AI_UNIQUENESS_MAX_ATTEMPTS) {
    generated = await generateAiArtifactContent(hint)
    attempts += 1
  }

  let finalName = generated.name
  if (nameExists(finalName)) {
    finalName = `${generated.name} #${Date.now().toString(36).slice(-4)}`
  }

  const rarity = (ARTIFACT_RARITIES as readonly string[]).includes(generated.rarity) ? generated.rarity : "common"
  const power = generated.power
  const defense = generated.defense
  const magic = generated.magic
  const speed = 25 /* AI не задаёт speed по спецификации из 8 полей — фиксированная середина диапазона 10-40 */
  const level = 1
  const supply = 1
  const now = Date.now()
  const uniqueHash = computeUniqueHash(finalName, now)

  const price = computePrice({ power, defense, magic, speed, rarity, views_24h: 0, supply })

  db.prepare(
    `UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`,
  ).run(AI_GENERATE_COST_TC, now, req.user!.userId)

  const info = db
    .prepare(
      `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h, supply, price, list_currency, description, lore, ai_visual, source, unique_hash)
       VALUES (?, NULL, ?, 'ai', ?, ?, ?, ?, ?, ?, 'kept', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.user!.userId,
      finalName,
      rarity,
      level,
      power,
      defense,
      magic,
      speed,
      supply,
      price,
      LIST_CURRENCY_BY_RARITY[rarity],
      generated.description,
      generated.lore,
      generated.visual,
      generated.source,
      uniqueHash,
    )

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'ai_generate', ?, 'AI-Генератор Артефактов', ?, 'timecoin', 'done')`,
  ).run(req.user!.userId, finalName, AI_GENERATE_COST_TC)

  const artifact = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency,
              description, lore, ai_visual as aiVisual, source, created_at as createdAt
       FROM artifacts WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))

  res.status(201).json({ artifact, aiSource: generated.source })
}))

/* ---------------- POST /artifacts/:id/evolve ---------------- */
router.post("/:id/evolve", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id)

  if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })
  if (artifact.owner_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому артефакту" })
  }

  const willRankUp = artifact.level % 5 === 0 && artifact.level > 0
  const nextRarity = willRankUp ? NEXT_RARITY[artifact.rarity] : artifact.rarity

  if (willRankUp && !nextRarity) {
    return res.status(400).json({ error: "Артефакт уже достиг максимальной редкости" })
  }

  const cost = willRankUp ? EVOLVE_RARITY_COST_TC : EVOLVE_COST_TC

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден" })
  if (wallet.timecoin < cost) {
    return res.status(400).json({ error: `Недостаточно TimeCoin (нужно ${cost})` })
  }

  const now = Date.now()
  const newLevel = artifact.level + 1
  const statBoost = 1.08 /* +8% к статам за уровень */

  const power = Math.round(artifact.power * statBoost)
  const defense = Math.round(artifact.defense * statBoost)
  const magic = Math.round(artifact.magic * statBoost)
  const speed = Math.round(artifact.speed * statBoost)
  const rarity = willRankUp ? (nextRarity as string) : artifact.rarity

  const price = computePrice({
    power,
    defense,
    magic,
    speed,
    rarity,
    views_24h: artifact.views_24h,
    supply: artifact.supply,
  })

  db.prepare(
    `UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`,
  ).run(cost, now, req.user!.userId)

  db.prepare(
    `UPDATE artifacts SET level = ?, rarity = ?, power = ?, defense = ?, magic = ?, speed = ?, price = ?, list_currency = ?
     WHERE id = ?`,
  ).run(newLevel, rarity, power, defense, magic, speed, price, LIST_CURRENCY_BY_RARITY[rarity], id)

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'evolve', ?, 'Кузница Артефактов', ?, 'timecoin', 'done')`,
  ).run(req.user!.userId, artifact.name, cost)

  const updated = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency, created_at as createdAt
       FROM artifacts WHERE id = ?`,
    )
    .get(id)

  res.json({ artifact: updated, rankUp: willRankUp })
})

/* ---------------- POST /artifacts/:id/premium-upgrade ----------------
   Премиум-усиление за TimeCoin: мгновенно поднимает уровень артефакта
   (максимум до PREMIUM_MAX_LEVEL = 10). Шанс критического усиления
   (+2 уровня вместо +1) — PREMIUM_CRIT_CHANCE (25%).
   Стоимость одного шага = текущий_уровень × PREMIUM_UPGRADE_COST_TC_PER_LEVEL.
   При достижении уровня >= 10 артефакту присваивается уникальный
   визуальный эффект (visual_effect).
------------------------------------------------------------------------ */
const VISUAL_EFFECTS = ["aurora", "starfall", "phoenix_flame", "void_pulse", "golden_halo"]

function pickVisualEffect(artifactId: number): string {
  const idx = artifactId % VISUAL_EFFECTS.length
  return VISUAL_EFFECTS[idx]
}

router.post("/:id/premium-upgrade", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id)

  if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })
  if (artifact.owner_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому артефакту" })
  }
  if (artifact.level >= PREMIUM_MAX_LEVEL) {
    return res.status(400).json({
      error: `Артефакт уже достиг максимального премиум-уровня (${PREMIUM_MAX_LEVEL})`,
    })
  }

  const cost = premiumUpgradeCost(artifact.level)

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден" })
  if (wallet.timecoin < cost) {
    return res.status(400).json({ error: `Недостаточно ∞ TimeCoin (нужно ${cost})` })
  }

  const isCritical = Math.random() < PREMIUM_CRIT_CHANCE
  const levelGain = isCritical ? 2 : 1
  const newLevel = Math.min(PREMIUM_MAX_LEVEL, artifact.level + levelGain)

  const now = Date.now()
  const statBoost = isCritical ? 1.18 : 1.1 /* критическое усиление даёт больший буст статов */

  const power = Math.round(artifact.power * statBoost)
  const defense = Math.round(artifact.defense * statBoost)
  const magic = Math.round(artifact.magic * statBoost)
  const speed = Math.round(artifact.speed * statBoost)

  const willRankUp = newLevel % 5 === 0 && newLevel > artifact.level
  const nextRarity = willRankUp ? NEXT_RARITY[artifact.rarity] : artifact.rarity
  const rarity = willRankUp && nextRarity ? nextRarity : artifact.rarity

  const visualEffect =
    newLevel >= 10 ? (artifact.visual_effect || pickVisualEffect(artifact.id)) : artifact.visual_effect

  const price = computePrice({
    power,
    defense,
    magic,
    speed,
    rarity,
    views_24h: artifact.views_24h,
    supply: artifact.supply,
  })

  db.prepare(`UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`).run(
    cost,
    now,
    req.user!.userId,
  )

  db.prepare(
    `UPDATE artifacts
     SET level = ?, rarity = ?, power = ?, defense = ?, magic = ?, speed = ?, price = ?, list_currency = ?, visual_effect = ?
     WHERE id = ?`,
  ).run(newLevel, rarity, power, defense, magic, speed, price, LIST_CURRENCY_BY_RARITY[rarity], visualEffect, id)

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'premium_upgrade', ?, 'Кузница Артефактов', ?, 'timecoin', 'done')`,
  ).run(req.user!.userId, artifact.name, cost)

  const updated = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency,
              visual_effect as visualEffect, created_at as createdAt
       FROM artifacts WHERE id = ?`,
    )
    .get(id)

  res.json({
    artifact: updated,
    critical: isCritical,
    levelGain: newLevel - artifact.level,
    cost,
  })
})

export default router


