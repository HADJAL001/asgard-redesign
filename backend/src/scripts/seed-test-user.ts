/**
 * Seed script — создаёт тестового пользователя в SQLite БД.
 * Запуск: npx ts-node src/scripts/seed-test-user.ts
 *
 * Тестовый аккаунт:
 *   Email:    test@osgard.com
 *   Password: Test1234!
 */

import bcrypt from 'bcryptjs'
import db from '../lib/db'

async function seed() {
  const email = 'test@osgard.com'
  const username = 'TestUser'
  const password = 'Test1234!'

  const passwordHash = await bcrypt.hash(password, 12)

  // Проверяем существует ли уже
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    console.log(`✓ Пользователь ${email} уже существует (id=${(existing as any).id})`)
    return
  }

  // Создаём пользователя
  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, display_name, onboarding_step, onboarding_completed, created_at)
    VALUES (?, ?, ?, ?, 5, 1, ?)
  `)
  const result = insertUser.run(username, email, passwordHash, 'Test Osgard', Date.now())
  const userId = result.lastInsertRowid as number

  // Создаём кошелёк с богатым балансом
  const insertWallet = db.prepare(`
    INSERT OR IGNORE INTO wallets (user_id, cash_usd, timecoin, credits, shards, crystals)
    VALUES (?, 10000, 5000, 50000, 2000, 100)
  `)
  insertWallet.run(userId)

  // Создаём реферальный код
  try {
    const insertRef = db.prepare(`
      INSERT OR IGNORE INTO referrals (user_id, referral_code, created_at)
      VALUES (?, ?, ?)
    `)
    insertRef.run(userId, `TEST${userId}`, Date.now())
  } catch {}

  console.log(`✅ Тестовый пользователь создан!`)
  console.log(`   ID:       ${userId}`)
  console.log(`   Email:    ${email}`)
  console.log(`   Password: ${password}`)
  console.log(`   Кошелёк:  $10000 · 5000 ∞ · 50000 credits · 2000 shards · 100 crystals`)
}

seed().catch(console.error)
