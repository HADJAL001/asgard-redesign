import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import {
  emptyStyleVector,
  updateStyleVector,
  xpForSample,
  levelForXp,
  styleTagsFromVector,
  generateTwinArtifactWithAi,
  suggestedRentalPrice,
  type StyleVector,
} from "../services/twin.service"

const router = Router()

/* ---------------- helpers ---------------- */

function serializeTwin(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    level: row.level,
    xp: row.xp,
    styleVector: JSON.parse(row.style_vector || "{}"),
    styleTags: JSON.parse(row.style_tags || "[]"),
    trainedSamples: row.trained_samples,
    artifactsCreated: row.artifacts_created,
    isRentable: !!row.is_rentable,
    rentalPriceTc: row.rental_price_tc,
    totalRentalIncome: row.total_rental_income,
    avatarSeed: row.avatar_seed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getOrCreateTwin(userId: number) {
  let row: any = db.prepare(`SELECT * FROM user_twins WHERE user_id = ?`).get(userId)
  if (!row) {
    const now = Date.now()
    const info = db
      .prepare(
        `INSERT INTO user_twins (user_id, name, level, xp, style_vector, style_tags, trained_samples, artifacts_created, is_rentable, rental_price_tc, total_rental_income, avatar_seed, created_at, updated_at)
         VALUES (?, 'Мой Близнец', 1, 0, ?, '[]', 0, 0, 0, 0, 0, ?, ?, ?)`,
      )
      .run(userId, JSON.stringify(emptyStyleVector()), `twin-${userId}-${now}`, now, now)
    row = db.prepare(`SELECT * FROM user_twins WHERE id = ?`).get(Number(info.lastInsertRowid))
  }
  return row
}

/* ---------------- GET /twin/mine — получить (или создать) близнеца текущего пользователя ---------------- */
router.get("/mine", requireAuth, (req: AuthRequest, res) => {
  const row = getOrCreateTwin(req.user!.userId)
  res.json({ twin: serializeTwin(row) })
})

/* ---------------- GET /twin/artifacts — артефакты, созданные близнецом ---------------- */
router.get("/artifacts", requireAuth, (req: AuthRequest, res) => {
  const twin: any = getOrCreateTwin(req.user!.userId)
  const artifacts = db
    .prepare(
      `SELECT id, twin_id as twinId, owner_id as ownerId, name, type, rarity, power, defense, magic, speed,
              style_tag as styleTag, prompt, description, source, created_at as createdAt
       FROM twin_artifacts WHERE twin_id = ? ORDER BY created_at DESC`,
    )
    .all(twin.id)
  res.json({ artifacts })
})

/* ---------------- GET /twin/training — история обучения ---------------- */
router.get("/training", requireAuth, (req: AuthRequest, res) => {
  const twin: any = getOrCreateTwin(req.user!.userId)
  const samples = db
    .prepare(
      `SELECT id, twin_id as twinId, artifact_id as artifactId, source, label, xp_gained as xpGained, created_at as createdAt
       FROM twin_training_samples WHERE twin_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(twin.id)
  res.json({ samples })
})

/* ---------------- POST /twin/train — обучить близнеца на артефакте пользователя ----------------
   Принимает { artifactId } — существующий артефакт пользователя (из artifacts.routes.ts),
   либо { manual: { type, rarity, power, defense, magic, speed, label } } для ручного ввода.
------------------------------------------------------------------------------------------------ */
router.post("/train", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { artifactId, manual } = req.body || {}

  let sample: { power: number; defense: number; magic: number; speed: number; type: string; rarity: string; label: string; artifactRefId: number | null }

  if (artifactId) {
    const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(Number(artifactId))
    if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })
    if (artifact.owner_id !== userId) return res.status(403).json({ error: "Нет доступа к этому артефакту" })

    sample = {
      power: artifact.power,
      defense: artifact.defense,
      magic: artifact.magic,
      speed: artifact.speed,
      type: artifact.type,
      rarity: artifact.rarity,
      label: artifact.name,
      artifactRefId: artifact.id,
    }
  } else if (manual && typeof manual === "object") {
    const { type, rarity, power, defense, magic, speed, label } = manual
    if (!type || !rarity) return res.status(400).json({ error: "Укажите тип и редкость материала" })
    sample = {
      power: Number(power) || 10,
      defense: Number(defense) || 10,
      magic: Number(magic) || 10,
      speed: Number(speed) || 10,
      type: String(type),
      rarity: String(rarity),
      label: typeof label === "string" && label ? label : "Ручной ввод",
      artifactRefId: null,
    }
  } else {
    return res.status(400).json({ error: "Укажите artifactId или manual" })
  }

  const twinRow: any = getOrCreateTwin(userId)
  const currentVector: StyleVector = JSON.parse(twinRow.style_vector || "{}")
  const nextVector = updateStyleVector(currentVector, sample, twinRow.trained_samples)
  const gainedXp = xpForSample(sample.rarity)
  const nextXp = twinRow.xp + gainedXp
  const nextLevel = levelForXp(nextXp)
  const nextTags = styleTagsFromVector(nextVector)
  const now = Date.now()

  db.prepare(
    `UPDATE user_twins SET style_vector = ?, style_tags = ?, trained_samples = trained_samples + 1, xp = ?, level = ?, rental_price_tc = ?, updated_at = ? WHERE id = ?`,
  ).run(
    JSON.stringify(nextVector),
    JSON.stringify(nextTags),
    nextXp,
    nextLevel,
    twinRow.is_rentable ? suggestedRentalPrice(nextLevel) : twinRow.rental_price_tc,
    now,
    twinRow.id,
  )

  db.prepare(
    `INSERT INTO twin_training_samples (twin_id, artifact_id, source, label, xp_gained, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(twinRow.id, sample.artifactRefId, sample.artifactRefId ? "artifact" : "manual", sample.label, gainedXp, now)

  const updated: any = db.prepare(`SELECT * FROM user_twins WHERE id = ?`).get(twinRow.id)

  res.json({
    twin: serializeTwin(updated),
    xpGained: gainedXp,
    leveledUp: nextLevel > twinRow.level,
  })
})

/* ---------------- POST /twin/generate — сгенерировать артефакт в стиле близнеца ----------------
   Принимает { prompt? } — например, текстовый запрос от Джарвиса
   ("Создай артефакт в моём стиле"). Списывает небольшую стоимость в credits.
------------------------------------------------------------------------------------------------- */
const TWIN_GENERATE_COST_CREDITS = 30

router.post("/generate", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { prompt } = req.body || {}

  const twinRow: any = getOrCreateTwin(userId)
  if (twinRow.trained_samples === 0) {
    return res.status(400).json({ error: "Близнец ещё не обучен. Сначала обучите его на своих артефактах." })
  }

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId)
  if (!wallet || wallet.credits < TWIN_GENERATE_COST_CREDITS) {
    return res.status(400).json({ error: `Недостаточно credits (нужно ${TWIN_GENERATE_COST_CREDITS})` })
  }

  const vector: StyleVector = JSON.parse(twinRow.style_vector || "{}")
  const draft = await generateTwinArtifactWithAi(vector, twinRow.level, typeof prompt === "string" ? prompt : undefined)
  const now = Date.now()

  db.prepare(`UPDATE wallets SET credits = credits - ? WHERE user_id = ?`).run(TWIN_GENERATE_COST_CREDITS, userId)

  const info = db
    .prepare(
      `INSERT INTO twin_artifacts (twin_id, owner_id, name, type, rarity, power, defense, magic, speed, style_tag, prompt, description, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      twinRow.id,
      userId,
      draft.name,
      draft.type,
      draft.rarity,
      draft.power,
      draft.defense,
      draft.magic,
      draft.speed,
      draft.styleTag,
      typeof prompt === "string" ? prompt : "",
      draft.description,
      draft.source,
      now,
    )

  db.prepare(`UPDATE user_twins SET artifacts_created = artifacts_created + 1, updated_at = ? WHERE id = ?`).run(now, twinRow.id)

  const createdArtifact = {
    id: Number(info.lastInsertRowid),
    twinId: twinRow.id,
    ownerId: userId,
    ...draft,
    prompt: typeof prompt === "string" ? prompt : "",
    createdAt: now,
  }

  const updatedWallet = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId)

  res.status(201).json({ artifact: createdArtifact, wallet: updatedWallet })
}))

/* ---------------- PATCH /twin/name — переименовать близнеца ---------------- */
router.patch("/name", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { name } = req.body || {}
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите имя" })
  }
  const twinRow: any = getOrCreateTwin(userId)
  const now = Date.now()
  db.prepare(`UPDATE user_twins SET name = ?, updated_at = ? WHERE id = ?`).run(name.trim(), now, twinRow.id)
  const updated = db.prepare(`SELECT * FROM user_twins WHERE id = ?`).get(twinRow.id)
  res.json({ twin: serializeTwin(updated) })
})

/* ---------------- POST /twin/rental/toggle — включить/выключить сдачу в аренду ---------------- */
router.post("/rental/toggle", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { enabled, priceTc } = req.body || {}
  const twinRow: any = getOrCreateTwin(userId)

  if (enabled && twinRow.trained_samples === 0) {
    return res.status(400).json({ error: "Обучите близнеца перед сдачей в аренду" })
  }

  const now = Date.now()
  const nextPrice = typeof priceTc === "number" && priceTc > 0 ? priceTc : suggestedRentalPrice(twinRow.level)

  db.prepare(`UPDATE user_twins SET is_rentable = ?, rental_price_tc = ?, updated_at = ? WHERE id = ?`).run(
    enabled ? 1 : 0,
    nextPrice,
    now,
    twinRow.id,
  )

  const updated = db.prepare(`SELECT * FROM user_twins WHERE id = ?`).get(twinRow.id)
  res.json({ twin: serializeTwin(updated) })
})

/* ---------------- GET /twin/marketplace — список близнецов, доступных для аренды ---------------- */
router.get("/marketplace", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rows = db
    .prepare(
      `SELECT t.id, t.user_id as userId, t.name, t.level, t.style_tags as styleTags,
              t.rental_price_tc as rentalPriceTc, t.artifacts_created as artifactsCreated,
              u.username, u.display_name as displayName
       FROM user_twins t
       JOIN users u ON u.id = t.user_id
       WHERE t.is_rentable = 1 AND t.user_id != ?
       ORDER BY t.level DESC`,
    )
    .all(userId)

  const listings = (rows as any[]).map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    level: r.level,
    styleTags: JSON.parse(r.styleTags || "[]"),
    rentalPriceTc: r.rentalPriceTc,
    artifactsCreated: r.artifactsCreated,
    ownerUsername: r.username,
    ownerDisplayName: r.displayName,
  }))

  res.json({ listings })
})

/* ---------------- POST /twin/rental/rent — арендовать чужого близнеца ---------------- */
router.post("/rental/rent", requireAuth, (req: AuthRequest, res) => {
  const renterId = req.user!.userId
  const { twinId, days } = req.body || {}
  const daysNum = Number(days)

  if (!twinId || !daysNum || daysNum <= 0) {
    return res.status(400).json({ error: "Укажите twinId и days" })
  }

  const twinRow: any = db.prepare(`SELECT * FROM user_twins WHERE id = ?`).get(Number(twinId))
  if (!twinRow) return res.status(404).json({ error: "Близнец не найден" })
  if (!twinRow.is_rentable) return res.status(400).json({ error: "Этот близнец не сдаётся в аренду" })
  if (twinRow.user_id === renterId) return res.status(400).json({ error: "Нельзя арендовать своего близнеца" })

  const totalPrice = Math.round(twinRow.rental_price_tc * daysNum * 100) / 100

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(renterId)
  if (!wallet || wallet.timecoin < totalPrice) {
    return res.status(400).json({ error: "Недостаточно TimeCoin для аренды" })
  }

  const now = Date.now()
  const endsAt = now + daysNum * 86_400_000

  db.prepare(`UPDATE wallets SET timecoin = timecoin - ? WHERE user_id = ?`).run(totalPrice, renterId)
  db.prepare(`UPDATE wallets SET timecoin = timecoin + ? WHERE user_id = ?`).run(totalPrice, twinRow.user_id)
  db.prepare(`UPDATE user_twins SET total_rental_income = total_rental_income + ? WHERE id = ?`).run(totalPrice, twinRow.id)

  const info = db
    .prepare(
      `INSERT INTO twin_rentals (twin_id, owner_id, renter_id, days, total_price_tc, status, started_at, ends_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
    .run(twinRow.id, twinRow.user_id, renterId, daysNum, totalPrice, now, endsAt, now)

  res.status(201).json({
    rental: {
      id: Number(info.lastInsertRowid),
      twinId: twinRow.id,
      ownerId: twinRow.user_id,
      renterId,
      days: daysNum,
      totalPriceTc: totalPrice,
      status: "active",
      startedAt: now,
      endsAt,
    },
  })
})

/* ---------------- GET /twin/rentals/mine — аренды, где я арендатор ---------------- */
router.get("/rentals/mine", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rentals = db
    .prepare(
      `SELECT r.id, r.twin_id as twinId, r.owner_id as ownerId, r.renter_id as renterId, r.days,
              r.total_price_tc as totalPriceTc, r.status, r.started_at as startedAt, r.ends_at as endsAt,
              t.name as twinName, t.level as twinLevel
       FROM twin_rentals r
       JOIN user_twins t ON t.id = r.twin_id
       WHERE r.renter_id = ? ORDER BY r.created_at DESC`,
    )
    .all(userId)
  res.json({ rentals })
})

/* ---------------- GET /twin/rentals/income — аренды моего близнеца (доход) ---------------- */
router.get("/rentals/income", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rentals = db
    .prepare(
      `SELECT r.id, r.twin_id as twinId, r.renter_id as renterId, r.days,
              r.total_price_tc as totalPriceTc, r.status, r.started_at as startedAt, r.ends_at as endsAt,
              u.username as renterUsername
       FROM twin_rentals r
       JOIN user_twins t ON t.id = r.twin_id
       JOIN users u ON u.id = r.renter_id
       WHERE r.owner_id = ? ORDER BY r.created_at DESC`,
    )
    .all(userId)
  res.json({ rentals })
})

export default router
