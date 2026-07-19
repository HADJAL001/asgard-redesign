import db from "../lib/db"
import { hashPassword } from "../lib/auth"

/* ================================================================
   OSGARD DB SCHEMA — SQLite (better-sqlite3, raw SQL)
   ================================================================ */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  avatar_url TEXT,
  bio TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credits REAL NOT NULL DEFAULT 0,
  shards REAL NOT NULL DEFAULT 0,
  crystals REAL NOT NULL DEFAULT 0,
  timecoin REAL NOT NULL DEFAULT 0,
  cash_usd REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  badge TEXT,
  artifact_count INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  income REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  rarity TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  power INTEGER NOT NULL,
  defense INTEGER NOT NULL,
  magic INTEGER NOT NULL,
  speed INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'kept',
  views_24h INTEGER NOT NULL DEFAULT 0,
  supply INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  list_currency TEXT NOT NULL DEFAULT 'credits',
  visual_effect TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);


CREATE TABLE IF NOT EXISTS marketplace_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'credits',
  status TEXT NOT NULL DEFAULT 'active',
  listed_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  sold_at INTEGER,
  buyer_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  item TEXT,
  counterparty TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'credits',
  status TEXT NOT NULL DEFAULT 'done',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS tc_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tc_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ts INTEGER NOT NULL,
  price REAL NOT NULL,
  amount REAL NOT NULL,
  side TEXT NOT NULL,
  maker_order_id INTEGER REFERENCES tc_orders(id) ON DELETE SET NULL,
  taker_order_id INTEGER REFERENCES tc_orders(id) ON DELETE SET NULL,
  buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  origin TEXT NOT NULL DEFAULT 'market'
);

