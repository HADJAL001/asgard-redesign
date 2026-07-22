"use client"

import { useState } from "react"
import {
  Settings as SettingsIcon,
  Bell,
  KeyRound,
  Link2,
  Palette,
  Download,
  Trash2,
  Camera,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Monitor,
  Moon,
  Sun,
  Gift,
  CheckCircle2,
  XCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&q=80"

type Section =
  | "profile"
  | "notifications"
  | "security"
  | "api"
  | "appearance"
  | "export"
  | "promo"
  | "danger"

const MENU: { id: Section; label: string; Icon: LucideIcon; danger?: boolean }[] = [
  { id: "profile", label: "Профиль", Icon: SettingsIcon },
  { id: "notifications", label: "Уведомления", Icon: Bell },
  { id: "security", label: "Безопасность", Icon: KeyRound },
  { id: "api", label: "API Интеграции", Icon: Link2 },
  { id: "appearance", label: "Внешний вид", Icon: Palette },
  { id: "export", label: "Экспорт данных", Icon: Download },
  { id: "promo", label: "Промокод", Icon: Gift },
  { id: "danger", label: "Удалить аккаунт", Icon: Trash2, danger: true },
]

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  profile: { title: "Профиль", subtitle: "Настройки аккаунта, аватара и данных" },
  notifications: { title: "Уведомления", subtitle: "Настройки уведомлений, почта, звук" },
  security: { title: "Безопасность", subtitle: "Пароль, двухфакторная аутентификация" },
  api: { title: "API Интеграции", subtitle: "API-ключи, доступ к нейросетям" },
  appearance: { title: "Внешний вид", subtitle: "Тема, шрифты, плотность интерфейса" },
  export: { title: "Экспорт данных", subtitle: "Выгрузка проектов, артефактов и статистики" },
  promo: { title: "Промокод", subtitle: "Активируй промокод для получения бонусов" },
  danger: { title: "Удалить аккаунт", subtitle: "Безвозвратное удаление аккаунта и данных" },
}

const CARD = "#14141E"
const BG = "#0A0A0F"
const ACCENT = "#00D4FF"
const LABEL = "#6A6A8A"
const BORDER = "#2A2A3E"

export function SettingsView() {
  const [active, setActive] = useState<Section>("profile")
  const meta = SECTION_META[active]

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        {/* Title */}
        <h1 className="font-sans text-[32px] font-semibold leading-tight">Настройки</h1>
        <p className="mt-1 font-sans text-[14px]" style={{ color: "#FFFFFF", opacity: 0.4 }}>
          Управление системой и аккаунтом
        </p>

        <div className="mt-8 flex flex-col gap-6 lg:flex-row">
          {/* Left menu */}
          <nav
            aria-label="Разделы настроек"
            className="w-full shrink-0 rounded-xl p-2 lg:w-72"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
          >
            {MENU.map((item) => {
              const isActive = active === item.id
              const color = item.danger
                ? isActive
                  ? "#F87171"
                  : "#F87171"
                : isActive
                  ? ACCENT
                  : "#FFFFFF"
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  aria-current={isActive ? "true" : undefined}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors"
                  style={{
                    backgroundColor: isActive ? "rgba(0,212,255,0.08)" : "transparent",
                    color,
                    opacity: item.danger ? 0.9 : isActive ? 1 : 0.6,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.opacity = "1"
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.opacity = item.danger ? "0.9" : "0.6"
                  }}
                >
                  <item.Icon
                    size={16}
                    strokeWidth={1.75}
                    style={{ color: item.danger ? "#F87171" : isActive ? ACCENT : LABEL }}
                  />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* Right detail panel */}
          <section
            className="min-w-0 flex-1 rounded-xl p-6 md:p-8"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
          >
            <header className="mb-8">
              <h2 className="font-sans text-[20px] font-medium">{meta.title}</h2>
              <p className="mt-1 text-[14px]" style={{ color: "#FFFFFF", opacity: 0.4 }}>
                {meta.subtitle}
              </p>
            </header>

            {active === "profile" && <ProfileSection />}
            {active === "notifications" && <NotificationsSection />}
            {active === "security" && <SecuritySection />}
            {active === "api" && <ApiSection />}
            {active === "appearance" && <AppearanceSection />}
            {active === "export" && <ExportSection />}
            {active === "promo" && <PromoSection />}
            {active === "danger" && <DangerSection />}
          </section>
        </div>
      </main>
    </div>
  )
}

/* ---------- Reusable inputs ---------- */

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-2 block text-[13px]" style={{ color: LABEL }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  backgroundColor: "transparent",
  border: `1px solid ${BORDER}`,
  color: "#FFFFFF",
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-white/30 focus:border-[#00D4FF]"
      style={inputStyle}
    />
  )
}

