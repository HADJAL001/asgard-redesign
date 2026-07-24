/**
 * Seed тестового пользователя в реальную БД (better-sqlite3)
 * Email: test@osgard.com / Password: Test1234!
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, './data/osgard.db');

async function seed() {
  const db = new Database(DB_PATH);

  // Показываем таблицы
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('Tables:', tables.map(t => t.name).join(', '));

  const email = 'test@osgard.com';
  const username = 'TestUser';
  const password = 'Test1234!';

  // Проверяем существует ли
  const existing = db.prepare('SELECT id, username, email FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) {
    console.log(`\nПользователь уже существует: id=${existing.id} username=${existing.username}`);
    console.log('Обновляю пароль...');
    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
    console.log('✅ Пароль обновлён');
    console.log(`\nВход: email="${email}" / password="${password}"`);
    db.close();
    return;
  }

  const hash = await bcrypt.hash(password, 12);

  // INSERT по реальной схеме БД
  try {
    db.prepare(`
      INSERT INTO users (username, email, password_hash, balance_credits, balance_shards, balance_crystals, balance_tc, referral_code, role)
      VALUES (?, ?, ?, 50000, 2000, 100, 5000, 'TESTUSER', 'user')
    `).run(username, email, hash);
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const userId = user.id;

    console.log(`\n✅ Тестовый пользователь создан!`);
    console.log(`   ID:       ${userId}`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Username: ${username}`);
    console.log(`\n   Войдите через: email="${email}" / password="${password}"`);
  } catch(e) {
    console.log('INSERT error:', e.message);
  }

  db.close();
}

seed().catch(console.error);
