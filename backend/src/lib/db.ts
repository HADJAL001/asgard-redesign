import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import dotenv from "dotenv"

dotenv.config()

const dbPath = process.env.DB_PATH || "./data/osgard.db"
const dbDir = path.dirname(dbPath)

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

export const db = new DatabaseSync(dbPath)
db.exec("PRAGMA journal_mode = WAL;")
db.exec("PRAGMA foreign_keys = ON;")
/* Безопасно для single-writer Node-процесса поверх WAL: при отказе ОС теряются
   только последние несинхронизированные транзакции WAL-файла, при падении
   самого процесса данные не теряются. Заметно снижает fsync-нагрузку на
   горячих путях (ордербук, кошельки). */
db.exec("PRAGMA synchronous = NORMAL;")

export default db
