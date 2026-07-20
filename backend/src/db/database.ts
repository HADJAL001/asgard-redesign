// Переадресация на основной инстанс БД (node:sqlite)
// Ранее использовал better-sqlite3, теперь унифицировано через lib/db
import db from '../lib/db'

export default db
