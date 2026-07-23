"use client"

import { useState } from "react"
import Image from "next/image"
import { Search, Settings, Send, Bell, X } from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80"

type Dialog = {
  id: number
  name: string
  avatar: string
  last: string
  time: string
  unread: number
  online: boolean
}

const DIALOGS: Dialog[] = [
  {
    id: 1,
    name: "Alex Odin",
    avatar: AVATAR,
    last: "Давайте обсудим проект",
    time: "12:35",
    unread: 0,
    online: true,
  },
  {
    id: 2,
    name: "Medusa_Code",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80",
    last: "Когда встреча?",
    time: "12:32",
    unread: 2,
    online: true,
  },
  {
    id: 3,
    name: "Assardi_Valkyrie",
    avatar:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=160&q=80",
    last: "Завтра в 15:00",
    time: "11:58",
    unread: 0,
    online: false,
  },
  {
    id: 4,
    name: "Gold_Architect",
    avatar:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80",
    last: "Отправил макеты в проект",
    time: "Вчера",
    unread: 0,
    online: false,
  },
]

type Message = {
  id: number
  author: string
  mine: boolean
  text: string
  time: string
}

const MESSAGES: Message[] = [
  { id: 1, author: "Alex Odin", mine: true, text: "Привет, коллеги! Готовы к синхрону по Nebula Core?", time: "12:30" },
  { id: 2, author: "Medusa_Code", mine: false, text: "Отличная идея! У меня есть пара мыслей по кэшированию.", time: "12:31" },
  { id: 3, author: "Assardi_Valkyrie", mine: false, text: "Поддерживаю! Дизайн-система уже готова к интеграции.", time: "12:32" },
  { id: 4, author: "Alex Odin", mine: true, text: "Давайте обсудим проект детально — соберёмся в 15:00.", time: "12:33" },
  { id: 5, author: "Medusa_Code", mine: false, text: "Когда встреча? Мне удобно после обеда.", time: "12:34" },
  { id: 6, author: "Assardi_Valkyrie", mine: false, text: "Завтра в 15:00 подойдёт всем?", time: "12:35" },
]

