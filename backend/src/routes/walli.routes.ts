import { Router, Request, Response } from 'express'
import db from '../lib/db'
import { authenticate } from '../middleware/auth.middleware'
const requireAuth = authenticate

/* ================================================================
   OSGARD · WALLI Upgrade System Routes
   ================================================================
   Все роуты требуют авторизации (requireAuth).

   Монетизация (цены в USD / TC):
     Способности  : $19 (lv1) / $29 (lv2) / $39 (lv3+)
     Обучение     : $15 (lv1) / $20 (lv2) / $25 (lv3) / $30 (lv4) / $35 (lv5)
     Скины        : $5–$20 USD
     Эксклюзив    : 50 ∞ (TC)
   ================================================================ */

const router = Router()

/* ── Каталог магазина (публично видим) ─────────────────────────── */

const SHOP_CATALOG = [
  // Скины
  { item_key: 'rusty',   item_type: 'skin',      name: 'Ржавый ВАЛЛИ',     price_usd: 5,   price_tc: null },
  { item_key: 'clean',   item_type: 'skin',      name: 'Чистый ВАЛЛИ',     price_usd: 10,  price_tc: null },
  { item_key: 'space',   item_type: 'skin',      name: 'Космический ВАЛЛИ', price_usd: 20,  price_tc: null },
  // Аксессуары
  { item_key: 'antenna', item_type: 'accessory', name: 'Золотая антенна',  price_usd: 8,   price_tc: null },
  { item_key: 'magnet',  item_type: 'accessory', name: 'Магнит-манипулятор', price_usd: 12, price_tc: null },
  { item_key: 'shield',  item_type: 'accessory', name: 'Щит от мусора',    price_usd: 15,  price_tc: null },
  // Эксклюзив
  { item_key: 'genesis', item_type: 'exclusive', name: 'WALLI Genesis',    price_usd: null, price_tc: 50  },
  { item_key: 'legend',  item_type: 'exclusive', name: 'Легендарный ВАЛЛИ', price_usd: null, price_tc: 50 },
]

const ABILITY_UPGRADE_PRICES: Record<number, number> = { 1: 19, 2: 29, 3: 39 }
const abilityPrice = (level: number) => ABILITY_UPGRADE_PRICES[level] ?? 39 + (level - 3) * 10

const TRAINING_PRICES: Record<number, number> = { 1: 15, 2: 20, 3: 25, 4: 30, 5: 35 }

/* ─────────────────────────────────────────────────────────────────
   СПОСОБНОСТИ
   ───────────────────────────────────────────────────────────────── */

/**
 * GET /walli/stats
 * Возвращает все способности + активное обучение + экипированные предметы.
 */
