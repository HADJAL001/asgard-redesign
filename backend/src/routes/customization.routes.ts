import { Router, Response, NextFunction } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { AddonProduct, hasActiveAddon } from "../lib/addons"
import { asyncHandler } from "../utils/async-handler"

/* ================================================================
   OSGARD CUSTOMIZATION ROUTES — кастомные преображения ДЖАРВИС/ВАЛЛИ

   Доступно только при активной Premium-подписке на соответствующий
   продукт (см. lib/addons.ts hasActiveAddon). Часть вариантов темы/
   голоса разблокируется сразу с Premium, часть — за прогресс
   (addon_customization_unlocks, см. migration 057).
   ================================================================ */

const router = Router()

function productAddonKey(product: string): "jarvis_premium" | "walli_premium" | null {
  if (product === "jarvis") return "jarvis_premium"
  if (product === "walli") return "walli_premium"
  return null
}

function requireProductAddon(req: AuthRequest, res: Response, next: NextFunction) {
  const product = req.params.product
  const addonKey = productAddonKey(product)
  if (!addonKey) {
    return res.status(400).json({ error: "Некорректный продукт. Допустимые значения: jarvis, walli" })
  }
  if (!req.user) {
    return res.status(401).json({ error: "Требуется авторизация" })
  }
  if (!hasActiveAddon(req.user.userId, addonKey)) {
    return res.status(403).json({ error: `Требуется активная подписка: ${addonKey}.`, addonKey })
  }
  next()
}

type CustomizationRow = {
  id: number
  user_id: number
  product: AddonProduct
  custom_name: string | null
  theme_key: string | null
  voice_key: string | null
  updated_at: number
}

type UnlockRow = {
  option_type: "theme" | "voice"
  option_key: string
  unlocked_at: number
}

/* ================================================================
   GET /addons/customization/:product
   Возвращает текущее преображение и список разблокированных вариантов.
   ================================================================ */
router.get("/:product", requireAuth, requireProductAddon, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const product = req.params.product as AddonProduct

  const customization = db
    .prepare(`SELECT * FROM addon_customizations WHERE user_id = ? AND product = ?`)
    .get(userId, product) as CustomizationRow | undefined

  const unlocks = db
    .prepare(`SELECT option_type, option_key, unlocked_at FROM addon_customization_unlocks WHERE user_id = ? AND product = ?`)
    .all(userId, product) as UnlockRow[]

  res.json({
    product,
    customization: {
      customName: customization?.custom_name ?? null,
      themeKey: customization?.theme_key ?? null,
      voiceKey: customization?.voice_key ?? null,
    },
    unlocks,
  })
})

/* ================================================================
   PUT /addons/customization/:product
   body: { customName?, themeKey?, voiceKey? }

   themeKey/voiceKey должны быть либо null, либо присутствовать среди
   разблокированных вариантов пользователя (addon_customization_unlocks).
   ================================================================ */
router.put("/:product", requireAuth, requireProductAddon, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const product = req.params.product as AddonProduct
  const { customName, themeKey, voiceKey } = req.body || {}

  const isUnlocked = (optionType: "theme" | "voice", optionKey: string): boolean => {
    const row = db
      .prepare(
        `SELECT id FROM addon_customization_unlocks WHERE user_id = ? AND product = ? AND option_type = ? AND option_key = ?`,
      )
      .get(userId, product, optionType, optionKey)
    return !!row
  }

  if (themeKey != null && !isUnlocked("theme", themeKey)) {
    return res.status(403).json({ error: `Тема '${themeKey}' ещё не разблокирована.` })
  }
  if (voiceKey != null && !isUnlocked("voice", voiceKey)) {
    return res.status(403).json({ error: `Голос '${voiceKey}' ещё не разблокирован.` })
  }
  if (customName != null && (typeof customName !== "string" || customName.length > 40)) {
    return res.status(400).json({ error: "Имя должно быть строкой до 40 символов." })
  }

  const existing = db
    .prepare(`SELECT * FROM addon_customizations WHERE user_id = ? AND product = ?`)
    .get(userId, product) as CustomizationRow | undefined
  const now = Date.now()

  if (!existing) {
    db.prepare(
      `INSERT INTO addon_customizations (user_id, product, custom_name, theme_key, voice_key, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, product, customName ?? null, themeKey ?? null, voiceKey ?? null, now)
  } else {
    db.prepare(
      `UPDATE addon_customizations SET custom_name = ?, theme_key = ?, voice_key = ?, updated_at = ? WHERE user_id = ? AND product = ?`,
    ).run(
      customName !== undefined ? customName : existing.custom_name,
      themeKey !== undefined ? themeKey : existing.theme_key,
      voiceKey !== undefined ? voiceKey : existing.voice_key,
      now,
      userId,
      product,
    )
  }

  const updated = db
    .prepare(`SELECT * FROM addon_customizations WHERE user_id = ? AND product = ?`)
    .get(userId, product) as CustomizationRow

  res.json({
    product,
    customization: {
      customName: updated.custom_name,
      themeKey: updated.theme_key,
      voiceKey: updated.voice_key,
    },
  })
}))

export default router
