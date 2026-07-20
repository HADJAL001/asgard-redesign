/**
 * Назначает роль admin существующему пользователю по email, без рестарта сервера.
 * Использование: node set-admin.js user@example.com
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, './data/osgard.db');

function setAdmin(email) {
  if (!email) {
    console.error('Использование: node set-admin.js <email>');
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH);

  const user = db.prepare('SELECT id, username, email, role FROM users WHERE email = ?').get(email);
  if (!user) {
    console.error(`❌ Пользователь с email "${email}" не найден`);
    db.close();
    process.exit(1);
  }

  if (user.role === 'admin') {
    console.log(`ℹ️ Пользователь id=${user.id} (${user.username}) уже admin`);
    db.close();
    return;
  }

  db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(user.id);
  console.log(`✅ Пользователь id=${user.id} (${user.username}, ${user.email}) назначен admin`);

  db.close();
}

const email = process.argv[2];
setAdmin(email);
