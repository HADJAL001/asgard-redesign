"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2, Clock } from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E
   event types: meeting #00D4FF · deadline #EF4444 · update #10B981 · other #F59E0B */

type EventType = "meeting" | "deadline" | "update" | "other"
type ViewMode = "month" | "week" | "day" | "list"

type CalEvent = {
  id: number
  title: string
  /** ISO date yyyy-mm-dd */
  date: string
  time: string
  duration: string
  type: EventType
  description: string
}

const TYPE: Record<EventType, { label: string; color: string }> = {
  meeting: { label: "Встреча", color: "#00D4FF" },
  deadline: { label: "Дедлайн", color: "#EF4444" },
  update: { label: "Обновление", color: "#10B981" },
  other: { label: "Другое", color: "#F59E0B" },
}

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "month", label: "Месяц" },
  { id: "week", label: "Неделя" },
  { id: "day", label: "День" },
  { id: "list", label: "Список" },
]

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]
const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"]

/* Fixed "today" so the demo is deterministic (matches the schema: Июль 2026). */
const TODAY = "2026-07-12"

const EVENTS: CalEvent[] = [
  { id: 1, title: 'Проект «Нейросеть» — встреча с командой', date: "2026-07-12", time: "12:00", duration: "1 час", type: "meeting", description: "Обсуждение архитектуры нейросетевого ядра и распределение задач на спринт." },
  { id: 2, title: 'Дедлайн по артефакту «Кристалл Творца»', date: "2026-07-12", time: "14:30", duration: "—", type: "deadline", description: "Финальная сборка и передача артефакта в Кузницу на улучшение." },
  { id: 3, title: "Обновление системы — плановое", date: "2026-07-12", time: "16:00", duration: "30 мин", type: "update", description: "Плановое обновление ядра OSGARD до версии 4.2. Возможны кратковременные перебои." },
  { id: 4, title: "Синхронизация с сообществом", date: "2026-07-05", time: "11:00", duration: "45 мин", type: "meeting", description: "Еженедельный созвон с активными участниками Таверны." },
  { id: 5, title: "Ретроспектива спринта", date: "2026-07-18", time: "17:00", duration: "1 час", type: "meeting", description: "Итоги спринта, что улучшить в следующем цикле." },
  { id: 6, title: 'Дедлайн: интеграция API-Mesh', date: "2026-07-24", time: "23:59", duration: "—", type: "deadline", description: "Завершить подключение внешних сервисов к шлюзу." },
  { id: 7, title: "Бэкап данных портфеля", date: "2026-07-09", time: "03:00", duration: "20 мин", type: "update", description: "Автоматический экспорт и резервное копирование." },
  { id: 8, title: "Личное планирование", date: "2026-07-28", time: "09:00", duration: "1 час", type: "other", description: "Планирование целей на август." },
]