function Actions({ saveLabel = "Сохранить" }: { saveLabel?: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="rounded-lg px-5 py-2.5 text-[14px] font-medium transition-opacity"
        style={{ backgroundColor: ACCENT, color: BG }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        {saveLabel}
      </button>
      <button
        type="button"
        className="rounded-lg px-5 py-2.5 text-[14px] transition-colors"
        style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.7)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
      >
        Отмена
      </button>
    </div>
  )
}

function Toggle({ label, desc, on }: { label: string; desc: string; on: boolean }) {
  const [checked, setChecked] = useState(on)
  return (
    <div
      className="flex items-center justify-between rounded-lg px-4 py-3.5"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div className="pr-4">
        <p className="text-[14px]">{label}</p>
        <p className="mt-0.5 text-[13px]" style={{ color: LABEL }}>
          {desc}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => setChecked((v) => !v)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? ACCENT : BORDER }}
      >
        <span
          className="absolute top-0.5 size-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  )
}

/* ---------- Sections ---------- */

function ProfileSection() {
  return (
    <div className="max-w-lg space-y-6">
      <Field label="Имя пользователя:">
        <TextInput defaultValue="Alex Odin" />
      </Field>
      <Field label="Email:">
        <TextInput type="email" defaultValue="alex@osgard.io" />
      </Field>
      <Field label="Биография:">
        <textarea
          defaultValue="Архитектор вселенной, создатель нейросетей и цифровых артефактов."
          rows={3}
          className="w-full resize-none rounded-lg px-3 py-2.5 text-[14px] leading-relaxed outline-none transition-colors placeholder:text-white/30 focus:border-[#00D4FF]"
          style={inputStyle}
        />
      </Field>
      <Field label="Аватар:">
        <div className="flex items-center gap-4">
          <img
            src={AVATAR || "/placeholder.svg"}
            alt="Текущий аватар"
            className="size-16 rounded-full object-cover"
            style={{ border: `1px solid ${BORDER}` }}
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
            style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          >
            <Camera size={16} strokeWidth={1.75} style={{ color: LABEL }} />
            Загрузить новое фото
          </button>
        </div>
      </Field>
      <Actions />
    </div>
  )
}

function NotificationsSection() {
  return (
    <div className="max-w-lg space-y-4">
      <Toggle label="Email-уведомления" desc="Получать письма о важных событиях" on />
      <Toggle label="Push-уведомления" desc="Оповещения в браузере в реальном времени" on />
      <Toggle label="Звук" desc="Звуковой сигнал при новых сообщениях" on={false} />
      <Toggle label="Дайджест" desc="Еженедельная сводка активности на почту" on={false} />
      <div className="pt-2">
        <Actions />
      </div>
    </div>
  )
}

