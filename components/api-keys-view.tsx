"use client"

/* ================================================================
   ApiKeysView — B2B / white-label консоль разработчика
   ----------------------------------------------------------------
   Управление программными ключами доступа к публичному API OSGARD
   (POST /v1/generate). Секрет ключа показывается один раз при
   выпуске. Всё реально: список, выпуск, отзыв, статистика вызовов
   и списанных кредитов приходят с бэкенда (/api-keys).
   ================================================================ */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Plus, Copy, Check, Trash2, Loader2, X, Terminal, Store, ShieldCheck, Activity } from "lucide-react"
import { Navbar } from "./navbar"
import { PremiumBackground } from "./premium-bg"
import { apiClient } from "@/lib/api-client"
import { COLORS } from "@/lib/economy"

type ApiKey = {
  id: number
  name: string
  prefix: string
  scopes: string[]
  status: string
  ratePerMin: number
  requestCount: number
  lastUsedAt: number | null
  createdAt: number
  calls?: number
  creditsSpent?: number
}

function fmtDate(ms: number | null): string {
  if (!ms) return "—"
  const d = new Date(ms)
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })
}

export function ApiKeysView() {
  const router = useRouter()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [cost, setCost] = useState(60)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [freshKey, setFreshKey] = useState<{ key: string; name: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get<{ keys: ApiKey[]; generationCost: number }>("/api-keys", { skipAuthRedirect: true })
      setKeys(r.keys || [])
      setCost(r.generationCost || 60)
    } catch {
      setKeys([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Загрузка ключей — выборка из внешней системы (сеть). setState внутри load()
    // происходит только после await, а не синхронно (валидный случай из самого
    // сообщения правила react-hooks/set-state-in-effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function revoke(id: number) {
    try {
      await apiClient.post(`/api-keys/${id}/revoke`, {})
      void load()
    } catch {
      /* тихо — список перезагрузится при следующем действии */
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #160B24 100%)", color: COLORS.text }}>
      <PremiumBackground variant="ideas" />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-[1100px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-[32px] font-semibold leading-tight">
              <KeyRound size={28} strokeWidth={1.75} style={{ color: COLORS.accent }} /> API-ключи
            </h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Программный доступ к генерации проектов OSGARD — встройте платформу в свой продукт
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-transform hover:scale-[1.03]"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              <Plus size={16} strokeWidth={2} /> Выпустить ключ
            </button>
            <button
              type="button"
              onClick={() => router.push("/marketplace")}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px]"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              <Store size={16} strokeWidth={1.75} /> К маркетплейсу
            </button>
          </div>
        </div>

        {/* Документация быстрого старта */}
        <div className="mt-8 rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center gap-2">
            <Terminal size={18} style={{ color: COLORS.accent }} />
            <h2 className="text-[16px] font-medium">Быстрый старт</h2>
          </div>
          <p className="mt-2 text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            Каждый вызов генерации списывает <b style={{ color: COLORS.accent }}>{cost} кредитов</b> с вашего кошелька.
            Передавайте ключ в заголовке <code className="rounded px-1" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>X-API-Key</code>.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg p-4 text-[12px] leading-relaxed" style={{ backgroundColor: "#0A0A12", border: `1px solid ${COLORS.border}`, color: "#B8C0E0" }}>
{`curl -X POST https://osgard.app/v1/generate \\
  -H "X-API-Key: osk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Task tracker", "hint": "with kanban board"}'

# → 202 { project, artifacts, costCredits, pollUrl }
# Опрос статуса:
curl https://osgard.app/v1/projects/123 -H "X-API-Key: osk_live_..."`}
          </pre>
          <div className="mt-4 flex flex-wrap gap-4 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} style={{ color: COLORS.green }} /> Секрет хранится как хеш</span>
            <span className="inline-flex items-center gap-1.5"><Activity size={13} style={{ color: COLORS.amber }} /> Лимит частоты на каждый ключ</span>
          </div>
        </div>

        {/* Список ключей */}
        {loading ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-[14px]" style={{ color: COLORS.label }}>
            <Loader2 size={18} className="animate-spin" /> Загрузка ключей…
          </div>
        ) : keys.length === 0 ? (
          <div className="mt-8 rounded-2xl px-6 py-16 text-center" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <KeyRound size={32} strokeWidth={1.25} style={{ color: COLORS.label }} className="mx-auto" />
            <p className="mt-4 text-[16px]">У вас пока нет API-ключей</p>
            <p className="mt-1 text-[13px]" style={{ color: COLORS.label }}>Выпустите первый ключ, чтобы начать интеграцию.</p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-col gap-3 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-medium">{k.name}</p>
                    <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ border: `1px solid ${k.status === "active" ? COLORS.green : COLORS.red}`, color: k.status === "active" ? COLORS.green : COLORS.red }}>
                      {k.status === "active" ? "активен" : "отозван"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[13px]" style={{ color: COLORS.label }}>{k.prefix}••••••••</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                    <span>Вызовов: {k.calls ?? k.requestCount}</span>
                    <span>Списано: {Math.round(k.creditsSpent ?? 0)} кр.</span>
                    <span>Лимит: {k.ratePerMin}/мин</span>
                    <span>Создан: {fmtDate(k.createdAt)}</span>
                    <span>Активность: {fmtDate(k.lastUsedAt)}</span>
                  </div>
                </div>
                {k.status === "active" && (
                  <button
                    type="button"
                    onClick={() => revoke(k.id)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.red }}
                  >
                    <Trash2 size={14} /> Отозвать
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {createOpen && (
        <CreateKeyModal
          onClose={() => setCreateOpen(false)}
          onCreated={(raw, name) => {
            setCreateOpen(false)
            setFreshKey({ key: raw, name })
            void load()
          }}
        />
      )}

      {freshKey && <RevealKeyModal keyValue={freshKey.key} name={freshKey.name} onClose={() => setFreshKey(null)} />}
    </div>
  )
}

/* ---------------- Модалка выпуска ---------------- */
function CreateKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (raw: string, name: string) => void }) {
  const [name, setName] = useState("")
  const [rate, setRate] = useState("30")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) {
      setErr("Укажите название ключа")
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const r = await apiClient.post<{ key: string }>("/api-keys", { name: name.trim(), ratePerMin: Number(rate) || 30 })
      onCreated(r.key, name.trim())
    } catch (e: any) {
      setErr(e?.message || "Не удалось выпустить ключ")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-[460px] overflow-hidden rounded-2xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="flex items-center gap-2 text-[18px] font-semibold"><KeyRound size={18} /> Новый API-ключ</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} style={{ color: COLORS.label }}><X size={18} /></button>
        </div>
        <div className="px-7 py-6">
          <label className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Название (для чего ключ)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Продакшн-бэкенд" className="cal-input" />
          <label className="mb-2 mt-4 block text-[13px]" style={{ color: COLORS.label }}>Лимит запросов в минуту (1–240)</label>
          <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} min={1} max={240} className="cal-input" />
          {err && <p className="mt-3 text-[12px]" style={{ color: COLORS.red }}>{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-7 py-5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Отмена</button>
          <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium disabled:opacity-50" style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}>
            {busy && <Loader2 size={15} className="animate-spin" />} Выпустить
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Модалка показа секрета (один раз) ---------------- */
function RevealKeyModal({ keyValue, name, onClose }: { keyValue: string; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(keyValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard недоступен — пользователь скопирует вручную */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.8)" }}>
      <div className="w-full max-w-[520px] overflow-hidden rounded-2xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.accent}` }}>
        <div className="px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="flex items-center gap-2 text-[18px] font-semibold"><ShieldCheck size={18} style={{ color: COLORS.green }} /> Ключ «{name}» создан</h2>
        </div>
        <div className="px-7 py-6">
          <p className="text-[13px]" style={{ color: COLORS.amber }}>
            Скопируйте секрет сейчас — он показывается только один раз. Позже вы увидите лишь префикс.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-lg p-3" style={{ backgroundColor: "#0A0A12", border: `1px solid ${COLORS.border}` }}>
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px]" style={{ color: "#B8C0E0" }}>{keyValue}</code>
            <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px]" style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}>
              {copied ? <><Check size={13} /> Скопировано</> : <><Copy size={13} /> Копировать</>}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end px-7 py-5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] font-medium" style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}>Готово, я сохранил ключ</button>
        </div>
      </div>
    </div>
  )
}
