import { BaseAgent } from "./base-agent"
import { DesignSystemSchema, type DesignSystem, type ProjectSchema, type PipelineArtifactType } from "./types"

/* ================================================================
   OSGARD · Агент «UI/UX-дизайнер»
   ----------------------------------------------------------------
   Вход: ProjectSchema (от Архитектора).
   Выход: DesignSystem — CSS-переменные/цвета, типографика, отступы,
   tailwind-конфиг (theme.extend) и набор иконок. Дальше читает
   Frontend-агент при генерации кода компонентов и globals.css.
   ================================================================ */

export class DesignerAgent extends BaseAgent<ProjectSchema, DesignSystem> {
  readonly role = "UI/UX-дизайнер"
  readonly artifactType: PipelineArtifactType = "design"
  readonly schema = DesignSystemSchema
  protected readonly maxTokens = 2560

  protected buildPrompt(schema: ProjectSchema): string {
    return `Ты — UI/UX-дизайнер в команде OSGARD. На основе технической схемы проекта создай
дизайн-систему: палитру цветов, типографику, отступы и конфигурацию Tailwind.

Схема проекта (JSON):
${JSON.stringify(schema, null, 2)}

Верни СТРОГО валидный JSON (без markdown, без пояснений вне JSON) со структурой:
{
  "colors": [
    { "name": "primary", "value": "#6366F1", "usage": "основной акцентный цвет, кнопки, ссылки" }
  ],
  "typography": {
    "fontFamily": "Inter, sans-serif",
    "headingSizes": { "h1": "2.5rem", "h2": "2rem", "h3": "1.5rem" },
    "bodySize": "1rem"
  },
  "spacing": { "unit": "rem", "scale": [0.25, 0.5, 1, 1.5, 2, 3, 4] },
  "borderRadius": "0.75rem",
  "tailwindConfigExtend": { "colors": { "primary": "#6366F1" } },
  "icons": [
    { "name": "home", "usage": "навигация на главную" }
  ],
  "darkMode": true
}
Названия цветов используй как CSS custom-property имена (без префикса --). Дай минимум
5 цветов (включая background/foreground/primary) и иконки из набора lucide-react.
Ответь только JSON.`
  }

  protected buildFallback(_schema: ProjectSchema): DesignSystem {
    return {
      colors: [
        { name: "background", value: "#0B0B12", usage: "фон страницы" },
        { name: "foreground", value: "#F5F5F7", usage: "основной цвет текста" },
        { name: "primary", value: "#6366F1", usage: "акцентный цвет, кнопки, ссылки" },
        { name: "secondary", value: "#22D3EE", usage: "вторичный акцент" },
        { name: "muted", value: "#1E1E2A", usage: "фон карточек и второстепенных блоков" },
        { name: "border", value: "#2A2A3A", usage: "границы элементов" },
      ],
      typography: {
        fontFamily: "Inter, system-ui, sans-serif",
        headingSizes: { h1: "2.5rem", h2: "2rem", h3: "1.5rem", h4: "1.25rem" },
        bodySize: "1rem",
      },
      spacing: { unit: "rem", scale: [0.25, 0.5, 1, 1.5, 2, 3, 4, 6] },
      borderRadius: "0.75rem",
      tailwindConfigExtend: {
        colors: {
          background: "#0B0B12",
          foreground: "#F5F5F7",
          primary: "#6366F1",
          secondary: "#22D3EE",
          muted: "#1E1E2A",
          border: "#2A2A3A",
        },
      },
      icons: [
        { name: "home", usage: "навигация на главную" },
        { name: "user", usage: "профиль пользователя" },
        { name: "settings", usage: "настройки" },
      ],
      darkMode: true,
    }
  }
}
