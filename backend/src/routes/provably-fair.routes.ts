import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import {
  getPublicCommit,
  setClientSeed,
  rotateSeed,
  getRecentRolls,
  verifyFloats,
  normalizeClientSeed,
  ProvablyFairError,
} from "../lib/provably-fair"

/* ================================================================
   OSGARD · Provably-fair API — честно проверяемая гача.
   ----------------------------------------------------------------
   Стартовые артефакты проекта минтятся с provably-fair статами и
   роллом редкости (см. lib/project-generation.ts → insertStarterArtifacts,
   lib/provably-fair.ts). Эти эндпоинты дают игроку весь инструментарий
   доверия:
     • GET  /commit       — текущий commit (server_seed_hash + client_seed
                            + nonce) и раскрытый прошлый seed;
     • POST /client-seed  — задать свою энтропию (client_seed);
     • POST /rotate       — РАСКРЫТЬ текущий server_seed и начать новый
                            (после этого прошлые броски проверяемы);
     • GET  /rolls        — леджер своих бросков (входы + результаты);
     • GET  /verify       — ЧИСТЫЙ пересчёт float'ов из переданных входов
                            (recompute; не смотрит в БД) — доказательство.

   Все под requireAuth: игрок оперирует своей сид-цепочкой. /verify —
   тоже под auth, но расчёт полностью независим от сохранённого результата:
   игрок подставляет раскрытый server_seed и убеждается, что дом не мухлевал.
   ================================================================ */

const router = Router()

/* ---------------- GET /provably-fair/commit ---------------- */
router.get("/commit", requireAuth, (req: AuthRequest, res) => {
  const commit = getPublicCommit(req.user!.userId)
  res.json({ commit })
})

/* ---------------- POST /provably-fair/client-seed ----------------
   Body: { clientSeed: string }  (1..64 печатаемых ASCII-символов) */
router.post("/client-seed", requireAuth, (req: AuthRequest, res) => {
  try {
    const commit = setClientSeed(req.user!.userId, req.body?.clientSeed)
    res.json({ commit })
  } catch (err) {
    if (err instanceof ProvablyFairError) {
      return res.status(err.status).json({ error: err.message, code: "PF_BAD_CLIENT_SEED" })
    }
    throw err
  }
})

/* ---------------- POST /provably-fair/rotate ----------------
   Раскрывает текущий server_seed (для проверки истории) и стартует новый. */
router.post("/rotate", requireAuth, (req: AuthRequest, res) => {
  const result = rotateSeed(req.user!.userId)
  res.json(result)
})

/* ---------------- GET /provably-fair/rolls?limit=30 ---------------- */
router.get("/rolls", requireAuth, (req: AuthRequest, res) => {
  const limitRaw = Number(req.query.limit)
  const limit = Number.isFinite(limitRaw) ? limitRaw : 30
  const rolls = getRecentRolls(req.user!.userId, limit)
  res.json({ rolls })
})

/* ---------------- GET /provably-fair/verify ----------------
   Query: serverSeed, clientSeed, nonce, purpose, count?
   Чистый пересчёт — recompute float'ов из открытых входов. Не читает БД,
   не зависит от аккаунта: любой с раскрытым server_seed воспроизведёт бросок. */
router.get("/verify", requireAuth, (req: AuthRequest, res) => {
  const serverSeed = typeof req.query.serverSeed === "string" ? req.query.serverSeed : ""
  const clientSeedRaw = typeof req.query.clientSeed === "string" ? req.query.clientSeed : ""
  const purpose = typeof req.query.purpose === "string" ? req.query.purpose : ""
  const nonce = Number(req.query.nonce)
  const countRaw = Number(req.query.count)
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.min(64, Math.floor(countRaw)) : 1

  // serverSeed: 64 hex (32 байта) — раскрытый секрет. Мягкая валидация формата.
  if (!/^[0-9a-fA-F]{64}$/.test(serverSeed)) {
    return res.status(400).json({ error: "serverSeed: 64 hex-символа", code: "PF_BAD_SERVER_SEED" })
  }
  const clientSeed = normalizeClientSeed(clientSeedRaw)
  if (!clientSeed) {
    return res.status(400).json({ error: "clientSeed: 1..64 печатаемых ASCII", code: "PF_BAD_CLIENT_SEED" })
  }
  if (!Number.isFinite(nonce) || nonce < 0) {
    return res.status(400).json({ error: "nonce: неотрицательное целое", code: "PF_BAD_NONCE" })
  }
  if (!purpose) {
    return res.status(400).json({ error: "purpose обязателен", code: "PF_BAD_PURPOSE" })
  }

  const floats = verifyFloats(serverSeed, clientSeed, Math.floor(nonce), purpose, count)
  res.json({ floats, serverSeed, clientSeed, nonce: Math.floor(nonce), purpose, count })
})

export default router
