"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Pencil, Trash2, Upload, Sparkles, Library, Check, Boxes, TrendingUp, Coins } from "lucide-react"
import { Navbar } from "./navbar"
import {
  COLORS,
  PROJECTS as SEED,
  BADGES,
  BADGE_CATEGORIES,
  badgeIcon,
  formatTokens,
  type Project,
  type BadgeCategory,
} from "@/lib/economy"

export function ProjectsView() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>(SEED)
  const [creating, setCreating] = useState(false)
  const [badgeFor, setBadgeFor] = useState<Project | null>(null)

  const totals = {
    count: projects.reduce((s, p) => s + p.artifactCount, 0),
    sold: projects.reduce((s, p) => s + p.sold, 0),
    income: projects.reduce((s, p) => s + p.income, 0),
  }

  function setBadge(id: number, badge: string) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, badge } : p)))
    setBadgeFor(null)
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0A1628 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Мои проекты</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Проекты создают артефакты, артефакты приносят доход
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 self-start rounded-lg px-4 py-2.5 text-[14px] transition-colors sm:self-auto"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.accent
              e.currentTarget.style.borderColor = COLORS.accent
              e.currentTarget.style.color = COLORS.bg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.borderColor = COLORS.border
              e.currentTarget.style.color = COLORS.text
            }}
          >
            <Plus size={16} strokeWidth={1.75} />
            Создать проект
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { n: projects.length, l: "Проектов", Icon: Boxes },
            { n: totals.count, l: "Артефактов", Icon: Sparkles },
            { n: totals.sold, l: "Продано", Icon: TrendingUp },
            { n: `${formatTokens(totals.income)}`, l: "Доход, токенов", Icon: Coins },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <p className="mt-2 text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Project cards */}
        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {projects.map((p) => {
            const BadgeIcon = badgeIcon(p.badge)
            return (
              <article
                key={p.id}
                className="rounded-xl p-6 transition-all duration-200"
                style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.accent
                  e.currentTarget.style.transform = "translateY(-2px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => setBadgeFor(p)}
                    aria-label="Изменить значок проекта"
                    className="group relative flex size-14 shrink-0 items-center justify-center rounded-xl transition-colors"
                    style={{ border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.bg }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                  >
                    <BadgeIcon size={24} strokeWidth={1.5} style={{ color: COLORS.accent }} />
                    <span
                      className="absolute -bottom-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                    >
                      <Pencil size={11} strokeWidth={2} />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[18px] font-medium">{p.name}</h3>
                    <p className="mt-0.5 text-[14px]" style={{ color: "rgba(255,255,255,0.5)" }}>{p.description}</p>
                  </div>
                </div>

                {/* Counters */}
                <div className="mt-5 flex items-center gap-6 rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <span className="flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>
                    <span style={{ color: COLORS.label }}>Артефактов:</span> {p.artifactCount}
                  </span>
                  <span className="flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>
                    <span style={{ color: COLORS.label }}>Продано:</span> {p.sold}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5" style={{ color: COLORS.accent }}>
                    {formatTokens(p.income)} <span style={{ color: COLORS.label }}>ток.</span>
                  </span>
                </div>

                {/* Actions */}
                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/forge?project=${p.id}`)}
                    className="flex-1 rounded-lg py-2 text-[14px] font-medium transition-colors"
                    style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    Создать артефакт
                  </button>
                  <button
                    type="button"
                    aria-label="Редактировать"
                    className="flex size-9 items-center justify-center rounded-lg transition-colors"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
                  >
                    <Pencil size={16} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить"
                    onClick={() => setProjects((prev) => prev.filter((x) => x.id !== p.id))}
                    className="flex size-9 items-center justify-center rounded-lg transition-colors"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </main>

      {creating && <CreateModal onClose={() => setCreating(false)} />}
      {badgeFor && (
        <BadgePicker
          current={badgeFor.badge}
          onClose={() => setBadgeFor(null)}
          onSelect={(id) => setBadge(badgeFor.id, id)}
        />
      )}
    </div>
  )
}

/* ---------------- Badge picker modal ---------------- */
type Tab = "library" | "upload" | "ai"

function BadgePicker({ current, onClose, onSelect }: { current: string; onClose: () => void; onSelect: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("library")
  const [cat, setCat] = useState<BadgeCategory | "all">("all")
  const [picked, setPicked] = useState(current)
  const [prompt, setPrompt] = useState("")

  const shown = cat === "all" ? BADGES : BADGES.filter((b) => b.category === cat)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.72)" }} onClick={onClose}>
      <div
        className="flex max-h-[82vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg" style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2 className="text-[18px] font-semibold">Выберите значок проекта</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-7 pt-5">
          {[
            { id: "library" as const, label: "Библиотека", Icon: Library },
            { id: "upload" as const, label: "Загрузить фото", Icon: Upload },
            { id: "ai" as const, label: "Сгенерировать AI", Icon: Sparkles },
          ].map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] transition-colors"
                style={{
                  border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                  color: active ? COLORS.accent : "rgba(255,255,255,0.6)",
                }}
              >
                <t.Icon size={15} strokeWidth={1.75} />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          {tab === "library" && (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <CatChip active={cat === "all"} onClick={() => setCat("all")}>Все</CatChip>
                {BADGE_CATEGORIES.map((c) => (
                  <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</CatChip>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
                {shown.map((b) => {
                  const active = picked === b.id
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setPicked(b.id)}
                      aria-label={b.id}
                      className="flex aspect-square items-center justify-center rounded-xl transition-colors"
                      style={{
                        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                        backgroundColor: active ? "rgba(0,212,255,0.08)" : COLORS.bg,
                      }}
                    >
                      <b.Icon size={22} strokeWidth={1.5} style={{ color: active ? COLORS.accent : COLORS.label }} />
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {tab === "upload" && (
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-14 text-center"
              style={{ border: `1px dashed ${COLORS.border}`, backgroundColor: COLORS.bg }}
            >
              <Upload size={28} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <p className="text-[14px]">Перетащите фото или нажмите для выбора</p>
              <p className="text-[12px]" style={{ color: COLORS.label }}>
                jpg, png, webp · минимум 128×128 · до 3 загрузок в день
              </p>
              <p className="mt-2 rounded-md px-3 py-1.5 text-[11px]" style={{ backgroundColor: COLORS.card, color: COLORS.amber, border: `1px solid ${COLORS.border}` }}>
                Проходит модерацию до 24 часов
              </p>
            </div>
          )}

          {tab === "ai" && (
            <div className="flex flex-col gap-3">
              <label className="text-[13px]" style={{ color: COLORS.label }}>Опишите желаемый значок</label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Например: неоновый нейронный узел, тонкие линии, минимализм"
                className="cal-input resize-none"
              />
              <p className="text-[12px]" style={{ color: COLORS.label }}>Авто-модерация · до 2 генераций в день</p>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg px-4 py-2.5 text-[14px] font-medium"
                style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
              >
                <Sparkles size={15} strokeWidth={1.75} />
                Сгенерировать
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-7 py-5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Отмена</button>
          <button
            type="button"
            onClick={() => onSelect(picked)}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            <Check size={15} strokeWidth={2} />
            ��ыбрать
          </button>
        </div>
      </div>
    </div>
  )
}

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[12px] transition-colors"
      style={{
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        color: active ? COLORS.accent : "rgba(255,255,255,0.55)",
      }}
    >
      {children}
    </button>
  )
}

/* ---------------- Create project modal ---------------- */
function CreateModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.72)" }} onClick={onClose}>
      <div
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg" style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2 className="text-[18px] font-semibold">Создать новый проект</h2>
        </div>
        <div className="flex flex-col gap-5 px-7 py-6">
          <label className="block">
            <span className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Название проекта</span>
            <input type="text" placeholder="Введите название" className="cal-input" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Описание</span>
            <textarea rows={3} placeholder="Кратко опишите проект" className="cal-input resize-none" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-7 py-5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Отмена</button>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] font-medium" style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}>Создать</button>
        </div>
      </div>
    </div>
  )
}
