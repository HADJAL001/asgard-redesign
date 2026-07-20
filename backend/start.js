// backend/start.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'osgard.db');
const dbDir = path.dirname(dbPath);

// Создаём директорию если нет
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Запускаем init-db если БД не существует
if (!fs.existsSync(dbPath)) {
  console.log('📦 БД не найдена, запускаю init-db...');
  try {
    execFileSync(process.execPath, [
      '--experimental-sqlite',
      path.join(__dirname, 'dist', 'scripts', 'init-db.js')
    ], { stdio: 'inherit' });
    console.log('✅ БД инициализирована');
  } catch (err) {
    console.error('❌ Ошибка init-db:', err.message);
    process.exit(1);
  }
} else {
  console.log('✅ БД найдена:', dbPath);
}

// Запускаем сервер (уже запущены с флагом --experimental-sqlite через railway.toml)
console.log('🚀 Запуск сервера...');
require('./dist/server.js');
