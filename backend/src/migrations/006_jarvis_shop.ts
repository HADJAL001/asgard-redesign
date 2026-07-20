import db from "../lib/db"

/* ================================================================
   Миграция 006 · Магазин аксессуаров ДЖАРВИСА
   ----------------------------------------------------------------
   Таблицы:
   - jarvis_accessories      — каталог аксессуаров (skin/voice/accessory)
   - jarvis_user_accessories — купленные аксессуары пользователя
   ================================================================ */

db.exec(`
  CREATE TABLE IF NOT EXISTS jarvis_accessories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,       -- цена в TimeCoin (∞)
    image TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'accessory', -- 'skin' | 'voice' | 'accessory'
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jarvis_user_accessories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    accessory_id INTEGER NOT NULL,
    equipped INTEGER NOT NULL DEFAULT 0,
    purchased_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (accessory_id) REFERENCES jarvis_accessories(id),
    UNIQUE(user_id, accessory_id)
  );

  CREATE INDEX IF NOT EXISTS idx_jarvis_user_accessories_user ON jarvis_user_accessories(user_id);
`)

/* ---- Seed каталога (если пуст) ---- */
const { count } = db.prepare(`SELECT COUNT(*) as count FROM jarvis_accessories`).get() as { count: number }

if (count === 0) {
  const now = Date.now()
  const insert = db.prepare(`
    INSERT INTO jarvis_accessories (name, description, price, image, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const seed: [string, string, number, string, string][] = [
    ["Голограмма — Синий щит", "Классический синий голографический скин интерфейса", 25, "/jarvis/skins/blue-shield.png", "skin"],
    ["Голограмма — Красная тревога", "Тревожный красный скин для боевого режима", 40, "/jarvis/skins/red-alert.png", "skin"],
    ["Голограмма — Золотой ДЖАРВИС", "Премиальный золотой скин с повышенной яркостью эмиссии", 120, "/jarvis/skins/gold-jarvis.png", "skin"],
    ["Голос — Британский акцент", "Классический голос ДЖАРВИСА с британским акцентом", 60, "/jarvis/voices/british.png", "voice"],
    ["Голос — Женский (Аврора)", "Альтернативный женский голос ИИ-ассистента", 60, "/jarvis/voices/aurora.png", "voice"],
    ["Голос — Робот-бас", "Низкий механический голос", 35, "/jarvis/voices/deep-robot.png", "voice"],
    ["Аксессуар — Наручный проектор", "Анимация наручного голографического проектора", 30, "/jarvis/accessories/wrist-projector.png", "accessory"],
    ["Аксессуар — Световое кольцо", "Светящееся энергетическое кольцо вокруг аватара", 45, "/jarvis/accessories/light-ring.png", "accessory"],
    ["Аксессуар — Частицы данных", "Анимированные частицы данных вокруг чата", 20, "/jarvis/accessories/data-particles.png", "accessory"],
  ]

  for (const [name, description, price, image, type] of seed) {
    insert.run(name, description, price, image, type, now)
  }

}

console.log("[migration 006] jarvis_accessories, jarvis_user_accessories — OK")
