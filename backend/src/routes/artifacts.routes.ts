import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { generateAiArtifactContent, computeUniqueHash, ARTIFACT_RARITIES } from "../services/ai-artifact-generator"
import { asyncHandler } from "../utils/async-handler"
import { logAudit } from "../lib/audit"
import { createActivityEvent } from "../lib/activity"
import { addArchitectXp } from "../lib/architect-progression"
import {
  FORGE_MAX_SLOTS,
  computeForgeBonus,
  type EquippedArtifactStats,
} from "../lib/forge-loadout"
import { fuseStats, fusedRarity, fusionHint, MUTATION_CHANCE } from "../lib/artifact-fusion"
import { explainCraftScore, deriveCraftedStats, type GenerationDepth } from "../lib/proof-of-craft"

const router = Router()

const MAX_ARTIFACT_NAME_LENGTH = 100

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
              craft_score as craftScore,
              description, lore, ai_visual as aiVisual, visual_effect as visualEffect, source,
              equipped_at as equippedAt, created_at as createdAt
       FROM artifacts WHERE owner_id = ? ORDER BY created_at DESC`,
    )
    .all(req.user!.userId)

  res.json({ artifacts })
})

/* ---------------- Снаряжение Кузницы (forge loadout) ----------------
   Надетые артефакты (до FORGE_MAX_SLOTS) РЕАЛЬНО усиливают статы и шанс
   редкости артефактов, которые рождаются со следующим проектом
   (см. lib/forge-loadout.ts + insertStarterArtifacts). Экипировка
   бесплатна, обратима и не расходует артефакт.
------------------------------------------------------------------------ */

const LOADOUT_SELECT = `id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
       status, price, list_currency as listCurrency, equipped_at as equippedAt, created_at as createdAt`

/** Собирает полезную нагрузку лоадаута пользователя: надетые артефакты + рассчитанный бонус. */
function loadoutPayload(userId: number) {
  const equipped = db
    .prepare(
      `SELECT ${LOADOUT_SELECT} FROM artifacts
       WHERE owner_id = ? AND equipped_at IS NOT NULL
       ORDER BY equipped_at DESC LIMIT ?`,
    )
    .all(userId, FORGE_MAX_SLOTS) as any[]

  const bonus = computeForgeBonus(equipped as EquippedArtifactStats[])
  return { equipped, bonus, maxSlots: FORGE_MAX_SLOTS }
}

/* ---------------- GET /artifacts/loadout ---------------- */
router.get("/loadout", requireAuth, (req: AuthRequest, res) => {
  res.json(loadoutPayload(req.user!.userId))
})

/* ---------------- POST /artifacts/:id/equip ---------------- */
router.post("/:id/equip", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const userId = req.user!.userId
  const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id)

  if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })
  if (artifact.owner_id !== userId) {
    return res.status(403).json({ error: "Нет доступа к этому артефакту" })
  }
  if (artifact.status !== "kept") {
    return res.status(400).json({ error: "Надеть можно только артефакт, который не выставлен на продажу" })
  }

  // Уже надет → идемпотентно возвращаем текущий лоадаут.
  if (artifact.equipped_at) {
    return res.json({ ...loadoutPayload(userId), equipped_id: id })
  }

  const { count } = db
    .prepare(`SELECT COUNT(*) as count FROM artifacts WHERE owner_id = ? AND equipped_at IS NOT NULL`)
    .get(userId) as { count: number }
  if (count >= FORGE_MAX_SLOTS) {
    return res.status(400).json({
      error: `Все слоты снаряжения заняты (${FORGE_MAX_SLOTS}). Снимите один артефакт, чтобы надеть другой.`,
      code: "LOADOUT_FULL",
    })
  }

  db.prepare(`UPDATE artifacts SET equipped_at = ? WHERE id = ?`).run(Date.now(), id)

  res.json({ ...loadoutPayload(userId), equipped_id: id })
})

/* ---------------- POST /artifacts/:id/unequip ---------------- */
router.post("/:id/unequip", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const userId = req.user!.userId
  const artifact: any = db.prepare(`SELECT id, owner_id, equipped_at FROM artifacts WHERE id = ?`).get(id)

  if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })
  if (artifact.owner_id !== userId) {
    return res.status(403).json({ error: "Нет доступа к этому артефакту" })
  }

  if (artifact.equipped_at) {
    db.prepare(`UPDATE artifacts SET equipped_at = NULL WHERE id = ?`).run(id)
  }

  res.json({ ...loadoutPayload(userId), unequipped_id: id })
})

/* Ковка за ЛЮБУЮ монету, но слабее: чем дешевле/слабее валюта, тем ниже
   множитель характеристик. TimeCoin даёт полную силу (×1.0), а базовые валюты —
   доступный вход с более слабым артефактом. Ключи совпадают с колонками wallets
   (whitelisted — безопасно подставлять в SQL-имя колонки). */
const FORGE_CURRENCIES: Record<string, { cost: number; statMult: number }> = {
  credits: { cost: 200, statMult: 0.4 },
  shards: { cost: 80, statMult: 0.6 },
  crystals: { cost: 30, statMult: 0.85 },
  timecoin: { cost: FORGE_COST_TC, statMult: 1.0 },
}

/* ---------------- POST /artifacts/forge ---------------- */
router.post("/forge", requireAuth, (req: AuthRequest, res) => {
  let { name, type, projectId, currency } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название артефакта" })
  }
  if (name.trim().length > MAX_ARTIFACT_NAME_LENGTH) {
    return res.status(400).json({ error: `Название слишком длинное (макс. ${MAX_ARTIFACT_NAME_LENGTH} символов)` })
  }
  name = name.trim()
  if (!type || typeof type !== "string") {
    return res.status(400).json({ error: "Укажите тип артефакта" })
  }

  let resolvedProjectId: number | null = null
  let craftProject: any = null
  if (projectId !== undefined && projectId !== null && projectId !== "") {
    const project: any = db
      .prepare(
        `SELECT id, generation_depth, ai_source, template_id FROM projects WHERE id = ? AND user_id = ?`,
      )
      .get(Number(projectId), req.user!.userId)
    if (!project) {
      return res.status(404).json({ error: "Проект не найден" })
    }
    resolvedProjectId = project.id
    craftProject = project
  }

  const forgeCurrency = typeof currency === "string" && FORGE_CURRENCIES[currency] ? currency : "timecoin"
  const { cost: forgeCost, statMult } = FORGE_CURRENCIES[forgeCurrency]

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if ((wallet[forgeCurrency] ?? 0) < forgeCost) {
    logAudit(req.user!.userId, "rejected", forgeCost, "insufficient_balance", { action: "forge", currency: forgeCurrency })
    return res.status(400).json({ error: `Недостаточно средств (нужно ${forgeCost} ${forgeCurrency})` })
  }

  /* Proof-of-Craft: статы выводятся детерминированно из реальной субстанции
     проекта (глубина, число файлов, настоящая AI-генерация), а не ГСЧ.
     Куёшь лучшее приложение → лучший артефакт. См. lib/proof-of-craft.ts.
     Множитель валюты сохраняется поверх (слабее монета → слабее артефакт). */
  const fileCount = resolvedProjectId
    ? ((db.prepare(`SELECT COUNT(*) as c FROM project_files WHERE project_id = ?`).get(resolvedProjectId) as any)?.c ?? 0)
    : 0
  const craftBreakdown = explainCraftScore({
    hasProject: !!resolvedProjectId,
    depth: (craftProject?.generation_depth as GenerationDepth) ?? null,
    fileCount,
    aiSource: craftProject?.ai_source ?? null,
    templateId: craftProject?.template_id ?? null,
  })
  const craftScore = craftBreakdown.craftScore
  const crafted = deriveCraftedStats(craftScore, statMult, `${resolvedProjectId ?? "solo"}:${name}`)
  const { power, defense, magic, speed, rarity } = crafted
  const level = 1
  const supply = 1
  const now = Date.now()

  const price = computePrice({ power, defense, magic, speed, rarity, views_24h: 0, supply })

  db.prepare(
    `UPDATE wallets SET ${forgeCurrency} = ${forgeCurrency} - ?, updated_at = ? WHERE user_id = ?`,
  ).run(forgeCost, now, req.user!.userId)

  const info = db
    .prepare(
      `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed, status, views_24h, supply, price, list_currency, craft_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'kept', 0, ?, ?, ?, ?)`,
    )
    .run(
      req.user!.userId,
      resolvedProjectId,
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
      crafted.craftScore,
    )

  if (resolvedProjectId) {
    db.prepare(`UPDATE projects SET artifact_count = artifact_count + 1 WHERE id = ?`).run(resolvedProjectId)
  }

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'forge', ?, 'Кузница Артефактов', ?, ?, 'done')`,
  ).run(req.user!.userId, name, forgeCost, forgeCurrency)
  logAudit(req.user!.userId, "debit", forgeCost, "artifact_forge", { name, currency: forgeCurrency })

  const artifact = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency,
              craft_score as craftScore, created_at as createdAt
       FROM artifacts WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))

  createActivityEvent({
    userId: req.user!.userId,
    type: "artifact_crafted",
    entityType: "artifact",
    entityId: Number(info.lastInsertRowid),
    text: `выковал артефакт «${name}»`,
    metadata: { name, rarity },
  })
  addArchitectXp(req.user!.userId, "artifact_forged")

  // Разбор ковки: показываем, ПОЧЕМУ статы такие — вклад каждого честного
  // сигнала в craftScore. Прозрачность Proof-of-Craft как зрелище, не чёрный
  // ящик. Аддитивно: старые клиенты просто игнорируют поле.
  res.status(201).json({ artifact, craftBreakdown })
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
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (wallet.timecoin < AI_GENERATE_COST_TC) {
    logAudit(req.user!.userId, "rejected", AI_GENERATE_COST_TC, "insufficient_balance", { action: "generate_ai" })
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
  logAudit(req.user!.userId, "debit", AI_GENERATE_COST_TC, "artifact_ai_generate", { name: finalName })

  const artifact = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency,
              description, lore, ai_visual as aiVisual, source, created_at as createdAt
       FROM artifacts WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))

  createActivityEvent({
    userId: req.user!.userId,
    type: "artifact_crafted",
    entityType: "artifact",
    entityId: Number(info.lastInsertRowid),
    text: `сгенерировал ИИ-артефакт «${finalName}»`,
    metadata: { name: finalName, rarity },
  })
  addArchitectXp(req.user!.userId, "artifact_forged")

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
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (wallet.timecoin < cost) {
    logAudit(req.user!.userId, "rejected", cost, "insufficient_balance", { action: "evolve", artifactId: id })
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
  logAudit(req.user!.userId, "debit", cost, "artifact_evolve", { artifactId: id, newLevel, rankUp: willRankUp })

  const updated = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency,
              craft_score as craftScore, created_at as createdAt
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
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (wallet.timecoin < cost) {
    logAudit(req.user!.userId, "rejected", cost, "insufficient_balance", { action: "premium_upgrade", artifactId: id })
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
  logAudit(req.user!.userId, "debit", cost, "artifact_premium_upgrade", { artifactId: id, newLevel, critical: isCritical })

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

/* ---------------- POST /artifacts/fuse ----------------
   Скрещивание двух своих артефактов → AI-потомок. Родители «сжигаются»
   (status='fused'), потомок наследует смешанные статы + новый lore/визуал;
   ~15% шанс мутации (буст статов + редкость на ступень вверх). Цена слияния —
   сами артефакты-родители (сток против инфляции), доп. TC не берём. */
router.post("/fuse", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const aId = Number(req.body?.artifactAId)
  const bId = Number(req.body?.artifactBId)

  if (!Number.isInteger(aId) || !Number.isInteger(bId) || aId <= 0 || bId <= 0) {
    return res.status(400).json({ error: "Укажите artifactAId и artifactBId" })
  }
  if (aId === bId) {
    return res.status(400).json({ error: "Нельзя слить артефакт сам с собой" })
  }

  const loadOwned = (id: number): any =>
    db.prepare(`SELECT * FROM artifacts WHERE id = ? AND owner_id = ?`).get(id, userId)

  const a = loadOwned(aId)
  const b = loadOwned(bId)
  if (!a || !b) return res.status(404).json({ error: "Артефакт не найден или не ваш", code: "ARTIFACT_NOT_FOUND" })
  if (a.status !== "kept" || b.status !== "kept") {
    return res.status(409).json({ error: "Оба артефакта должны быть свободны (не на продаже)", code: "ARTIFACT_BUSY" })
  }

  // Мутация и AI-контент — ДО транзакции (генерация асинхронна; внутри
  // BEGIN IMMEDIATE нельзя await).
  const mutate = Math.random() < MUTATION_CHANCE
  const hint = fusionHint(a, b)
  let generated = await generateAiArtifactContent(hint)
  const nameExists = (name: string): boolean => !!db.prepare(`SELECT id FROM artifacts WHERE name = ?`).get(name)
  let attempts = 1
  while (nameExists(generated.name) && attempts < AI_UNIQUENESS_MAX_ATTEMPTS) {
    generated = await generateAiArtifactContent(hint)
    attempts += 1
  }
  let finalName = generated.name
  if (nameExists(finalName)) finalName = `${generated.name} #${Date.now().toString(36).slice(-4)}`

  const stats = fuseStats(a, b, mutate)
  const rarity = fusedRarity(a.rarity, b.rarity, mutate)
  const now = Date.now()
  const uniqueHash = computeUniqueHash(finalName, now)
  const price = computePrice({ ...stats, rarity, views_24h: 0, supply: 1 })

  let offspringId: number
  db.exec("BEGIN IMMEDIATE")
  try {
    // Условно «сжигаем» обоих родителей — только если всё ещё kept и наши
    // (защита от гонки: параллельное второе слияние/листинг того же артефакта).
    const burnA = db.prepare(`UPDATE artifacts SET status = 'fused' WHERE id = ? AND owner_id = ? AND status = 'kept'`).run(aId, userId)
    const burnB = db.prepare(`UPDATE artifacts SET status = 'fused' WHERE id = ? AND owner_id = ? AND status = 'kept'`).run(bId, userId)
    if (burnA.changes !== 1 || burnB.changes !== 1) {
      db.exec("ROLLBACK")
      return res.status(409).json({ error: "Артефакт уже используется — обновите список", code: "FUSION_CONFLICT" })
    }
    const info = db.prepare(
      `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h, supply, price, list_currency, description, lore, ai_visual, source, unique_hash,
              parent_a_id, parent_b_id, is_mutation)
       VALUES (?, NULL, ?, 'fused', ?, 1, ?, ?, ?, ?, 'kept', 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, finalName, rarity, stats.power, stats.defense, stats.magic, stats.speed,
      price, LIST_CURRENCY_BY_RARITY[rarity], generated.description, generated.lore, generated.visual,
      generated.source, uniqueHash, aId, bId, mutate ? 1 : 0,
    )
    offspringId = Number(info.lastInsertRowid)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }

  logAudit(userId, "debit", 0, "artifact_fusion", { parents: [aId, bId], offspring: offspringId, mutation: mutate })

  const artifact = db.prepare(
    `SELECT id, name, type, rarity, level, power, defense, magic, speed, status, price,
            list_currency as listCurrency, description, lore, ai_visual as aiVisual, source,
            parent_a_id as parentAId, parent_b_id as parentBId, is_mutation as isMutation, created_at as createdAt
     FROM artifacts WHERE id = ?`,
  ).get(offspringId)

  res.status(201).json({ ok: true, mutation: mutate, artifact })
}))

/* ---------------- GET /artifacts/:id/provenance ----------------
   Витрина родословной артефакта — делает петлю созидания видимой и
   разделяемой (публичный read-only, ссылку можно шарить). Три пласта
   провенанса, все из уже существующих данных:

     • creator     — первый кузнец (creator_id, миграция 080).
     • craftScore  — «честность» статов (craft_score, миграция 081);
                     NULL = выковано до Proof-of-Craft (legacy).
     • lineage     — дерево ковки-слияния (parent_a_id/parent_b_id,
                     миграция 078): из каких артефактов скован потомок.
     • ownership   — цепочка перепродаж (marketplace_listings sold):
                     кто через кого владел, сколько раз перепродан.
------------------------------------------------------------------ */
const PROVENANCE_MAX_DEPTH = 6 /* потолок рекурсии дерева предков (защита от глубины/циклов) */

router.get("/:id/provenance", (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: "Некорректный id" })

  // Prepare лениво, ВНУТРИ хендлера: на уровне модуля он бы выполнился при
  // импорте роутов — раньше, чем миграции создадут таблицу artifacts (краш
  // "no such table" на старте). Better-sqlite3 кэширует план сам.
  const provenanceNodeStmt = db.prepare(
    `SELECT id, name, type, rarity, level, power, defense, magic, speed,
            craft_score as craftScore, is_mutation as isMutation,
            parent_a_id as parentAId, parent_b_id as parentBId
     FROM artifacts WHERE id = ?`,
  )

  const root: any = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              craft_score as craftScore, is_mutation as isMutation, status,
              owner_id as ownerId, creator_id as creatorId, created_at as createdAt
       FROM artifacts WHERE id = ?`,
    )
    .get(id)
  if (!root) return res.status(404).json({ error: "Артефакт не найден" })

  const userLite = (uid: number | null | undefined) => {
    if (!uid) return null
    return (
      db.prepare(`SELECT id, username, display_name as displayName FROM users WHERE id = ?`).get(uid) ?? null
    )
  }

  /* Дерево предков через fusion. visited защищает от циклов и повторов;
     глубина ограничена PROVENANCE_MAX_DEPTH. */
  const visited = new Set<number>()
  const buildLineage = (artId: number | null, depth: number): any => {
    if (!artId || depth > PROVENANCE_MAX_DEPTH || visited.has(artId)) return null
    visited.add(artId)
    const node: any = provenanceNodeStmt.get(artId)
    if (!node) return null
    const parents = [
      buildLineage(node.parentAId, depth + 1),
      buildLineage(node.parentBId, depth + 1),
    ].filter(Boolean)
    return {
      id: node.id,
      name: node.name,
      rarity: node.rarity,
      craftScore: node.craftScore,
      isMutation: !!node.isMutation,
      parents,
    }
  }
  const lineage = {
    id: root.id,
    name: root.name,
    rarity: root.rarity,
    craftScore: root.craftScore,
    isMutation: !!root.isMutation,
    parents: [buildLineage(root.id, 0)?.parents ?? []].flat(),
  }

  /* Цепочка владения: реальные перепродажи артефакта (sold-листинги). */
  const sold: any[] = db
    .prepare(
      `SELECT seller_id as sellerId, buyer_id as buyerId, price, currency, sold_at as soldAt
       FROM marketplace_listings
       WHERE artifact_id = ? AND status = 'sold'
       ORDER BY sold_at ASC`,
    )
    .all(id)
  const ownershipChain = sold.map((s) => ({
    seller: userLite(s.sellerId),
    buyer: userLite(s.buyerId),
    price: s.price,
    currency: s.currency,
    soldAt: s.soldAt,
  }))

  res.set("Cache-Control", "public, max-age=10")
  res.json({
    artifact: {
      id: root.id,
      name: root.name,
      type: root.type,
      rarity: root.rarity,
      level: root.level,
      power: root.power,
      defense: root.defense,
      magic: root.magic,
      speed: root.speed,
      craftScore: root.craftScore, // null → выковано до Proof-of-Craft (legacy)
      isMutation: !!root.isMutation,
      status: root.status,
      createdAt: root.createdAt,
    },
    creator: userLite(root.creatorId),
    currentOwner: userLite(root.ownerId),
    lineage,
    ownershipChain,
    resaleCount: ownershipChain.length,
  })
})

export default router


