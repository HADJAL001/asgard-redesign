export type ProjectBriefAnswers = {
  audience: string;
  outcome: string;
  essentials: string;
  constraints?: string;
};

const MINIMUM_ANSWER_LENGTH = 3;

export function isProjectBriefAnswerComplete(answer: string): boolean {
  return Array.from(answer.trim()).length >= MINIMUM_ANSWER_LENGTH;
}

export function isProjectBriefComplete(brief: ProjectBriefAnswers): boolean {
  return isProjectBriefAnswerComplete(brief.audience)
    && isProjectBriefAnswerComplete(brief.outcome)
    && isProjectBriefAnswerComplete(brief.essentials);
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
