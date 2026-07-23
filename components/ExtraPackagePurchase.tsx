"use client"

/* ================================================================
   ExtraPackagePurchase — докупка пакетов AI-провайдеров
   ----------------------------------------------------------------
   Для Pro/Supreme/Duo/Elite (проверяется через GET /subscription/ai-usage,
   поле plan). Free-пользователям недоступно — сервер вернёт 400.

   Пакеты не сгорают и переносятся на следующие месяцы (extra_credits),
   тратятся только после исчерпания месячной базовой квоты оркестратора.

   Если Stripe не настроен — mock-режим (dev): кредиты зачисляются сразу.
   Иначе редирект на Stripe Checkout (mode: "payment"), возврат на
   /wallet?extra_package=success|cancel&provider=...
   ================================================================ */

import { useEffect, useState } from "react"
import { Loader2, ShoppingBag } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"

type AiProvider = "claude" | "grok" | "deepseek"

const PACKAGES: { provider: AiProvider; label: string; amount: number; priceLabel: string; color: string }[] = [
  { provider: "claude", label: "OS 5.0 (Claude)", amount: 5, priceLabel: "$19", color: "#F59E0B" },
  { provider: "grok", label: "OS 3.3 (Grok)", amount: 10, priceLabel: "$15", color: "#A855F7" },
  { provider: "deepseek", label: "OS 3.0 (DeepSeek)", amount: 10, priceLabel: "$10", color: "#06B6D4" },
]

const PACKAGE_LABELS: Record<AiProvider, string> = {
  claude: "OS 5.0 (Claude)",
  grok: "OS 3.3 (Grok)",
  deepseek: "OS 3.0 (DeepSeek)",
}

export function ExtraPackagePurchase() {
  const { user } = useAuth()
  const [plan, setPlan] = useState<string | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(true)
  const [busyProvider, setBusyProvider] = useState<AiProvider | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!user) {
      Promise.resolve().then(() => setLoadingPlan(false))
      return
    }
    apiClient
      .get<{ plan: string }>("/subscription/ai-usage", { skipAuthRedirect: true } as any)
      .then((res) => setPlan(res.plan))
      .catch(() => {})
      .finally(() => setLoadingPlan(false))
  }, [user])

  /* Разбираем redirect-параметры Stripe (?extra_package=success|cancel&provider=...) один раз при монтировании */
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const status = params.get("extra_package")
    if (!status) return

    const provider = params.get("provider") as AiProvider | null
    Promise.resolve().then(() => {
      setNotice({
        ok: status === "success",
        text:
          status === "success"
            ? `✅ Пакет «${provider ? PACKAGE_LABELS[provider] ?? provider : ""}» успешно куплен`
            : "Покупка пакета отменена",
      })
    })

    params.delete("extra_package")
    params.delete("provider")
    const rest = params.toString()
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""))
  }, [])

  async function handleBuy(provider: AiProvider) {
    setBusyProvider(provider)
    setNotice(null)
    try {
      const res = await apiClient.post<{ mock?: boolean; url?: string }>("/subscription/extra-package", { provider })
      if (res.mock) {
        setNotice({ ok: true, text: `✅ Пакет «${PACKAGE_LABELS[provider]}» зачислен (dev-режим)` })
      } else if (res.url) {
        window.location.assign(res.url)
      }
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || "Ошибка покупки пакета" })
    } finally {
      setBusyProvider(null)
    }
  }

  if (!user || loadingPlan) return null
  if (!plan || plan === "free") return null

  return (
    <section
      className="rounded-2xl p-6"
      style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}
        >
          <ShoppingBag size={15} style={{ color: "#06B6D4" }} />
        </div>
        <div>
          <p className="text-[14px] font-semibold">Докупить пакет запросов</p>
          <p className="text-[11px]" style={{ color: "#6A6A8A" }}>Не сгорают, переносятся на следующие месяцы</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PACKAGES.map(({ provider, label, amount, priceLabel, color }) => (
          <div
            key={provider}
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: `${color}0d`, border: `1px solid ${color}30` }}
          >
            <div>
              <p className="text-[13px] font-medium" style={{ color }}>{label}</p>
              <p className="text-[18px] font-semibold mt-1">+{amount}</p>
              <p className="text-[11px]" style={{ color: "#6A6A8A" }}>{priceLabel} · разово</p>
            </div>
            <button
              type="button"
              onClick={() => handleBuy(provider)}
              disabled={busyProvider !== null}
              className="flex items-center justify-center gap-1.5 w-full rounded-lg py-2 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: `${color}22`, border: `1px solid ${color}45`, color }}
            >
              {busyProvider === provider && <Loader2 size={13} className="animate-spin" />}
              Купить
            </button>
          </div>
        ))}
      </div>

      {notice && (
        <p className="mt-4 text-[12px]" role="status" style={{ color: notice.ok ? "#34D399" : "#EF4444" }}>
          {notice.text}
        </p>
      )}
    </section>
  )
}
