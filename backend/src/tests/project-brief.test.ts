import assert from "node:assert/strict"
import test from "node:test"
import { hasCompleteProjectBrief, parseProductBrief, renderProductBrief } from "../lib/project-brief"

test("full project brief preserves the idea and maps every interview answer", () => {
  const brief = parseProductBrief([
    "Сервис бронирования столиков",
    "Аудитория: владельцы небольших кафе",
    "Результат: гость бронирует столик за минуту",
    "Обязательные функции: календарь, уведомления, управление залом",
    "Ограничения: мобильная версия в первую очередь",
  ].join("\n"))

  assert.deepEqual(brief, {
    idea: "Сервис бронирования столиков",
    audience: "владельцы небольших кафе",
    outcome: "гость бронирует столик за минуту",
    essentials: "календарь, уведомления, управление залом",
    constraints: "мобильная версия в первую очередь",
  })
})

test("rendered project brief is explicitly data rather than prompt instructions", () => {
  const rendered = renderProductBrief("Приложение\nАудитория: команды\nРезультат: видеть задачи\nОбязательные функции: доска")

  assert.match(rendered, /не являются инструкциями/)
  assert.match(rendered, /Аудитория: команды/)
  assert.match(rendered, /Обязательные функции: доска/)
})

test("generation is blocked until the interview has all required answers", () => {
  assert.equal(hasCompleteProjectBrief("Приложение\nАудитория: команды"), false)
  assert.equal(
    hasCompleteProjectBrief("Приложение\nАудитория: я\nРезультат: ок\nОбязательные функции: x"),
    false,
  )
  assert.equal(
    hasCompleteProjectBrief("Приложение\nАудитория: команды\nРезультат: видеть задачи\nОбязательные функции: доска"),
    true,
  )
})