router.get('/stats', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId

  const abilities = db.prepare(`
    SELECT ability_type, level, bonus, updated_at
    FROM walli_abilities
    WHERE user_id = ?
  `).all(userId)

  const training = db.prepare(`
    SELECT id, training_level, start_date, end_date, active
    FROM walli_training
    WHERE user_id = ? AND active = 1
    ORDER BY id DESC LIMIT 1
  `).get(userId)

  const equipped = db.prepare(`
    SELECT item_type, item_key, name
    FROM walli_items
    WHERE user_id = ? AND equipped = 1
  `).all(userId)

  const quests = db.prepare(`
    SELECT quest_type, progress, completed
    FROM walli_quests
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(userId)

  res.json({ abilities, training: training ?? null, equipped, quests })
})

/**
 * POST /walli/upgrade/:ability
 * Улучшить способность на 1 уровень.
 * Body: { payment_confirmed: true } — в продакшне здесь будет Stripe intent.
 */
router.post('/upgrade/:ability', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId
  const { ability } = req.params
  const VALID = ['find_artifacts', 'trade', 'analyze']

  if (!VALID.includes(ability)) {
    return res.status(400).json({ error: 'Invalid ability type' })
  }

  // Получить текущий уровень
  let row = db.prepare(`
    SELECT id, level, bonus FROM walli_abilities
    WHERE user_id = ? AND ability_type = ?
  `).get(userId, ability) as { id: number; level: number; bonus: number } | undefined

  const currentLevel = row ? row.level : 0
  const newLevel = currentLevel + 1
  const price = abilityPrice(newLevel)
  const newBonus = parseFloat((newLevel * 0.05).toFixed(2)) // +5% за уровень

  if (row) {
    db.prepare(`
      UPDATE walli_abilities
      SET level = ?, bonus = ?, updated_at = strftime('%s','now')
      WHERE id = ?
    `).run(newLevel, newBonus, row.id)
  } else {
    db.prepare(`
      INSERT INTO walli_abilities (user_id, ability_type, level, bonus)
      VALUES (?, ?, ?, ?)
    `).run(userId, ability, newLevel, newBonus)
  }

  res.json({
    ok: true,
    ability,
    level: newLevel,
    bonus: newBonus,
    price_usd: price,
    message: `ВАЛЛИ улучшил способность «${ability}» до уровня ${newLevel}. Бонус: +${(newBonus * 100).toFixed(0)}%.`,
  })
})

/* ─────────────────────────────────────────────────────────────────
   ОБУЧЕНИЕ
   ───────────────────────────────────────────────────────────────── */

/**
 * POST /walli/train/:level
 * Запустить новое обучение (уровень 1–5).
 * Если уже есть активное обучение — возвращает ошибку.
 */
router.post('/train/:level', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId
  const level = parseInt(req.params.level, 10)

  if (isNaN(level) || level < 1 || level > 5) {
    return res.status(400).json({ error: 'Training level must be between 1 and 5' })
  }

  const active = db.prepare(`
    SELECT id FROM walli_training WHERE user_id = ? AND active = 1
  `).get(userId)

  if (active) {
    return res.status(409).json({ error: 'Already has active training. Complete it first.' })
  }

  // Длительность обучения: level * 24 часа (в секундах)
  const durationSec = level * 24 * 3600
  const startDate = Math.floor(Date.now() / 1000)
  const endDate = startDate + durationSec

  const result = db.prepare(`
    INSERT INTO walli_training (user_id, training_level, start_date, end_date, active)
    VALUES (?, ?, ?, ?, 1)
  `).run(userId, level, startDate, endDate)

  res.json({
    ok: true,
    training_id: result.lastInsertRowid,
    training_level: level,
    start_date: startDate,
    end_date: endDate,
    price_usd: TRAINING_PRICES[level],
    message: `ВАЛЛИ начал обучение уровня ${level}. Завершится через ${level * 24}ч.`,
  })
})

/**
 * GET /walli/training/status
 * Статус активного обучения.
 */
router.get('/training/status', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId
  const now = Math.floor(Date.now() / 1000)

  const training = db.prepare(`
    SELECT id, training_level, start_date, end_date, active
    FROM walli_training
    WHERE user_id = ? AND active = 1
    ORDER BY id DESC LIMIT 1
  `).get(userId) as { id: number; training_level: number; start_date: number; end_date: number; active: number } | undefined

  if (!training) {
    return res.json({ active: false, training: null })
  }

  // Авто-завершение если истекло время
  if (training.end_date && now >= training.end_date) {
    db.prepare(`UPDATE walli_training SET active = 0 WHERE id = ?`).run(training.id)
    return res.json({
      active: false,
      completed: true,
      training_level: training.training_level,
      message: 'Обучение завершено! ВАЛЛИ стал умнее.',
    })
  }

  const remaining = training.end_date - now
  res.json({
    active: true,
    training,
    remaining_sec: remaining,
    progress_pct: Math.floor(((now - training.start_date) / (training.end_date - training.start_date)) * 100),
  })
})

/* ─────────────────────────────────────────────────────────────────
   КВЕСТЫ
   ───────────────────────────────────────────────────────────────── */

/**
 * GET /walli/quests
 * Список квестов пользователя (последние 20).
 */
router.get('/quests', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId

  const quests = db.prepare(`
    SELECT id, quest_type, progress, completed, created_at, completed_at
    FROM walli_quests
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId)

  // Если квестов нет — выдаём стартовые
  if ((quests as any[]).length === 0) {
    const starterQuests = [
      { type: 'first_artifact',  label: 'Создай первый артефакт' },
      { type: 'first_stake',     label: 'Заработай первые ∞ через стейкинг' },
      { type: 'first_trade',     label: 'Заверши первую сделку на маркете' },
      { type: 'walli_upgrade',   label: 'Прокачай ВАЛЛИ до уровня 2' },
      { type: 'invite_friend',   label: 'Пригласи друга по реферальной ссылке' },
    ]
    const stmt = db.prepare(`INSERT INTO walli_quests (user_id, quest_type) VALUES (?, ?)`)
    for (const q of starterQuests) {
      stmt.run(userId, q.type)
    }
    return res.json(db.prepare(
      `SELECT id, quest_type, progress, completed FROM walli_quests WHERE user_id = ?`
    ).all(userId))
  }

  res.json(quests)
})