/* year/month from ISO */
function ym(iso: string) {
  const [y, m] = iso.split("-").map(Number)
  return { y, m: m - 1 }
}
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export function CalendarView() {
  const start = ym(TODAY)
  const [year, setYear] = useState(start.y)
  const [month, setMonth] = useState(start.m)
  const [view, setView] = useState<ViewMode>("month")
  const [selected, setSelected] = useState<string>(TODAY)
  const [creating, setCreating] = useState(false)
  const [openEvent, setOpenEvent] = useState<CalEvent | null>(null)

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const e of EVENTS) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [])

  /* build the month grid (Mon-first) */
  const cells = useMemo(() => {
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // 0 = Monday
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const list: (number | null)[] = []
    for (let i = 0; i < firstDow; i++) list.push(null)
    for (let d = 1; d <= daysInMonth; d++) list.push(d)
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [year, month])

  const selectedEvents = (eventsByDate.get(selected) ?? []).slice().sort((a, b) => a.time.localeCompare(b.time))
  const selectedLabel =
    selected === TODAY ? "сегодня" : `${Number(selected.split("-")[2])} ${MONTHS[ym(selected).m].toLowerCase()}`

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }
  function goToday() {
    setYear(start.y); setMonth(start.m); setSelected(TODAY)
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">
        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Календарь</h1>
            <p className="mt-1 text-[14px]" style={{ color: "#FFFFFF", opacity: 0.4 }}>
              Планирование событий и дедлайнов
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg px-4 py-2.5 text-[14px] transition-colors"
              style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.8)" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors"
              style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <Plus size={16} strokeWidth={2} />
              Создать
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="mt-8 flex items-center gap-8 border-b" style={{ borderColor: "#2A2A3E" }}>
          {VIEWS.map((v) => {
            const active = v.id === view
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className="relative pb-3 text-[14px] uppercase tracking-wide transition-colors"
                style={{ color: active ? "#00D4FF" : "rgba(255,255,255,0.5)" }}
              >
                {v.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5" style={{ backgroundColor: "#00D4FF" }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Grid + month nav */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
          {/* Month navigation card */}
          <aside
            className="h-fit rounded-xl p-5"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <div className="text-[20px] font-semibold">{MONTHS[month]}</div>
            <div className="text-[14px]" style={{ color: "#6A6A8A" }}>{year}</div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
                style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.8)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
              >
                <ChevronLeft size={15} strokeWidth={1.75} />
                {MONTHS[(month + 11) % 12]}
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
                style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.8)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
              >
                <ChevronRight size={15} strokeWidth={1.75} />
                {MONTHS[(month + 1) % 12]}
              </button>
              <button
                type="button"
                onClick={goToday}
                className="mt-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
                style={{ backgroundColor: "rgba(0,212,255,0.1)", color: "#00D4FF" }}
              >
                Сегодня
              </button>
            </div>

            {/* Legend */}
            <div className="mt-6 space-y-2 border-t pt-5" style={{ borderColor: "#2A2A3E" }}>
              {(Object.keys(TYPE) as EventType[]).map((k) => (
                <div key={k} className="flex items-center gap-2 text-[12px]" style={{ color: "#6A6A8A" }}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: TYPE[k].color }} aria-hidden="true" />
                  {TYPE[k].label}
                </div>
              ))}
            </div>
          </aside>

          {/* Days grid */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-2 text-center text-[12px] font-medium" style={{ color: "#6A6A8A" }}>
                  {w}
                </div>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <div key={`e${i}`} />
                const dateIso = iso(year, month, d)
                const isToday = dateIso === TODAY
                const isSelected = dateIso === selected
                const dayEvents = eventsByDate.get(dateIso) ?? []
                return (
                  <button
                    key={dateIso}
                    type="button"
                    onClick={() => setSelected(dateIso)}
                    className="flex aspect-square flex-col items-center justify-start rounded-lg p-1.5 transition-colors"
                    style={{
                      border: `1px solid ${isSelected ? "#00D4FF" : dayEvents.length ? "#2A2A3E" : "transparent"}`,
                      backgroundColor: isToday ? "rgba(0,212,255,0.12)" : "transparent",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = "#00D4FF" }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = dayEvents.length ? "#2A2A3E" : "transparent" }}
                    aria-label={`${d} ${MONTHS[month]}${dayEvents.length ? `, событий: ${dayEvents.length}` : ""}`}
                    aria-pressed={isSelected}
                  >
                    <span
                      className="text-[13px]"
                      style={{ color: isToday ? "#00D4FF" : "#FFFFFF", fontWeight: isToday ? 600 : 400 }}
                    >
                      {d}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="mt-auto flex items-center gap-0.5 pb-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: TYPE[e.type].color }}
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Events for selected day */}
        <section
          className="mt-8 rounded-xl p-6"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        >
          <h2 className="text-[13px] font-medium uppercase tracking-wide" style={{ color: "#6A6A8A" }}>
            {`События на ${selectedLabel} (${selectedEvents.length})`}
          </h2>

          {selectedEvents.length === 0 ? (
            <p className="mt-4 text-[14px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              На этот день событий нет.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {selectedEvents.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setOpenEvent(e)}
                    className="flex w-full items-center gap-4 rounded-lg p-4 text-left transition-colors"
                    style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
                    onMouseEnter={(e2) => (e2.currentTarget.style.borderColor = "#00D4FF")}
                    onMouseLeave={(e2) => (e2.currentTarget.style.borderColor = "#2A2A3E")}
                  >
                    <span
                      className="w-14 shrink-0 font-mono text-[14px]"
                      style={{ color: "#00D4FF" }}
                    >
                      {e.time}
                    </span>
                    <span
                      className="h-8 w-px shrink-0"
                      style={{ backgroundColor: "#2A2A3E" }}
                      aria-hidden="true"
                    />
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: TYPE[e.type].color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{e.title}</span>
                    <span
                      className="hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11px] sm:inline"
                      style={{ color: TYPE[e.type].color, border: `1px solid ${TYPE[e.type].color}40` }}
                    >
                      {TYPE[e.type].label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {creating && <CreateModal onClose={() => setCreating(false)} />}
      {openEvent && <ViewModal event={openEvent} onClose={() => setOpenEvent(null)} />}
    </div>
  )
}

/* ------------------------------- Create modal ------------------------------ */
function CreateModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<EventType>("meeting")
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(5,8,20,0.7)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Создать событие"
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-semibold">Создать событие</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="transition-colors hover:text-white" style={{ color: "#6A6A8A" }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <Field label="Название">
            <input type="text" placeholder="Название события" className="cal-input" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Дата">
              <input type="text" defaultValue="12.07.2026" className="cal-input" />
            </Field>
            <Field label="Время">
              <input type="text" defaultValue="14:30" className="cal-input" />
            </Field>
          </div>

          <Field label="Длительность">
            <input type="text" defaultValue="1 час" className="cal-input" />
          </Field>

          <div>
            <label className="mb-2 block text-[13px]" style={{ color: "#6A6A8A" }}>Тип события</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TYPE) as EventType[]).map((k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px]"
                  style={{ border: `1px solid ${type === k ? "#00D4FF" : "#2A2A3E"}` }}
                >
                  <input type="radio" name="cal-type" checked={type === k} onChange={() => setType(k)} className="sr-only" />
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: TYPE[k].color }} aria-hidden="true" />
                  {TYPE[k].label}
                </label>
              ))}
            </div>
          </div>

          <Field label="Описание">
            <textarea rows={2} placeholder="Детали события" className="cal-input resize-none" />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-[14px] transition-colors"
            style={{ color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors"
            style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------- View modal ------------------------------- */
function ViewModal({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const t = TYPE[event.type]
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(5,8,20,0.7)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={event.title}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
            <span className="text-[12px] uppercase tracking-wide" style={{ color: t.color }}>{t.label}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="transition-colors hover:text-white" style={{ color: "#6A6A8A" }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <h2 className="mt-4 text-[20px] font-semibold leading-snug text-balance">{event.title}</h2>

        <div className="mt-4 flex items-center gap-2 text-[14px]" style={{ color: "#6A6A8A" }}>
          <Clock size={16} strokeWidth={1.5} />
          <span>{event.time}</span>
          {event.duration !== "—" && <span>· {event.duration}</span>}
        </div>

        <p className="mt-4 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
          {event.description}
        </p>

        <div className="mt-6 flex items-center gap-3 border-t pt-5" style={{ borderColor: "#2A2A3E" }}>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors"
            style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <Pencil size={16} strokeWidth={1.75} />
            Редактировать
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
            style={{ border: "1px solid #2A2A3E", color: "#EF4444" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#EF4444")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
          >
            <Trash2 size={16} strokeWidth={1.75} />
            Удалить
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-4 py-2.5 text-[14px] transition-colors"
            style={{ color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- Helpers --------------------------------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-[13px]" style={{ color: "#6A6A8A" }}>{label}</label>
      {children}
    </div>
  )
}
