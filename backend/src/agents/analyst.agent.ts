import { BaseAgent } from "./base-agent"
import { SpecificationSchema, type Specification, type PipelineArtifactType } from "./types"

/* ================================================================
   OSGARD · Агент «Бизнес-аналитик»
   ----------------------------------------------------------------
   Вход: текстовое описание проекта (string).
   Выход: Specification — структурированное ТЗ (цели, аудитория,
   фичи с приоритетами, нефункциональные требования, ограничения,
   метрики успеха), которое дальше читает Архитектор.
   ================================================================ */

export class BusinessAnalystAgent extends BaseAgent<string, Specification> {
  readonly role = "Бизнес-аналитик"
  readonly artifactType: PipelineArtifactType = "spec"
  readonly schema = SpecificationSchema
  protected readonly maxTokens = 2048

  protected buildPrompt(description: string): string {
    return `Ты — опытный бизнес-аналитик в команде разработки OSGARD. Тебе дают свободное текстовое
описание проекта, а ты превращаешь его в чёткую техническую спецификацию.

Описание проекта от пользователя:
"""
${description}
"""

Верни СТРОГО валидный JSON (без markdown, без пояснений вне JSON) со структурой:
{
  "projectName": "короткое звучное название проекта",
  "summary": "1-2 предложения о сути проекта",
  "goals": ["цель 1", "цель 2", "..."],
  "targetUsers": ["целевая аудитория/роль пользователя 1", "..."],
  "features": [
    { "name": "название функции", "description": "что она делает", "priority": "must" }
  ],
  "nonFunctionalRequirements": ["требование к производительности/безопасности/UX и т.п."],
  "constraints": ["технические или бизнес-ограничения"],
  "successMetrics": ["как измерить успех проекта"]
}
Поле "priority" в features — строго одно из: "must", "should", "could".
Дай минимум 3 фичи и минимум по 2 пункта в каждом остальном массиве. Ответь только JSON.`
  }

  protected buildFallback(description: string): Specification {
    const trimmed = description.trim() || "Новый проект"
    const projectName = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed

    return {
      projectName,
      summary: trimmed,
      goals: ["Реализовать базовую функциональность из описания", "Обеспечить рабочий MVP"],
      targetUsers: ["Конечный пользователь"],
      features: [
        { name: "Базовый функционал", description: trimmed, priority: "must" },
        { name: "Авторизация", description: "Регистрация и вход пользователя", priority: "should" },
        { name: "Настройки профиля", description: "Управление личными данными", priority: "could" },
      ],
      nonFunctionalRequirements: ["Отзывчивый интерфейс (mobile-first)", "Время ответа API < 500мс"],
      constraints: ["Использовать существующий стек OSGARD (Next.js/TypeScript)"],
      successMetrics: ["Проект успешно собирается и разворачивается", "Ключевой сценарий пользователя работает end-to-end"],
    }
  }
}
