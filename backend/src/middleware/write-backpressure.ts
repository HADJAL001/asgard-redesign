import type { NextFunction, Request, Response } from "express"

/* ================================================================
   OSGARD · Backpressure для записи в SQLite
   ----------------------------------------------------------------
   better-sqlite3 — синхронный, один писатель: параллельных
   записей физически не существует. Без этого gate'а Express продолжает
   принимать и держать открытыми неограниченное число одновременных
   write-запросов, они копятся в очереди исполнения, и когда время
   ожидания превышает клиентский таймаут — массово обрываются как ошибки
   (подтверждено нагрузочным тестом: 79.1% ошибок на concurrency≈810).

   Здесь ограничивается не пропускная способность (её физический предел —
   ~500-570 rps, задан однопоточной записью SQLite), а то, сколько
   запросов одновременно вправе «стоять и ждать» — всё сверх этого
   отклоняется немедленно кодом 503, вместо зависания до тайм-аута.
   ================================================================ */

const MAX_CONCURRENT = Number(process.env.WRITE_QUEUE_MAX_CONCURRENT || 20)
const MAX_DEPTH = Number(process.env.WRITE_QUEUE_MAX_DEPTH || 300)

let inFlight = 0
const waiters: Array<() => void> = []

function admit() {
  inFlight++
}

function release() {
  inFlight--
  const next = waiters.shift()
  if (next) next()
}

export function getWriteQueueStats() {
  return { inFlight, queued: waiters.length }
}

export function writeBackpressure(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next()
  }

  let released = false
  const releaseOnce = () => {
    if (released) return
    released = true
    release()
  }

  const proceed = () => {
    admit()
    res.on("finish", releaseOnce)
    res.on("close", releaseOnce)
    next()
  }

  if (inFlight < MAX_CONCURRENT) {
    return proceed()
  }

  if (waiters.length < MAX_DEPTH) {
    waiters.push(proceed)
    return
  }

  res.status(503).set("Retry-After", "1").json({
    error: "Сервер перегружен записью, повторите запрос через секунду",
    code: "WRITE_QUEUE_FULL",
  })
}
