import db from "./db"
import type { ArtifactIdentity } from "./artifact-identity"

export interface IllustrationJobInput {
  artifactId: string
  name: string
  type?: string | null
  rarity: string
  identity?: ArtifactIdentity
  lore?: string | null
  description?: string | null
}

/**
 * Собирает промпт для SD 1.5 из доступных данных.
 *
 * Для /forge артефактов есть полная identity (archetype, material, essence, palette).
 * Для /generate-ai артефактов есть только lore/description.
 *
 * Результат: comma-separated промпт для локального generate.sh.
 */
export function buildIllustrationPrompt(input: IllustrationJobInput): string {
  const parts: string[] = []

  if (input.identity) {
    // Forge path: у нас есть полная идентичность.
    const id = input.identity
    parts.push(`${id.material} ${id.archetype.toLowerCase()}`)
    parts.push(`essence: ${id.essence.toLowerCase()}`)
    parts.push(`rarity: ${input.rarity.toLowerCase()}`)
    parts.push(`name: ${input.name}`)
    if (id.palette) {
      // Цвета как подсказка для стиля (не обязательны, но могут помочь)
      parts.push(`color palette: ${id.palette.primary} ${id.palette.accent}`)
    }
  } else {
    // Generate-ai path: только базовые данные.
    parts.push(`artifact: ${input.name}`)
    parts.push(`type: ${input.type || "creation"}`)
    parts.push(`rarity: ${input.rarity.toLowerCase()}`)
    if (input.lore) {
      parts.push(`lore: ${input.lore.slice(0, 200)}`)
    } else if (input.description) {
      parts.push(`description: ${input.description.slice(0, 200)}`)
    }
  }

  // Общие качество-теги
  parts.push("digital art, fantasy, mystical, detailed, glowing, professional")

  return parts.join(", ")
}

/**
 * Ставит артефакт в очередь иллюстраций (status='queued').
 * Идемпотентна: если артефакт уже в очереди, не переставляет.
 *
 * @returns true если артефакт был успешно поставлен в очередь,
 *         false если уже был в очереди или не существует.
 */
export function queueIllustrationJob(artifactId: string, prompt: string): boolean {
  const now = Date.now()

  const artifact = db.prepare(`SELECT id, illustration_status FROM artifacts WHERE id = ?`).get(artifactId) as
    | { id: string; illustration_status: string | null }
    | undefined
  if (!artifact) return false

  if (artifact.illustration_status) {
    // Уже в очереди или обрабатывается — не переставляем
    return false
  }

  db.prepare(`
    UPDATE artifacts
    SET illustration_status = 'queued',
        illustration_prompt = ?,
        illustration_queued_at = ?
    WHERE id = ? AND illustration_status IS NULL
  `).run(prompt, now, artifactId)

  return true
}
