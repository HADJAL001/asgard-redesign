import db from "./db"

/* ================================================================
   OSGARD · Публичный «Зал редчайших» (/rarest)
   ----------------------------------------------------------------
   В отличие от старого hall-of-fame (доход/цена, halloffame.routes.ts),
   этот зал ранжирует по craftScore — честному Proof-of-Craft сигналу
   (081_proof_of_craft.ts), а не по денежному успеху. Артефакт без
   craft_score (grandfathered legacy) в рейтинге не участвует — ему
   нечем честно похвастаться.

   Публичная сериализация отдаёт только display-имя владельца
   (username/display_name — тот же паттерн, что certificate.ts:
   holderNameOf), никогда сырой owner_id/email.
   ================================================================ */

export interface RarestArtifactRow {
  id: number
  name: string
  type: string
  rarity: string
  craft_score: number
  visual_theme: string | null
  created_at: number
  username: string | null
  display_name: string | null
}

export interface PublicRarestArtifact {
  id: number
  name: string
  type: string
  rarity: string
  craftScore: number
  archetype: string | null
  palette: { primary: string; accent: string } | null
  createdAt: number
  holderHandle: string | null
}

function parseVisualTheme(raw: string | null): { archetype: string | null; palette: PublicRarestArtifact["palette"] } {
  if (!raw) return { archetype: null, palette: null }
  try {
    const parsed = JSON.parse(raw)
    return {
      archetype: typeof parsed?.archetype === "string" ? parsed.archetype : null,
      palette:
        parsed?.palette && typeof parsed.palette.primary === "string" && typeof parsed.palette.accent === "string"
          ? { primary: parsed.palette.primary, accent: parsed.palette.accent }
          : null,
    }
  } catch {
    return { archetype: null, palette: null }
  }
}

/** Публичная сериализация — без owner_id, без email, только честные факты ковки. */
export function serializePublicRarest(row: RarestArtifactRow): PublicRarestArtifact {
  const { archetype, palette } = parseVisualTheme(row.visual_theme)
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    rarity: row.rarity,
    craftScore: row.craft_score,
    archetype,
    palette,
    createdAt: row.created_at,
    holderHandle: row.display_name || row.username || null,
  }
}

/** Топ артефактов по craftScore, новейшие вперёд при равенстве балла. */
export function listRarestArtifacts(limit = 60, offset = 0): PublicRarestArtifact[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.type, a.rarity, a.craft_score, a.visual_theme, a.created_at,
              u.username, u.display_name
       FROM artifacts a
       LEFT JOIN users u ON u.id = a.owner_id
       WHERE a.craft_score IS NOT NULL
       ORDER BY a.craft_score DESC, a.id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as RarestArtifactRow[]
  return rows.map(serializePublicRarest)
}

export function countRarestArtifacts(): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM artifacts WHERE craft_score IS NOT NULL`).get() as {
    n: number
  }
  return row?.n ?? 0
}

/** Одна запись зала по id — 404 у роута, если craft_score NULL (не участвует). */
export function getRarestArtifactById(id: number): PublicRarestArtifact | undefined {
  const row = db
    .prepare(
      `SELECT a.id, a.name, a.type, a.rarity, a.craft_score, a.visual_theme, a.created_at,
              u.username, u.display_name
       FROM artifacts a
       LEFT JOIN users u ON u.id = a.owner_id
       WHERE a.id = ? AND a.craft_score IS NOT NULL`,
    )
    .get(id) as RarestArtifactRow | undefined
  return row ? serializePublicRarest(row) : undefined
}
