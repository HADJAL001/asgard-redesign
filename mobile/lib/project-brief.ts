export type ProjectBriefAnswers = {
  audience: string;
  outcome: string;
  essentials: string;
  constraints?: string;
};

export function isProjectBriefComplete(brief: ProjectBriefAnswers): boolean {
  return Boolean(brief.audience.trim() && brief.outcome.trim() && brief.essentials.trim());
}

export function buildProjectBrief(idea: string, brief: ProjectBriefAnswers): string {
  return [
    idea.trim(),
    `Аудитория: ${brief.audience.trim()}`,
    `Результат: ${brief.outcome.trim()}`,
    `Обязательные функции: ${brief.essentials.trim()}`,
    brief.constraints?.trim() ? `Ограничения: ${brief.constraints.trim()}` : '',
  ].filter(Boolean).join('\n');
}
