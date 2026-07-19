import Database from 'better-sqlite3';
import path from 'path';

// Путь к базе данных
const dbPath = path.join(__dirname, '../../data/osgard.db');
const db = new Database(dbPath);

// Включаем поддержку внешних ключей (для связей между таблицами)
db.pragma('foreign_keys = ON');

// Включаем WAL-режим для лучшей производительности
db.pragma('journal_mode = WAL');

// Включаем синхронный режим для безопасности данных
db.pragma('synchronous = NORMAL');

console.log('✅ Database connected:', dbPath);

export default db;
