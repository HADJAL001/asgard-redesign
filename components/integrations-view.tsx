"use client"

/* ================================================================
   IntegrationsView — Service Bridge: список подключений + каталог
   ----------------------------------------------------------------
   GET  /integrations/connectors   — каталог доступных коннекторов
   GET  /integrations              — подключения текущего пользователя
   GET  /integrations/meta/remaining — остаток квоты вызовов
   DELETE /integrations/:id        — удалить подключение
   ================================================================ */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plug, Plus, Trash2, Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import { Navbar } from "./navbar"
import { COLORS } from "@/lib/economy"
import { integrationsApi } from "@/lib/integrations/api"
import { ApiError } from "@/lib/api-client"
import { ConnectorIcon } from "./integrations/connector-icon"
import type { ConnectorPublic, Integration, IntegrationsQuota } from "@/lib/integrations/types"

export function IntegrationsView() {
  const router = useRouter()

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [connectors, setConnectors] = useState<ConnectorPublic[]>([])
  const [quota, setQuota] = useState<IntegrationsQuota | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [integs, conns, q] = await Promise.all([
        integrationsApi.getIntegrations(),
        integrationsApi.getConnectors(),
        integrationsApi.getRemainingQuota(),
      ])
      setIntegrations(integs)
      setConnectors(conns)
      setQuota(q)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить интеграции")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [load])

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm("Удалить эту интеграцию?")) return
    setDeletingId(id)
    try {
      await integrationsApi.deleteIntegration(id)
      setIntegrations((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить интеграцию")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg" style={{ border: `1px solid ${COLORS.border}` }}>
              <Plug size={18} strokeWidth={1.5} style={{ color: COLORS.accent }} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-[32px] font-semibold leading-tight">Интеграции</h1>
              <p className="mt-0.5 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Service Bridge — подключайте внешние сервисы к вашим сценариям
              </p>
            </div>
          </div>

          {quota && (
            <div className="rounded-lg px-3 py-2 text-[12px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}>
              {quota.total === null ? (
                <span style={{ color: COLORS.green }}>Безлимитные вызовы</span>
              ) : (
                <span>
                  Вызовов сегодня: <span style={{ color: COLORS.text }}>{quota.remaining}</span> / {quota.total}
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-6 rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: COLORS.red }}>
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: COLORS.accent }} />
          </div>
        ) : (
          <>
            {/* Мои интеграции */}
            <section className="mt-8">
              <h2 className="text-[18px] font-medium">Мои интеграции</h2>

              {integrations.length === 0 ? (
                <div className="mt-4 flex flex-col items-center gap-3 rounded-xl py-14 text-center" style={{ border: `1px dashed ${COLORS.border}` }}>
                  <Plug size={28} strokeWidth={1.25} style={{ color: COLORS.label }} aria-hidden="true" />
                  <p style={{ color: COLORS.label }}>У вас пока нет подключённых интеграций</p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {integrations.map((integ) => (
                    <div
                      key={integ.id}
                      onClick={() => router.push(`/integrations/${integ.id}`)}
                      className="cursor-pointer rounded-xl p-5 transition-colors"
                      style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ConnectorIcon icon={connectors.find((c) => c.id === integ.connectorId)?.icon ?? "plug"} color={COLORS.accent} />
                          <p className="text-[15px] font-medium">{integ.name}</p>
                        </div>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: integ.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)",
                            color: integ.status === "active" ? COLORS.green : COLORS.label,
                          }}
                        >
                          {integ.status === "active" ? "активна" : "отключена"}
                        </span>
                      </div>

                      <p className="mt-1 text-[13px]" style={{ color: COLORS.label }}>
                        {integ.connectorName}
                      </p>

                      <div className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.label }}>
                        {integ.lastTestStatus === "success" ? (
                          <CheckCircle2 size={13} style={{ color: COLORS.green }} />
                        ) : integ.lastTestStatus === "error" ? (
                          <XCircle size={13} style={{ color: COLORS.red }} />
                        ) : (
                          <MinusCircle size={13} style={{ color: COLORS.label }} />
                        )}
                        {integ.lastTestAt ? `Проверено ${new Date(integ.lastTestAt).toLocaleString("ru-RU")}` : "Ещё не проверялась"}
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/integrations/${integ.id}`)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
                          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                        >
                          Открыть
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(integ.id, e)}
                          disabled={deletingId === integ.id}
                          className="ml-auto inline-flex items-center rounded-lg p-1.5 disabled:opacity-50"
                          style={{ color: COLORS.red }}
                        >
                          {deletingId === integ.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={1.75} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Каталог коннекторов (Service Hub) */}
            <section className="mt-12">
              <h2 className="text-[18px] font-medium">Каталог сервисов</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {connectors.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl p-5"
                    style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
                  >
                    <div className="flex items-center gap-2">
                      <ConnectorIcon icon={c.icon} color={COLORS.accent} />
                      <p className="text-[15px] font-medium">{c.name}</p>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px]" style={{ color: COLORS.label }}>
                      {c.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push(`/integrations/new?connector=${c.id}`)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90"
                      style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                    >
                      <Plus size={13} strokeWidth={1.75} />
                      Подключить
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