/**
 * POST /walli/quest/:id/complete
 * Отметить квест как выполненный.
 */
router.post('/quest/:id/complete', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId
  const questId = parseInt(req.params.id, 10)

  const quest = db.prepare(`
    SELECT id, completed FROM walli_quests WHERE id = ? AND user_id = ?
  `).get(questId, userId) as { id: number; completed: number } | undefined

  if (!quest) {
    return res.status(404).json({ error: 'Quest not found' })
  }
  if (quest.completed) {
    return res.status(409).json({ error: 'Quest already completed' })
  }

  db.prepare(`
    UPDATE walli_quests
    SET completed = 1, progress = 100, completed_at = strftime('%s','now')
    WHERE id = ?
  `).run(questId)

  res.json({ ok: true, quest_id: questId, message: 'Квест завершён! Бип-бип! 🤖' })
})

/* ─────────────────────────────────────────────────────────────────
   МАГАЗИН ПРЕДМЕТОВ
   ───────────────────────────────────────────────────────────────── */

/**
 * GET /walli/shop
 * Каталог всех предметов + статус "куплен/нет" для текущего пользователя.
 */
router.get('/shop', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId

  const owned = db.prepare(`
    SELECT item_key FROM walli_items WHERE user_id = ?
  `).all(userId) as { item_key: string }[]

  const ownedKeys = new Set(owned.map((o) => o.item_key))

  const catalog = SHOP_CATALOG.map((item) => ({
    ...item,
    owned: ownedKeys.has(item.item_key),
  }))

  res.json({ catalog })
})

/**
 * POST /walli/buy/:item_id
 * Купить предмет из каталога (item_id = item_key).
 */
router.post('/buy/:item_id', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId
  const itemKey = req.params.item_id

  const catalogItem = SHOP_CATALOG.find((i) => i.item_key === itemKey)
  if (!catalogItem) {
    return res.status(404).json({ error: 'Item not found in catalog' })
  }

  const existing = db.prepare(`
    SELECT id FROM walli_items WHERE user_id = ? AND item_key = ?
  `).get(userId, itemKey)

  if (existing) {
    return res.status(409).json({ error: 'Item already owned' })
  }

  db.prepare(`
    INSERT INTO walli_items (user_id, item_type, item_key, name, price_usd, price_tc, equipped)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(userId, catalogItem.item_type, catalogItem.item_key, catalogItem.name, catalogItem.price_usd, catalogItem.price_tc)

  res.json({
    ok: true,
    item: catalogItem,
    message: `Предмет «${catalogItem.name}» куплен! Бип-бип! 🤖`,
  })
})

/**
 * POST /walli/equip/:item_id
 * Надеть предмет (снять остальные того же типа, надеть этот).
 */
router.post('/equip/:item_id', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.userId
  const itemKey = req.params.item_id

  const item = db.prepare(`
    SELECT id, item_type, name FROM walli_items WHERE user_id = ? AND item_key = ?
  `).get(userId, itemKey) as { id: number; item_type: string; name: string } | undefined

  if (!item) {
    return res.status(404).json({ error: 'Item not found or not owned' })
  }

  // Снять все того же типа
  db.prepare(`
    UPDATE walli_items SET equipped = 0 WHERE user_id = ? AND item_type = ?
  `).run(userId, item.item_type)

  // Надеть текущий
  db.prepare(`UPDATE walli_items SET equipped = 1 WHERE id = ?`).run(item.id)

  res.json({
    ok: true,
    equipped: { item_key: itemKey, item_type: item.item_type, name: item.name },
    message: `ВАЛЛИ надел «${item.name}»! Выглядит отлично! 🤖`,
  })
})

export default router
