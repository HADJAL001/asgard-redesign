import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · Контракт выдачи сессии
   ----------------------------------------------------------------
   Ловит класс дефекта, который реально дожил до прода: соц-вход
   (Google/GitHub) выдавал refresh-токен через
   AuthService.generateRefreshToken() — stateless JWT, который НЕ
   попадает в таблицу refresh_tokens. POST /auth/refresh ищет токен по
   token_hash, не находит строку, отвечает "invalid" — и пользователя
   выбрасывало на /login ровно через 15 минут (когда истекал
   access-токен). Вход по паролю при этом работал, потому что там
   вызывался RefreshTokenService.issue().

   Ни один существующий тест этого не видел: refresh-flow.test.ts гоняет
   контракт /auth/refresh через регистрацию (правильный путь выдачи), а
   OAuth-путь по HTTP не покрыт — он требует живого провайдера.
   Поэтому проверка статическая: единственный разрешённый способ выдать
   refresh-токен клиенту — RefreshTokenService.issue().
   ================================================================ */

const srcRoot = path.resolve(__dirname, "..")
/** Слои, которые отдают токены клиенту. Именно здесь ошибка становится дефектом прода. */
const SESSION_LAYERS = ["routes", "controllers"]
const FORBIDDEN = /AuthService\s*\.\s*generateRefreshToken\s*\(/

function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectTsFiles(full)
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : []
  })
}

/** Убирает комментарии, чтобы объяснение дефекта в комментарии не считалось дефектом. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

test("детектор рабочий: находит запрещённую выдачу в синтетическом коде", () => {
  // Самопроверка на положительном входе — иначе сломанный детектор молча «зелёный».
  const bad = "const refreshToken = AuthService.generateRefreshToken(user.id);"
  assert.match(stripComments(bad), FORBIDDEN, "детектор обязан ловить прямой вызов")
  assert.match(
    stripComments("const rt = AuthService . generateRefreshToken ( id )"),
    FORBIDDEN,
    "детектор обязан ловить вызов с пробелами",
  )
  assert.doesNotMatch(
    stripComments("// раньше здесь был AuthService.generateRefreshToken()"),
    FORBIDDEN,
    "упоминание в комментарии не должно считаться дефектом",
  )
})

test("сессия выдаётся только через RefreshTokenService.issue (ни одного stateless JWT)", () => {
  const files = SESSION_LAYERS.flatMap((layer) => collectTsFiles(path.join(srcRoot, layer)))
  assert.ok(files.length > 0, "не найдено ни одного файла routes/controllers — проверка бессмысленна")

  const offenders = files.filter((file) => FORBIDDEN.test(stripComments(fs.readFileSync(file, "utf8"))))

  assert.deepEqual(
    offenders.map((f) => path.relative(srcRoot, f)),
    [],
    "refresh-токен обязан выдаваться через RefreshTokenService.issue(): stateless JWT не попадает " +
      "в refresh_tokens, и сессия умрёт через 15 минут",
  )
})

test("OAuth-callback выдаёт stateful refresh-токен", () => {
  const oauth = fs.readFileSync(path.join(srcRoot, "routes", "oauth.routes.ts"), "utf8")
  assert.match(
    stripComments(oauth),
    /RefreshTokenService\s*\.\s*issue\s*\(/,
    "соц-вход обязан выдавать refresh через RefreshTokenService.issue()",
  )
})
