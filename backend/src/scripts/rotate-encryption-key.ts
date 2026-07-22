import CryptoJS from "crypto-js"
import fs from "fs"
import Database from "better-sqlite3"

/* ================================================================
   OSGARD · Ротация ENCRYPTION_KEY

   Одноразовый скрипт: перешифровывает users.email и
   users.github_publish_token_encrypted со старого ключа на новый,
   не трогая ничего, пока НЕ убедится, что старый ключ реально
   расшифровывает КАЖДУЮ строку в валидные данные. Если хоть одна
   строка не проходит проверку (например, скрипт уже был запущен
   раньше и данные уже на новом ключе) — выходит с ошибкой без единой
   записи в БД, чтобы не превратить уже-перешифрованные данные в мусор.
   ================================================================ */

const OLD_KEY = process.env.OLD_ENCRYPTION_KEY
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY
const APPLY = process.argv.includes("--apply")
const DB_PATH = process.env.DB_PATH || "/data/osgard.db"

if (!OLD_KEY || !NEW_KEY) {
  console.error("Нужны OLD_ENCRYPTION_KEY и NEW_ENCRYPTION_KEY в окружении")
  process.exit(1)
}
if (OLD_KEY === NEW_KEY) {
  console.error("OLD_ENCRYPTION_KEY и NEW_ENCRYPTION_KEY совпадают — нечего вращать")
  process.exit(1)
}

function safeDecrypt(cipher: string, key: string): string | null {
  try {
    const out = CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8)
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}
const encrypt = (text: string, key: string) => CryptoJS.AES.encrypt(text, key).toString()

const db = new Database(DB_PATH)

type Row = { id: number; email: string | null; github_publish_token_encrypted: string | null }
const rows = db.prepare(`SELECT id, email, github_publish_token_encrypted FROM users`).all() as Row[]

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Plan = { id: number; newEmail?: string; newToken?: string }
const plans: Plan[] = []

for (const row of rows) {
  const plan: Plan = { id: row.id }

  if (row.email) {
    const decrypted = safeDecrypt(row.email, OLD_KEY)
    if (!decrypted || !emailRe.test(decrypted)) {
      console.error(`[user ${row.id}] email не расшифровался в валидный адрес старым ключом — прерываю без единой записи`)
      process.exit(1)
    }
    plan.newEmail = encrypt(decrypted, NEW_KEY)
  }

  if (row.github_publish_token_encrypted) {
    const decrypted = safeDecrypt(row.github_publish_token_encrypted, OLD_KEY)
    if (!decrypted || decrypted.length < 10) {
      console.error(`[user ${row.id}] github-токен не расшифровался старым ключом — прерываю без единой записи`)
      process.exit(1)
    }
    plan.newToken = encrypt(decrypted, NEW_KEY)
  }

  plans.push(plan)
}

const toRotate = plans.filter((p) => p.newEmail || p.newToken)
console.log(`Проверено пользователей: ${rows.length}, к вращению: ${toRotate.length}`)

if (!APPLY) {
  console.log("Dry-run: изменения не применены. Запустите с --apply, чтобы записать в БД.")
  process.exit(0)
}

const backupPath = `${DB_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`
fs.copyFileSync(DB_PATH, backupPath)
console.log(`Бэкап БД сохранён: ${backupPath}`)

const update = db.prepare(
  `UPDATE users SET email = COALESCE(?, email), github_publish_token_encrypted = COALESCE(?, github_publish_token_encrypted) WHERE id = ?`,
)
const tx = db.transaction((items: Plan[]) => {
  for (const p of items) {
    if (p.newEmail || p.newToken) {
      update.run(p.newEmail ?? null, p.newToken ?? null, p.id)
    }
  }
})
tx(toRotate)

console.log(`Готово: перешифровано записей — ${toRotate.length}. Бэкап старой БД: ${backupPath}`)
