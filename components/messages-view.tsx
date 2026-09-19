"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Search, Settings, Send, Bell, MessagesSquare, Users, LifeBuoy, X } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"

/* ---- Palette ----
   bg #10181d · card #17242a · accent #d7ae57 · text #FFFFFF · label #9eb2bc · border #30424b

   Переписка использует защищённый API `/messages`: поиск собеседников,
   история, непрочитанные сообщения и уведомления приходят с сервера.
   При отсутствии диалогов экран остаётся честным пустым состоянием. */

type ChatUser = { id: number; username: string; displayName: string; avatarUrl: string | null }
type ChatMessage = {
  id: number
  mine: boolean
  text: string
  createdAt: number
  readAt: number | null
}
type Conversation = { user: ChatUser; lastMessage: ChatMessage; unreadCount: number }

function timeLabel(value: number) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(value)
}

export function MessagesView() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [search, setSearch] = useState("")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [searchResults, setSearchResults] = useState<ChatUser[]>([])
  const [activeUser, setActiveUser] = useState<ChatUser | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  const reloadConversations = useCallback(async () => {
    const data = await apiClient.get<{ conversations: Conversation[] }>("/messages")
    setConversations(data.conversations)
  }, [])

  useEffect(() => {
    reloadConversations().catch(() => setError("Не удалось загрузить переписки")).finally(() => setLoading(false))
  }, [reloadConversations])

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) { setSearchResults([]); return }
    const timer = window.setTimeout(() => {
      apiClient.get<{ users: ChatUser[] }>(`/messages/users?q=${encodeURIComponent(query)}`)
        .then((data) => setSearchResults(data.users))
        .catch(() => setSearchResults([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const openConversation = useCallback(async (user: ChatUser) => {
    setActiveId(user.id)
    setActiveUser(user)
    setMessages([])
    setError("")
    try {
      const data = await apiClient.get<{ user: ChatUser; messages: ChatMessage[] }>(`/messages/${user.id}`)
      setActiveUser(data.user)
      setMessages(data.messages)
      setConversations((items) => items.map((item) => item.user.id === user.id ? { ...item, unreadCount: 0 } : item))
    } catch {
      setError("Не удалось открыть переписку")
    }
  }, [])

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU")
    return query ? conversations.filter(({ user }) => `${user.displayName} ${user.username}`.toLocaleLowerCase("ru-RU").includes(query)) : conversations
  }, [conversations, search])

  const sendMessage = useCallback(async () => {
    if (!activeUser || !draft.trim() || sending) return
    setSending(true)
    setError("")
    try {
      const data = await apiClient.post<{ message: ChatMessage }>(`/messages/${activeUser.id}`, { text: draft.trim() })
      setMessages((items) => [...items, data.message])
      setDraft("")
      await reloadConversations()
    } catch {
      setError("Не удалось отправить сообщение")
    } finally {
      setSending(false)
    }
  }, [activeUser, draft, reloadConversations, sending])

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
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full bg-transparent text-[14px] outline-none placeholder:text-white/25"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center px-6 py-12 text-center text-[13px]" style={{ color: "#9eb2bc" }}>Загружаем переписки...</div>
              ) : visibleConversations.length === 0 && searchResults.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                  <MessagesSquare size={26} strokeWidth={1.25} style={{ color: "#9eb2bc" }} />
                  <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>Ваши диалоги появятся здесь</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href="/community" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px]" style={{ border: "1px solid #30424b", color: "#d7ae57" }}>
                      <Users size={13} /> Сообщество
                    </Link>
                    <Link href="/support" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px]" style={{ border: "1px solid #30424b", color: "#d7ae57" }}>
                      <LifeBuoy size={13} /> Поддержка
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                {searchResults.map((user) => (
                  <button key={`search-${user.id}`} type="button" onClick={() => openConversation(user)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors" style={{ borderBottom: "1px solid rgba(48,66,75,0.45)" }}>
                    <Image src={user.avatarUrl || "/placeholder.svg"} alt={user.displayName} width={28} height={28} className="size-7 rounded-full object-cover" />
                    <div className="min-w-0"><p className="truncate text-[14px] font-medium">{user.displayName}</p><p className="truncate text-[12px]" style={{ color: "#9eb2bc" }}>@{user.username}</p></div>
                  </button>
                ))}
                {visibleConversations.map((d) => {
                  const selected = d.user.id === activeId
                  return (
                    <button
                      key={d.user.id}
                      type="button"
                      onClick={() => openConversation(d.user)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{
                        backgroundColor: selected ? "#10181d" : "transparent",
                        borderLeft: `2px solid ${selected ? "#d7ae57" : "transparent"}`,
                      }}
                    >
                      <div className="relative shrink-0">
                        <Image src={d.user.avatarUrl || "/placeholder.svg"} alt={d.user.displayName} width={28} height={28} className="size-7 rounded-full object-cover" style={{ border: "1px solid #30424b" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[14px] font-medium">{d.user.displayName}</p>
                          <span className="shrink-0 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{timeLabel(d.lastMessage.createdAt)}</span>
                        </div>
                        <p className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{d.lastMessage.text}</p>
                      </div>
                      {d.unreadCount > 0 && (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium" style={{ backgroundColor: "#F59E0B", color: "#10181d" }}>
                          {d.unreadCount}
                        </span>
                      )}
                    </button>
                  )
                })}
                </>
              )}
            </div>
          </aside>

          {/* Chat window */}
          <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl" style={{ backgroundColor: "#17242a", border: "1px solid #30424b" }}>
            {activeUser ? (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid #30424b" }}>
                  <Image src={activeUser.avatarUrl || "/placeholder.svg"} alt={activeUser.displayName} width={36} height={36} className="size-9 rounded-full object-cover" style={{ border: "1px solid #30424b" }} />
                  <div>
                    <p className="text-[15px] font-medium leading-tight">{activeUser.displayName}</p>
                    <p className="text-[12px]" style={{ color: "#9eb2bc" }}>@{activeUser.username}</p>
                  </div>
                  <button type="button" aria-label="Уведомления" className="ml-auto flex size-9 items-center justify-center rounded-lg transition-colors" style={{ border: "1px solid #30424b", color: "#9eb2bc" }}>
                    <Bell size={16} strokeWidth={1.75} />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                      {!m.mine && <span className="mb-1 text-[11px]" style={{ color: "#9eb2bc" }}>{activeUser.displayName}</span>}
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
                      <span className="mt-1 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{timeLabel(m.createdAt)}</span>
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
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) void sendMessage()
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!draft.trim() || sending}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors"
                    style={{ backgroundColor: "#d7ae57", color: "#10181d" }}
                  >
                    <Send size={16} strokeWidth={2} />
                    {sending ? "Отправка..." : "Отправить"}
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
            {error && <p className="px-6 pb-4 text-[13px]" style={{ color: "#FCA5A5" }}>{error}</p>}
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
