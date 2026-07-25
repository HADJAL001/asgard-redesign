import db from "./db"

/* ================================================================
   economy-tx — атомарность + идемпотентность денежных операций
   ----------------------------------------------------------------
   Нейтральный фундамент для всех денежных ручек (forge, marketplace,
   wallet-transfer, auctions, stakes, drops, jarvis-shop). Решает два
   системных дефекта, найденных аудитом (см. migration 085):

     • НЕатомарность — «списание + побочные вставки» отдельными
       стейтментами оставляют частичное состояние при исключении.
     • Двойное списание — ретрай/двойной клик списывает дважды.

   Один вход — runEconomyOp() — оборачивает мутацию в ОДНУ синхронную
   better-sqlite3-транзакцию и, если задан Idempotency-Key, делает её
   ровно-однократной: первый успех записывает результат, повтор с тем
   же ключом ВОЗВРАЩАЕТ сохранённый ответ, не трогая деньги.

   Почему это корректно на better-sqlite3:
     • db.transaction(fn)() выполняет fn внутри BEGIN/COMMIT синхронно;
       любое брошенное исключение → ROLLBACK, частичного состояния нет.
     • Запись idempotency-строки идёт В ТОЙ ЖЕ транзакции, что и списание,
       поэтому «отмечено сделанным» и «деньги ушли» коммитятся вместе.
     • Гонка (двойная доставка, в т.ч. с нескольких инстансов поверх одной
       SQLite) разрешается UNIQUE-индексом (user_id, scope, idem_key):
       проигравший INSERT падает по SQLITE_CONSTRAINT, мы это ловим и
       отдаём уже сохранённый ответ победителя — вызывающий не различает.
   ================================================================ */

/** Ошибка бизнес-правила внутри денежной операции (например «недостаточно
 *  средств»). В отличие от неожиданного исключения, несёт HTTP-статус и
 *  безопасное для клиента сообщение. runEconomyOp пробрасывает её наружу
 *  (транзакция откатывается, идемпотентный ключ НЕ пишется — чтобы честный
 *  повтор после пополнения баланса мог пройти). */
export class EconomyError extends Error {
  status: number
  payload?: unknown
  constructor(message: string, status = 400, payload?: unknown) {
    super(message)
    this.name = "EconomyError"
    this.status = status
    this.payload = payload
  }
}

interface RunEconomyOpArgs<T> {
  /** Кто выполняет операцию (владелец идемпотентного ключа). */
  userId: number
  /** Логическая ручка — 'forge', 'market_buy', и т.п. Разделяет ключи ручек. */
  scope: string
  /** Клиентский Idempotency-Key. Пусто/undefined → идемпотентность выключена
   *  (операция всё равно атомарна). */
  idemKey?: string | null
  /** Мутация: выполняется ВНУТРИ транзакции. Должна бросать EconomyError на
   *  нарушение бизнес-правила и вернуть JSON-сериализуемый ответ ручки. */
  mutate: () => T
}

export interface EconomyOpResult<T> {
  result: T
  /** true → это повтор по идемпотентному ключу, деньги НЕ трогались. */
  replayed: boolean
}

/** Нормализованная форма клиентского Idempotency-Key: тримминг + разумный
 *  лимит длины. Пустое/слишком длинное → null (идемпотентность выключена). */
export function normalizeIdemKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const k = raw.trim()
  if (!k || k.length > 200) return null
  return k
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT"
}

/**
 * Выполняет денежную операцию атомарно и (при наличии ключа) идемпотентно.
 *
 * Без ключа: mutate() выполняется в одной транзакции; исключение → полный откат.
 * С ключом: при первом вызове mutate() + запись ключа коммитятся вместе; при
 * повторе с тем же (userId, scope, idemKey) возвращается сохранённый ответ
 * (replayed=true), mutate НЕ выполняется, деньги не трогаются.
 *
 * EconomyError из mutate() пробрасывается как есть (ключ не пишется — откат).
 */
export function runEconomyOp<T>(args: RunEconomyOpArgs<T>): EconomyOpResult<T> {
  const { userId, scope, mutate } = args
  const idemKey = normalizeIdemKey(args.idemKey)

  // Быстрый путь повтора: ключ уже отработал — отдаём сохранённый ответ.
  if (idemKey) {
    const existing = readStoredResponse<T>(userId, scope, idemKey)
    if (existing !== undefined) {
      return { result: existing, replayed: true }
    }
  }

  const tx = db.transaction((): EconomyOpResult<T> => {
    const result = mutate()
    if (idemKey) {
      db.prepare(
        `INSERT INTO idempotency_keys (user_id, scope, idem_key, status, response_json, created_at)
         VALUES (?, ?, ?, 'completed', ?, ?)`
      ).run(userId, scope, idemKey, JSON.stringify(result ?? null), Date.now())
    }
    return { result, replayed: false }
  })

  try {
    return tx()
  } catch (err) {
    // Гонка: параллельная доставка того же ключа успела записать строку первой.
    // Наша транзакция откатилась целиком (включая списание) — отдаём ответ
    // победителя, клиент не различает.
    if (idemKey && isUniqueViolation(err)) {
      const stored = readStoredResponse<T>(userId, scope, idemKey)
      if (stored !== undefined) {
        return { result: stored, replayed: true }
      }
    }
    throw err
  }
}

/** Читает сохранённый ответ идемпотентной операции. undefined → ключа нет. */
function readStoredResponse<T>(userId: number, scope: string, idemKey: string): T | undefined {
  const row = db
    .prepare(`SELECT response_json FROM idempotency_keys WHERE user_id = ? AND scope = ? AND idem_key = ?`)
    .get(userId, scope, idemKey) as { response_json?: string } | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.response_json ?? "null") as T
  } catch {
    return null as unknown as T
  }
}