export function MessagesView() {
  const [activeId, setActiveId] = useState(2)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const active = DIALOGS.find((d) => d.id === activeId)!

  return (
    <div className="flex min-h-screen flex-col font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D1A 100%)", color: "#FFFFFF" }}>
      {/* Header */}
      <Navbar />

      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-6 py-10 md:px-10 md:py-12">
        {/* Title row */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Чат</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Общение с командой и коллегами
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
            style={{ border: "1px solid #2A2A3E", color: "#FFFFFF" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#00D4FF"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#2A2A3E"
            }}
          >
            <Settings size={16} strokeWidth={1.75} />
            Настройки
          </button>
        </div>

        {/* Two columns */}
        <div className="mt-8 grid flex-1 gap-5 lg:grid-cols-[30%_1fr]">
          {/* Dialog list */}
          <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-xl" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
            <div className="p-4" style={{ borderBottom: "1px solid #2A2A3E" }}>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}>
                <Search size={16} strokeWidth={1.5} style={{ color: "#6A6A8A" }} />
                <input
                  type="text"
                  placeholder="Поиск диалогов"
                  className="w-full bg-transparent text-[14px] outline-none placeholder:text-white/25"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {DIALOGS.map((d) => {
                const selected = d.id === activeId
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setActiveId(d.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      backgroundColor: selected ? "#0A0A0F" : "transparent",
                      borderLeft: `2px solid ${selected ? "#00D4FF" : "transparent"}`,
                    }}
                  >
                    <div className="relative shrink-0">
                      <Image src={d.avatar || "/placeholder.svg"} alt={d.name} width={28} height={28} className="size-7 rounded-full object-cover" style={{ border: "1px solid #2A2A3E" }} />
                      {d.online && (
                        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full" style={{ backgroundColor: "#4ADE80", border: "2px solid #14141E" }} aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[14px] font-medium">{d.name}</p>
                        <span className="shrink-0 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{d.time}</span>
                      </div>
                      <p className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{d.last}</p>
                    </div>
                    {d.unread > 0 && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium" style={{ backgroundColor: "#F59E0B", color: "#0A0A0F" }}>
                        {d.unread}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </aside>

          {/* Chat window */}
          <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid #2A2A3E" }}>
              <Image src={active.avatar || "/placeholder.svg"} alt={active.name} width={36} height={36} className="size-9 rounded-full object-cover" style={{ border: "1px solid #2A2A3E" }} />
              <div>
                <p className="text-[15px] font-medium leading-tight">{active.name}</p>
                <p className="text-[12px]" style={{ color: active.online ? "#4ADE80" : "#6A6A8A" }}>
                  {active.online ? "онлайн" : "офлайн"}
                </p>
              </div>
              <button type="button" aria-label="Уведомления" className="ml-auto flex size-9 items-center justify-center rounded-lg transition-colors" style={{ border: "1px solid #2A2A3E", color: "#6A6A8A" }}>
                <Bell size={16} strokeWidth={1.75} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
              {MESSAGES.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                  {!m.mine && <span className="mb-1 text-[11px]" style={{ color: "#6A6A8A" }}>{m.author}</span>}
                  <div
                    className="max-w-[70%] px-4 py-2.5 text-[14px] leading-relaxed"
                    style={{
                      backgroundColor: m.mine ? "#00D4FF" : "#2A2A3E",
                      color: m.mine ? "#0A0A0F" : "#FFFFFF",
                      borderRadius: 16,
                      borderBottomRightRadius: m.mine ? 4 : 16,
                      borderBottomLeftRadius: m.mine ? 16 : 4,
                    }}
                  >
                    {m.text}
                  </div>
                  <span className="mt-1 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{m.time}</span>
                </div>
              ))}
            </div>

            {/* Composer */}
            <div className="flex items-center gap-3 px-6 py-4" style={{ borderTop: "1px solid #2A2A3E" }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Введите сообщение..."
                className="flex-1 rounded-lg px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-white/25"
                style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) setDraft("")
                }}
              />
              <button
                type="button"
                onClick={() => setDraft("")}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors"
                style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
              >
                <Send size={16} strokeWidth={2} />
                Отправить
              </button>
            </div>
          </section>
        </div>
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

/* ---------------- Settings modal ---------------- */
function SettingsModal({ onClose }: { onClose: () => void }) {
  const [toggles, setToggles] = useState({ notify: true, sound: false, online: true })

  const OPTIONS: { key: keyof typeof toggles; label: string; hint: string }[] = [
    { key: "notify", label: "Уведомления", hint: "Push при новых сообщениях" },
    { key: "sound", label: "Звук", hint: "Звуковой сигнал входящих" },
    { key: "online", label: "Статус онлайн", hint: "Показывать другим ваш статус" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.72)" }} onClick={onClose}>
      <div
        className="flex w-full max-w-[40vw] flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-8 py-5" style={{ borderBottom: "1px solid #2A2A3E" }}>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg" style={{ color: "#6A6A8A" }}>
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2 className="text-[20px] font-semibold">Настройки чата</h2>
        </div>

        <div className="flex flex-col gap-3 px-8 py-6">
          {OPTIONS.map((o) => {
            const on = toggles[o.key]
            return (
              <div key={o.key} className="flex items-center justify-between rounded-lg px-4 py-3" style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}>
                <div>
                  <p className="text-[14px]">{o.label}</p>
                  <p className="text-[12px]" style={{ color: "#6A6A8A" }}>{o.hint}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => setToggles((t) => ({ ...t, [o.key]: !t[o.key] }))}
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ backgroundColor: on ? "#00D4FF" : "#2A2A3E" }}
                >
                  <span
                    className="absolute top-0.5 size-5 rounded-full transition-all"
                    style={{ backgroundColor: "#FFFFFF", left: on ? 22 : 2 }}
                  />
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-3 px-8 py-5" style={{ borderTop: "1px solid #2A2A3E" }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] transition-colors" style={{ border: "1px solid #2A2A3E", color: "#FFFFFF" }}>Отмена</button>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors" style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