CREATE TABLE IF NOT EXISTS tc_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  price REAL NOT NULL,
  amount REAL NOT NULL,
  filled_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS tc_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount_tc REAL NOT NULL,
  amount_usd REAL NOT NULL,
  price REAL NOT NULL,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_tc REAL NOT NULL,
  days INTEGER NOT NULL,
  apr REAL NOT NULL,
  market_fee REAL NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS tc_market_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  price REAL NOT NULL,
  minted REAL NOT NULL,
  burned REAL NOT NULL,
  staked REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS hall_of_fame (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
  artifact_name TEXT NOT NULL,
  type TEXT NOT NULL,
  rarity TEXT NOT NULL,
  architect TEXT NOT NULL,
  price REAL NOT NULL,
  achieved_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_owner ON artifacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tctx_user ON tc_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_stakes_user ON stakes(user_id);
`)

/* ---------------- Seed baseline TC market state ---------------- */
const TC_START_PRICE = 12.4
const TC_MINTED = 900_000
const TC_BURNED_BASE = 96_400
const TC_STAKED_BASE = 240_000

const marketExists = db.prepare(`SELECT id FROM tc_market_state WHERE id = 1`).get()
if (!marketExists) {
  db.prepare(
    `INSERT INTO tc_market_state (id, price, minted, burned, staked) VALUES (1, ?, ?, ?, ?)`,
  ).run(TC_START_PRICE, TC_MINTED, TC_BURNED_BASE, TC_STAKED_BASE)
  db.prepare(`INSERT INTO tc_price_history (ts, price) VALUES (?, ?)`).run(Date.now(), TC_START_PRICE)
}

/* ---------------- Seed demo user "Alex Odin" ---------------- */
const demoExists = db.prepare(`SELECT id FROM users WHERE username = ?`).get("alex_odin")
if (!demoExists) {
  const passwordHash = hashPassword("password123")
  const info = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, display_name, level, avatar_url, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "alex_odin",
      "alex@osgard.io",
      passwordHash,
      "Alex Odin",
      12,
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80",
      "Архитектор вселенной. Строю миры из кода и идей.",
    )
  const userId = info.lastInsertRowid as number

  db.prepare(
    `INSERT INTO wallets (user_id, credits, shards, crystals, timecoin, cash_usd) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, 48_500, 320, 86, 74_310, 5_000)

  const projectSeed = [
    { name: "Nebula Core", description: "Нейросетевой движок рендеринга", badge: "brain", artifactCount: 12, sold: 3, income: 4800 },
    { name: "Valkyrie UI", description: "Дизайн-система следующего поколения", badge: "layers", artifactCount: 7, sold: 2, income: 3100 },
    { name: "Orbital API", description: "Распределённый шлюз данных", badge: "orbit", artifactCount: 9, sold: 4, income: 6400 },
    { name: "Photon Grid", description: "Визуализация квантовых потоков", badge: "zap", artifactCount: 5, sold: 1, income: 1500 },
    { name: "Helios Auth", description: "Биометрическая система доступа", badge: "shieldcheck", artifactCount: 6, sold: 0, income: 0 },
    { name: "Aether Mesh", description: "Сеть периферийных вычислений", badge: "network", artifactCount: 8, sold: 2, income: 2900 },
  ]
  const insertProject = db.prepare(
    `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const projectIds: number[] = []
  for (const p of projectSeed) {
    const r = insertProject.run(userId, p.name, p.description, p.badge, p.artifactCount, p.sold, p.income)
    projectIds.push(r.lastInsertRowid as number)
  }

  const artifactSeed = [
    { name: "Нейронный процессор", type: "neural", rarity: "legendary", level: 12, power: 84, defense: 32, magic: 71, speed: 45, status: "listed", projectIdx: 0, views: 100, supply: 5 },
    { name: "Молния Тора", type: "weapon", rarity: "epic", level: 9, power: 76, defense: 20, magic: 48, speed: 62, status: "listed", projectIdx: 3, views: 60, supply: 8 },
    { name: "Эгида Валькирии", type: "shield", rarity: "epic", level: 11, power: 22, defense: 88, magic: 34, speed: 18, status: "kept", projectIdx: 4, views: 30, supply: 9 },
    { name: "Артефакт Одина", type: "artifact", rarity: "mythic", level: 20, power: 90, defense: 60, magic: 88, speed: 55, status: "kept", projectIdx: 2, views: 200, supply: 3 },
    { name: "Нейросеть Локи", type: "neural", rarity: "common", level: 6, power: 34, defense: 18, magic: 40, speed: 52, status: "kept", projectIdx: 0, views: 20, supply: 12 },
    { name: "Щит Хеймдалля", type: "shield", rarity: "common", level: 5, power: 12, defense: 64, magic: 20, speed: 15, status: "kept", projectIdx: 4, views: 15, supply: 14 },
    { name: "Кристалл Асгарда", type: "crystal", rarity: "epic", level: 13, power: 50, defense: 44, magic: 78, speed: 40, status: "sold", projectIdx: 1, views: 90, supply: 7 },
    { name: "Копьё Гунгнир", type: "weapon", rarity: "epic", level: 10, power: 80, defense: 24, magic: 50, speed: 66, status: "kept", projectIdx: 3, views: 40, supply: 10 },
  ]
  const listCurrencyByRarity: Record<string, string> = {
    common: "credits",
    rare: "shards",
    epic: "shards",
    legendary: "crystals",
    mythic: "timecoin",
  }
  const rarityMult: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 }
  const insertArtifact = db.prepare(
    `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed, status, views_24h, supply, price, list_currency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const a of artifactSeed) {
    const statSum = a.power + a.defense + a.magic + a.speed
    const base = statSum * 5
    const afterRarity = base * rarityMult[a.rarity]
    const afterRating = afterRarity * (1 + 12 / 100)
    const demand = Math.max(1, Math.round(a.views / 10))
    const price = Math.round(afterRating * (demand / Math.max(1, a.supply)))
    insertArtifact.run(
      userId,
      projectIds[a.projectIdx],
      a.name,
      a.type,
      a.rarity,
      a.level,
      a.power,
      a.defense,
      a.magic,
      a.speed,
      a.status,
      a.views,
      a.supply,
      price,
      listCurrencyByRarity[a.rarity],
    )
  }

  console.log(`Seed created: user "alex_odin" / password "password123" (id=${userId})`)
}

console.log("OSGARD database initialized at", process.env.DB_PATH || "./data/osgard.db")
