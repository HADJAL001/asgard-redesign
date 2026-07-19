"use client"

import { useState } from "react"
import { Heart, MessageCircle, Share2, Pin, Plus, X, ImagePlus } from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80"

type Post = {
  id: number
  name: string
  role: string
  level: number
  time: string
  avatar: string
  text: string
  likes: number
  comments: number
  reposts: number
}

const POSTS: Post[] = [
  {
    id: 1,
    name: "Alex Odin",
    role: "Архитектор",
    level: 12,
    time: "2 часа назад",
    avatar: AVATAR,
    text: "Завершил рефакторинг нейронного ядра Nebula. Скорость рендеринга выросла на 38%. Делюсь архитектурными заметками с командой — обсудим на созвоне.",
    likes: 24,
    comments: 12,
    reposts: 5,
  },
  {
    id: 2,
    name: "Medusa_Code",
    role: "Разработчик",
    level: 8,
    time: "5 часов назад",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80",
    text: "Кто-нибудь работал с распределёнными шлюзами Orbital API под высокой нагрузкой? Ищу паттерны кэширования на периферии.",
    likes: 18,
    comments: 8,
    reposts: 3,
  },
  {
    id: 3,
    name: "Assardi_Valkyrie",
    role: "Архитектор",
    level: 10,
    time: "1 день назад",
    avatar:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=160&q=80",
    text: "Опубликовала новую версию дизайн-системы Valkyrie UI. Полностью на палитре OSGARD, без стекла и градиентов. Чистая геометрия и воздух.",
    likes: 42,
    comments: 23,
    reposts: 12,
  },
]

function Reaction({
  Icon,
  value,
}: {
  Icon: typeof Heart
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px]" style={{ color: "#6A6A8A" }}>
      <Icon size={16} strokeWidth={1.5} />
      {value}
    </span>
  )
}

export function CommunityView() {
  const [creating, setCreating] = useState(false)

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D1A 100%)", color: "#FFFFFF" }}>
      {/* Header */}
      <Navbar />

      <main className="mx-auto max-w-[900px] px-6 py-10 md:px-10 md:py-12">
        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Сообщество</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Архитекторы вселенной — общение, идеи, коллаборации
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 self-start rounded-lg px-4 py-2.5 text-[14px] transition-colors sm:self-auto"
            style={{ border: "1px solid #2A2A3E", color: "#FFFFFF" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#00D4FF"
              e.currentTarget.style.borderColor = "#00D4FF"
              e.currentTarget.style.color = "#0A0A0F"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.borderColor = "#2A2A3E"
              e.currentTarget.style.color = "#FFFFFF"
            }}
          >
            <Plus size={16} strokeWidth={1.75} />
            Создать пост
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { n: 48, l: "Участников" },
            { n: 12, l: "Онлайн" },
            { n: 34, l: "Постов" },
            { n: 89, l: "Комментариев" },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
              <p className="text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Feed */}
        <div className="mt-8 flex flex-col gap-5">
          {POSTS.map((p) => (
            <article
              key={p.id}
              className="rounded-xl p-6 transition-all duration-200"
              style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#00D4FF"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2A2A3E"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div className="flex items-center gap-3">
                <img src={p.avatar || "/placeholder.svg"} alt={p.name} className="size-8 rounded-full object-cover" style={{ border: "1px solid #2A2A3E" }} />
                <div className="min-w-0">
                  <p className="text-[16px] font-medium leading-tight">{p.name}</p>
                  <p className="text-[12px]" style={{ color: "#6A6A8A" }}>{p.role} · Lvl.{p.level}</p>
                </div>
                <span className="ml-auto text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>{p.time}</span>
              </div>

              <p className="mt-4 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
                {p.text}
              </p>

              <div className="mt-5 flex items-center gap-6">
                <Reaction Icon={Heart} value={p.likes} />
                <Reaction Icon={MessageCircle} value={p.comments} />
                <Reaction Icon={Share2} value={p.reposts} />
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1.5 text-[13px] transition-colors"
                  style={{ color: "#6A6A8A" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#00D4FF")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#6A6A8A")}
                >
                  <Pin size={15} strokeWidth={1.5} />
                  Закрепить
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>

      {creating && <CreatePostModal onClose={() => setCreating(false)} />}
    </div>
  )
}

/* ---------------- Create post modal (40% x 60%) ---------------- */
function CreatePostModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.72)" }} onClick={onClose}>
      <div
        className="flex max-h-[60vh] w-full max-w-[40vw] flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-8 py-5" style={{ borderBottom: "1px solid #2A2A3E" }}>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg" style={{ color: "#6A6A8A" }}>
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2 className="text-[20px] font-semibold">Создать пост</h2>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 py-6">
          <label className="block">
            <span className="mb-2 block text-[13px]" style={{ color: "#6A6A8A" }}>Заголовок</span>
            <input
              type="text"
              placeholder="Введите заголовок"
              className="w-full rounded-lg px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-white/25"
              style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
            />
          </label>

          <label className="block flex-1">
            <span className="mb-2 block text-[13px]" style={{ color: "#6A6A8A" }}>Текст</span>
            <textarea
              rows={5}
              placeholder="Что нового, архитектор?"
              className="w-full resize-none rounded-lg px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-white/25"
              style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
            />
          </label>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] transition-colors"
            style={{ border: "1px dashed #2A2A3E", color: "#6A6A8A" }}
          >
            <ImagePlus size={16} strokeWidth={1.5} />
            Прикрепить медиа
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 px-8 py-5" style={{ borderTop: "1px solid #2A2A3E" }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] transition-colors" style={{ border: "1px solid #2A2A3E", color: "#FFFFFF" }}>Отмена</button>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors" style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}>Опубликовать</button>
        </div>
      </div>
    </div>
  )
}
