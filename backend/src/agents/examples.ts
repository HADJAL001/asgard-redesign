import type { Specification, ProjectSchema, DesignSystem } from "./types"

/* ================================================================
   OSGARD · Агенты сборки проекта — примеры вход/выход
   ----------------------------------------------------------------
   По одному фиксированному примеру на каждый переход пайплайна —
   полезно для ручной проверки и как fixture для будущих тестов
   (тесты пишет Клод #3, эти примеры — только документация формата).
   ================================================================ */

export const EXAMPLE_DESCRIPTION =
  "Сервис для трекинга привычек: пользователь заводит привычки, отмечает их выполнение по дням и видит стрики и статистику."

export const EXAMPLE_SPECIFICATION: Specification = {
  projectName: "HabitTrack",
  summary: "Веб-приложение для отслеживания ежедневных привычек со стриками и статистикой.",
  goals: ["Помочь пользователю формировать полезные привычки", "Наглядно показать прогресс"],
  targetUsers: ["Пользователь, желающий выработать регулярную привычку"],
  features: [
    { name: "Создание привычки", description: "Пользователь добавляет привычку с названием и частотой", priority: "must" },
    { name: "Отметка выполнения", description: "Отметить привычку выполненной за сегодня", priority: "must" },
    { name: "Стрики", description: "Подсчёт подряд идущих дней выполнения", priority: "should" },
    { name: "Статистика", description: "График выполнения привычек за месяц", priority: "could" },
  ],
  nonFunctionalRequirements: ["Мобильная адаптация", "Ответ API быстрее 300мс"],
  constraints: ["Next.js + TypeScript, без нативных мобильных приложений на первом этапе"],
  successMetrics: ["Пользователь может завести привычку и отметить её за < 3 клика"],
}

export const EXAMPLE_PROJECT_SCHEMA: ProjectSchema = {
  name: "habittrack",
  folderStructure: [
    { path: "app/page.tsx", description: "Главная — список привычек" },
    { path: "app/habits/[id]/page.tsx", description: "Детали привычки и статистика" },
    { path: "components/HabitCard.tsx", description: "Карточка одной привычки" },
  ],
  database: {
    tables: [
      {
        name: "habits",
        columns: [
          { name: "id", type: "integer", primaryKey: true },
          { name: "user_id", type: "integer", references: "users.id" },
          { name: "title", type: "text" },
          { name: "created_at", type: "integer" },
        ],
      },
      {
        name: "habit_logs",
        columns: [
          { name: "id", type: "integer", primaryKey: true },
          { name: "habit_id", type: "integer", references: "habits.id" },
          { name: "date", type: "text" },
        ],
      },
    ],
  },
  apiEndpoints: [
    { method: "GET", path: "/api/habits", description: "Список привычек пользователя" },
    { method: "POST", path: "/api/habits", description: "Создать привычку" },
    { method: "POST", path: "/api/habits/:id/log", description: "Отметить выполнение за сегодня" },
  ],
  dependencies: [
    { name: "next", version: "^14.2.0", purpose: "фреймворк приложения" },
    { name: "react", version: "^18.3.0", purpose: "UI-библиотека" },
  ],
  pages: [
    { route: "/", name: "Главная", description: "Список привычек пользователя со стриками" },
    { route: "/habits/new", name: "Новая привычка", description: "Форма создания привычки" },
  ],
}

export const EXAMPLE_DESIGN_SYSTEM: DesignSystem = {
  colors: [
    { name: "background", value: "#0B0B12", usage: "фон страницы" },
    { name: "foreground", value: "#F5F5F7", usage: "текст" },
    { name: "primary", value: "#22C55E", usage: "успех/выполненная привычка" },
    { name: "muted", value: "#1E1E2A", usage: "фон карточек" },
    { name: "border", value: "#2A2A3A", usage: "границы" },
  ],
  typography: {
    fontFamily: "Inter, sans-serif",
    headingSizes: { h1: "2.25rem", h2: "1.75rem" },
    bodySize: "1rem",
  },
  spacing: { unit: "rem", scale: [0.25, 0.5, 1, 1.5, 2] },
  borderRadius: "0.75rem",
  tailwindConfigExtend: { colors: { primary: "#22C55E" } },
  icons: [{ name: "check-circle", usage: "отметка выполнения привычки" }],
  darkMode: true,
}