function SecuritySection() {
  const [show, setShow] = useState(false)
  return (
    <div className="max-w-lg space-y-6">
      <Field label="Текущий пароль:">
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            defaultValue="password123"
            className="w-full rounded-lg px-3 py-2.5 pr-11 text-[14px] outline-none transition-colors focus:border-[#00D4FF]"
            style={inputStyle}
          />
          <button
            type="button"
            aria-label={show ? "Скрыть пароль" : "Показать пароль"}
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: LABEL }}
          >
            {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
          </button>
        </div>
      </Field>
      <Field label="Новый пароль:">
        <TextInput type="password" placeholder="Введите новый пароль" />
      </Field>
      <Toggle label="Двухфакторная аутентификация" desc="Дополнительный код при входе" on={false} />
      <div>
        <p className="mb-2 text-[13px]" style={{ color: LABEL }}>
          Активные сессии:
        </p>
        <div className="space-y-2">
          {[
            { d: "MacBook Pro · Москва", cur: true },
            { d: "iPhone 15 · Москва", cur: false },
          ].map((s) => (
            <div
              key={s.d}
              className="flex items-center justify-between rounded-lg px-4 py-3 text-[14px]"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <span>{s.d}</span>
              {s.cur ? (
                <span className="text-[13px]" style={{ color: ACCENT }}>
                  Текущая
                </span>
              ) : (
                <button type="button" className="text-[13px]" style={{ color: "#F87171" }}>
                  Завершить
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <Actions saveLabel="Обновить пароль" />
    </div>
  )
}

function ApiSection() {
  const keys = [
    { name: "Production Key", value: "sk-osg-••••••••••••4f2a", date: "12 дней назад" },
    { name: "Development Key", value: "sk-osg-••••••••••••9b1c", date: "3 дня назад" },
  ]
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px]" style={{ color: LABEL }}>
          Ваши API-ключи
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-opacity"
          style={{ backgroundColor: ACCENT, color: BG }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <Plus size={16} strokeWidth={2} />
          Создать ключ
        </button>
      </div>
      <div className="space-y-3">
        {keys.map((k) => (
          <div
            key={k.name}
            className="flex items-center justify-between rounded-lg px-4 py-3.5"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <div className="min-w-0">
              <p className="text-[14px]">{k.name}</p>
              <p className="mt-0.5 truncate font-mono text-[13px]" style={{ color: LABEL }}>
                {k.value}
              </p>
            </div>
            <div className="flex items-center gap-4 pl-4">
              <span className="hidden text-[13px] sm:block" style={{ color: LABEL }}>
                {k.date}
              </span>
              <button type="button" aria-label="Копировать ключ" style={{ color: LABEL }}>
                <Copy size={16} strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Удалить ключ" style={{ color: "#F87171" }}>
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AppearanceSection() {
  const [theme, setTheme] = useState("dark")
  const [density, setDensity] = useState("comfortable")
  const themes = [
    { id: "dark", label: "Тёмная", Icon: Moon },
    { id: "light", label: "Светлая", Icon: Sun },
    { id: "system", label: "Системная", Icon: Monitor },
  ]
  return (
    <div className="max-w-lg space-y-6">
      <Field label="Тема:">
        <div className="grid grid-cols-3 gap-3">
          {themes.map((t) => {
            const on = theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className="flex flex-col items-center gap-2 rounded-lg py-4 text-[13px] transition-colors"
                style={{
                  border: `1px solid ${on ? ACCENT : BORDER}`,
                  color: on ? ACCENT : "rgba(255,255,255,0.7)",
                }}
              >
                <t.Icon size={20} strokeWidth={1.75} style={{ color: on ? ACCENT : LABEL }} />
                {t.label}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="Шрифт интерфейса:">
        <select
          defaultValue="Inter"
          className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[#00D4FF]"
          style={inputStyle}
        >
          <option style={{ backgroundColor: CARD }}>Inter</option>
          <option style={{ backgroundColor: CARD }}>System UI</option>
          <option style={{ backgroundColor: CARD }}>Mono</option>
        </select>
      </Field>
      <Field label="Плотность интерфейса:">
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: "compact", label: "Компактная" },
            { id: "comfortable", label: "Просторная" },
          ].map((d) => {
            const on = density === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDensity(d.id)}
                className="rounded-lg py-2.5 text-[14px] transition-colors"
                style={{
                  border: `1px solid ${on ? ACCENT : BORDER}`,
                  color: on ? ACCENT : "rgba(255,255,255,0.7)",
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      </Field>
      <Actions />
    </div>
  )
}

function ExportSection() {
  const items = [
    { name: "Проекты", desc: "Все проекты в формате JSON" },
    { name: "Артефакты", desc: "Коллекция артефактов и характеристики" },
    { name: "Статистика", desc: "История активности и метрики" },
  ]
  return (
    <div className="max-w-lg space-y-3">
      {items.map((i) => (
        <div
          key={i.name}
          className="flex items-center justify-between rounded-lg px-4 py-3.5"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <div>
            <p className="text-[14px]">{i.name}</p>
            <p className="mt-0.5 text-[13px]" style={{ color: LABEL }}>
              {i.desc}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] transition-colors"
            style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          >
            <Download size={16} strokeWidth={1.75} style={{ color: LABEL }} />
            Скачать
          </button>
        </div>
      ))}
    </div>
  )
}

function DangerSection() {
  return (
    <div
      className="max-w-lg rounded-lg p-5"
      style={{ border: "1px solid rgba(248,113,113,0.4)", backgroundColor: "rgba(248,113,113,0.05)" }}
    >
      <p className="text-[15px] font-medium" style={{ color: "#F87171" }}>
        Удаление аккаунта необратимо
      </p>
      <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
        Все проекты, артефакты, сообщения и статистика будут удалены без возможности восстановления.
      </p>
      <button
        type="button"
        className="mt-5 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors"
        style={{ backgroundColor: "#F87171", color: BG }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <Trash2 size={16} strokeWidth={1.75} />
        Удалить аккаунт
      </button>
    </div>
  )
}

/* ================================================================
   PromoSection — активация промокодов
   ================================================================ */
function PromoSection() {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    ok: boolean
    message: string
    type?: string
    amount?: number
    newBalance?: number
  } | null>(null)

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await apiClient.post<{
        success: boolean
        type: string
        amount: number
        description: string
        newBalance?: number
      }>("/promo/redeem", { code: code.trim() })

      setResult({
        ok: true,
        message: res.description,
        type: res.type,
        amount: res.amount,
        newBalance: res.newBalance,
      })
      setCode("")
    } catch (err: any) {
      setResult({ ok: false, message: err?.message || "Не удалось активировать промокод" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md space-y-6">
      {/* Описание */}
      <div
        className="rounded-xl p-4"
        style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}
      >
        <div className="flex items-center gap-2.5 mb-2">
          <Gift size={16} style={{ color: "#FBBF24" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#FBBF24" }}>
            Что можно получить по промокоду?
          </span>
        </div>
        <ul className="space-y-1.5 text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>
          <li>🪙 TimeCoin — зачисляется на кошелёк мгновенно</li>
          <li>⏱️ Дни доступа к плану Pro или Supreme</li>
          <li>🏷️ Скидка на следующую оплату</li>
        </ul>
      </div>

      {/* Форма */}
      <form onSubmit={handleRedeem} className="space-y-4">
        <Field label="Промокод:">
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="OSGARD2026"
              maxLength={32}
              className="flex-1 rounded-lg px-3 py-2.5 text-[14px] font-mono uppercase outline-none transition-colors placeholder:text-white/20 placeholder:normal-case focus:border-[#FBBF24]"
              style={{
                backgroundColor: "transparent",
                border: `1px solid ${result?.ok === false ? "rgba(248,113,113,0.5)" : result?.ok ? "rgba(52,211,153,0.5)" : BORDER}`,
                color: "#FFFFFF",
                letterSpacing: "0.08em",
              }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-semibold transition-all duration-200 disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #FBBF24, #F59E0B)",
                color: "#1a0f00",
              }}
              onMouseEnter={(e) => { if (!loading && code.trim()) e.currentTarget.style.transform = "translateY(-1px)" }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                "Активировать"
              )}
            </button>
          </div>
        </Field>
      </form>

      {/* Результат */}
      {result && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: result.ok ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)",
            border: `1px solid ${result.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
          }}
        >
          {result.ok ? (
            <CheckCircle2 size={18} style={{ color: "#34D399", flexShrink: 0, marginTop: 1 }} />
          ) : (
            <XCircle size={18} style={{ color: "#F87171", flexShrink: 0, marginTop: 1 }} />
          )}
          <div>
            <p
              className="text-[14px] font-medium"
              style={{ color: result.ok ? "#34D399" : "#F87171" }}
            >
              {result.ok ? "Промокод применён!" : "Ошибка"}
            </p>
            <p className="mt-0.5 text-[13px]" style={{ color: "rgba(255,255,255,0.65)" }}>
              {result.message}
            </p>
            {result.ok && result.newBalance !== undefined && (
              <p className="mt-1 text-[13px]" style={{ color: "#FBBF24" }}>
                Новый баланс: {result.newBalance.toLocaleString()} TC
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
