export type ProjectBriefAnswers = {
  audience: string
  outcome: string
  essentials: string
  constraints?: string
}

const REQUIRED_FIELDS = ["Аудитория", "Результат", "Обязательные функции"] as const
const MINIMUM_ANSWER_LENGTH = 3

export function isProjectBriefAnswerComplete(answer: string): boolean {
  return Array.from(answer.trim()).length >= MINIMUM_ANSWER_LENGTH
}

function valueForField(brief: string, field: string): string | null {
  const match = brief.match(new RegExp(`(?:^|\\n)${field}:\\s*([^\\n]+)`, "u"))
  return match?.[1]?.trim() || null
}

export function isProjectBriefComplete(answers: ProjectBriefAnswers): boolean {
  return isProjectBriefAnswerComplete(answers.audience)
    && isProjectBriefAnswerComplete(answers.outcome)
    && isProjectBriefAnswerComplete(answers.essentials)
}

export function buildProjectBrief(idea: string, answers: ProjectBriefAnswers): string {
  return [
    idea.trim(),
    `Аудитория: ${answers.audience.trim()}`,
    `Результат: ${answers.outcome.trim()}`,
    `Обязательные функции: ${answers.essentials.trim()}`,
    answers.constraints?.trim() ? `Ограничения: ${answers.constraints.trim()}` : "",
  ].filter(Boolean).join("\n")
}

/** A delayed guest request is safe to resume only after the full interview. */
export function hasCompleteProjectBrief(brief: string | undefined): boolean {
  if (!brief) return false
  return REQUIRED_FIELDS.every((field) => valueForField(brief, field) !== null)
}
