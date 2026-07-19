import db from '../database';

export function up() {
  console.log('📦 Running migration: 001_initial_schema');

  // Таблица пользователей
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      balance_credits INTEGER DEFAULT 0,
      balance_shards INTEGER DEFAULT 0,
      balance_crystals INTEGER DEFAULT 0,
      balance_tc INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by INTEGER,
      is_verified BOOLEAN DEFAULT 0,
      twofa_secret TEXT,
      twofa_enabled BOOLEAN DEFAULT 0,
      nonce INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referred_by) REFERENCES users(id)
    )
  `);

  // Таблица проектов
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Таблица артефактов
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      rarity TEXT DEFAULT 'common',
      level INTEGER DEFAULT 1,
      stats TEXT,
      price_tc INTEGER DEFAULT 0,
      is_listed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);

  // Таблица транзакций
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount INTEGER NOT NULL,
      fee INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      external_tx_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Таблица ордербука (биржи)
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_book (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      price INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      filled INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Таблица стейкинга
  db.exec(`
    CREATE TABLE IF NOT EXISTS staking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      duration_days INTEGER NOT NULL,
      apy REAL NOT NULL,
      start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_date DATETIME,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Таблица рефералов
  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referee_id INTEGER NOT NULL,
      reward_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (referee_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(referrer_id, referee_id)
    )
  `);

  // Таблица подписок
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      status TEXT DEFAULT 'active',
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Таблица аудит-логов
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Таблица выводов (withdrawals)
  db.exec(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      signature TEXT NOT NULL,
      external_address TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Индексы для ускорения запросов
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_order_book_status ON order_book(status);
    CREATE INDEX IF NOT EXISTS idx_order_book_user_id ON order_book(user_id);
    CREATE INDEX IF NOT EXISTS idx_staking_user_id ON staking(user_id);
    CREATE INDEX IF NOT EXISTS idx_staking_status ON staking(status);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at);
  `);

  console.log('✅ Migration 001_initial_schema completed');
}

export function down() {
  console.log('⬇️ Rolling back: 001_initial_schema');
  db.exec(`
    DROP TABLE IF EXISTS withdrawals;
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS subscriptions;
    DROP TABLE IF EXISTS referrals;
    DROP TABLE IF EXISTS staking;
    DROP TABLE IF EXISTS order_book;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS artifacts;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS users;
  `);
  console.log('✅ Rollback completed');
}

// Автоматический запуск при выполнении файла
if (require.main === module) {
  up();
  console.log('✅ Database schema created successfully!');
}
