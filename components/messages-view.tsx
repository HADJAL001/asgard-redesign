"use client"

import { useState } from "react"
import Image from "next/image"
import { Search, Settings, Send, Bell, MessagesSquare, X } from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #10181d · card #17242a · accent #d7ae57 · text #FFFFFF · label #9eb2bc · border #30424b

   Реальной серверной части у чата пока нет (нет routes/messages в backend),
   поэтому здесь НЕТ демо-диалогов/сообщений — только честные пустые состояния.
   Когда появится API переписки, DIALOGS/MESSAGES заполнятся из него. */

type Dialog = {
  id: number
  name: string
  avatar: string
  last: string
  time: string
  unread: number
  online: boolean
}

const DIALOGS: Dialog[] = []

type Message = {
  id: number
  author: string
  mine: boolean
  text: string
  time: string
}

const MESSAGES: Message[] = []

export function MessagesView() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const active = DIALOGS.find((d) => d.id === activeId) ?? null

  return (
    <div className="flex min-h-screen flex-col font-sans" style={{ background: "linear-gradient(180deg, #10181d 0%, #0D0D1A 100%)", color: "#FFFFFF" }}>
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
            style={{ border: "1px solid #30424b", color: "#FFFFFF" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#d7ae57"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#30424b"
            }}
          >
            <Settings size={16} strokeWidth={1.75} />
            Настройки
          </button>
        </div>

        {/* Two columns */}
        <div className="mt-8 grid flex-1 gap-5 lg:grid-cols-[30%_1fr]">
          {/* Dialog list */}
          <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-xl" style={{ backgroundColor: "#17242a", border: "1px solid #30424b" }}>
            <div className="p-4" style={{ borderBottom: "1px solid #30424b" }}>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#10181d", border: "1px solid #30424b" }}>
                <Search size={16} strokeWidth={1.5} style={{ color: "#9eb2bc" }} />
                <input
                  type="text"
                  placeholder="Поиск диалогов"
                  className="w-full bg-transparent text-[14px] outline-none placeholder:text-white/25"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {DIALOGS.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                  <MessagesSquare size={26} strokeWidth={1.25} style={{ color: "#9eb2bc" }} />
                  <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>Диалогов пока нет</p>
                </div>
              ) : (
                DIALOGS.map((d) => {
                  const selected = d.id === activeId
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setActiveId(d.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{
                        backgroundColor: selected ? "#10181d" : "transparent",
                        borderLeft: `2px solid ${selected ? "#d7ae57" : "transparent"}`,
                      }}
                    >
                      <div className="relative shrink-0">
                        <Image src={d.avatar || "/placeholder.svg"} alt={d.name} width={28} height={28} className="size-7 rounded-full object-cover" style={{ border: "1px solid #30424b" }} />
                        {d.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full" style={{ backgroundColor: "#d7ae57", border: "2px solid #17242a" }} aria-hidden="true" />
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
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium" style={{ backgroundColor: "#F59E0B", color: "#10181d" }}>
                          {d.unread}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          {/* Chat window */}
          <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl" style={{ backgroundColor: "#17242a", border: "1px solid #30424b" }}>
            {active ? (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid #30424b" }}>
                  <Image src={active.avatar || "/placeholder.svg"} alt={active.name} width={36} height={36} className="size-9 rounded-full object-cover" style={{ border: "1px solid #30424b" }} />
                  <div>
                    <p className="text-[15px] font-medium leading-tight">{active.name}</p>
                    <p className="text-[12px]" style={{ color: active.online ? "#d7ae57" : "#9eb2bc" }}>
                      {active.online ? "онлайн" : "офлайн"}
                    </p>
                  </div>
                  <button type="button" aria-label="Уведомления" className="ml-auto flex size-9 items-center justify-center rounded-lg transition-colors" style={{ border: "1px solid #30424b", color: "#9eb2bc" }}>
                    <Bell size={16} strokeWidth={1.75} />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
                  {MESSAGES.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                      {!m.mine && <span className="mb-1 text-[11px]" style={{ color: "#9eb2bc" }}>{m.author}</span>}
                      <div
                        className="max-w-[70%] px-4 py-2.5 text-[14px] leading-relaxed"
                        style={{
                          backgroundColor: m.mine ? "#d7ae57" : "#30424b",
                          color: m.mine ? "#10181d" : "#FFFFFF",
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
                <div className="flex items-center gap-3 px-6 py-4" style={{ borderTop: "1px solid #30424b" }}>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Введите сообщение..."
                    className="flex-1 rounded-lg px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-white/25"
                    style={{ backgroundColor: "#10181d", border: "1px solid #30424b", color: "#FFFFFF" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#d7ae57")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#30424b")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) setDraft("")
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setDraft("")}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors"
                    style={{ backgroundColor: "#d7ae57", color: "#10181d" }}
                  >
                    <Send size={16} strokeWidth={2} />
                    Отправить
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <MessagesSquare size={36} strokeWidth={1.1} style={{ color: "#30424b" }} />
                <p className="text-[15px] font-medium">Здесь появятся ваши переписки</p>
                <p className="max-w-[320px] text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Общение с командой и коллегами станет доступно, как только у вас появятся диалоги.
                </p>
              </div>
            )}
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
        style={{ backgroundColor: "#17242a", border: "1px solid #30424b" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-8 py-5" style={{ borderBottom: "1px solid #30424b" }}>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg" style={{ color: "#9eb2bc" }}>
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2 className="text-[20px] font-semibold">Настройки чата</h2>
        </div>

        <div className="flex flex-col gap-3 px-8 py-6">
          {OPTIONS.map((o) => {
            const on = toggles[o.key]
            return (
              <div key={o.key} className="flex items-center justify-between rounded-lg px-4 py-3" style={{ backgroundColor: "#10181d", border: "1px solid #30424b" }}>
                <div>
                  <p className="text-[14px]">{o.label}</p>
                  <p className="text-[12px]" style={{ color: "#9eb2bc" }}>{o.hint}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => setToggles((t) => ({ ...t, [o.key]: !t[o.key] }))}
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ backgroundColor: on ? "#d7ae57" : "#30424b" }}
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

        <div className="flex items-center justify-end gap-3 px-8 py-5" style={{ borderTop: "1px solid #30424b" }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] transition-colors" style={{ border: "1px solid #30424b", color: "#FFFFFF" }}>Отмена</button>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors" style={{ backgroundColor: "#d7ae57", color: "#10181d" }}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
