"use client"

/* ================================================================
   IntegrationsDetailView — создание/редактирование интеграции
   ----------------------------------------------------------------
   id === "new"  → форма подключения нового коннектора (?connector=id)
   id === number → редактирование, тест, выполнение действия,
                   журнал вызовов, генератор кода
   ================================================================ */

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Loader2,
  Play,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Power,
} from "lucide-react"
import { Navbar } from "./navbar"
import { COLORS } from "@/lib/economy"
import { integrationsApi } from "@/lib/integrations/api"
import { ApiError } from "@/lib/api-client"
import { ConnectorIcon } from "./integrations/connector-icon"
import type { ActionResult, ConnectorPublic, Integration, IntegrationLog } from "@/lib/integrations/types"

interface IntegrationsDetailViewProps {
  id: number | "new"
}

function statusColor(status: "success" | "error"): string {
  return status === "success" ? COLORS.green : COLORS.red
}

export function IntegrationsDetailView({ id }: IntegrationsDetailViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetConnectorId = searchParams.get("connector") ?? ""

  const [connectors, setConnectors] = useState<ConnectorPublic[]>([])
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedConnectorId, setSelectedConnectorId] = useState(presetConnectorId)
  const [name, setName] = useState("")
  const [config, setConfig] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [testResult, setTestResult] = useState<ActionResult | null>(null)
  const [testing, setTesting] = useState(false)

  const [logs, setLogs] = useState<IntegrationLog[]>([])

  const [execActionId, setExecActionId] = useState("")
  const [execParams, setExecParams] = useState<Record<string, string>>({})
  const [execResult, setExecResult] = useState<ActionResult | null>(null)
  const [executing, setExecuting] = useState(false)

  const [codeActionId, setCodeActionId] = useState("")
  const [code, setCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      setLoading(true)
      setError(null)
    })
    Promise.all([integrationsApi.getConnectors(), id === "new" ? Promise.resolve(null) : integrationsApi.getIntegration(id)])
      .then(([conns, integ]) => {
        if (cancelled) return
        setConnectors(conns)
        if (integ) {
          setIntegration(integ)
          setName(integ.name)
          setConfig(integ.config)
          setSelectedConnectorId(integ.connectorId)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Не удалось загрузить данные")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (id !== "new" && integration) loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration?.id])

  const connector = connectors.find((c) => c.id === selectedConnectorId)

  async function loadLogs() {
    if (id === "new") return
    try {
      const data = await integrationsApi.getLogs(id, 20)
      setLogs(data)
    } catch {
      /* журнал не критичен для основной работы страницы */
    }
  }

  async function handleSave() {
    if (!connector) return
    setSaving(true)
    setError(null)
    try {
      if (id === "new") {
        const created = await integrationsApi.createIntegration({
          connectorId: connector.id,
          name: name.trim() || connector.name,
          config,
        })
        router.replace(`/integrations/${created.id}`)
      } else {
        const updated = await integrationsApi.updateIntegration(id, { name, config })
        setIntegration(updated)
        setConfig(updated.config)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить интеграцию")
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (id === "new" || !integration) return
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const result = await integrationsApi.testIntegration(integration.id)
      setTestResult(result)
      const refreshed = await integrationsApi.getIntegration(integration.id)
      setIntegration(refreshed)
      loadLogs()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка тестирования")
    } finally {
      setTesting(false)
    }
  }

  async function handleToggleStatus() {
    if (id === "new" || !integration) return
    const nextStatus = integration.status === "active" ? "disabled" : "active"
    try {
      const updated = await integrationsApi.updateIntegration(integration.id, { status: nextStatus })
      setIntegration(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось изменить статус")
    }
  }

  async function handleDelete() {
    if (id === "new" || !integration) return
    if (!confirm(`Удалить интеграцию «${integration.name}»?`)) return
    setDeleting(true)
    try {
      await integrationsApi.deleteIntegration(integration.id)
      router.push("/integrations")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить интеграцию")
      setDeleting(false)
    }
  }

  async function handleExecute() {
    if (id === "new" || !integration || !execActionId) return
    setExecuting(true)
    setExecResult(null)
    setError(null)
    try {
      const result = await integrationsApi.executeIntegration(integration.id, execActionId, execParams)
      setExecResult(result)
      loadLogs()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка выполнения")
    } finally {
      setExecuting(false)
    }
  }

  async function handleLoadCode(actionId: string) {
    if (id === "new" || !integration) return
    setCodeActionId(actionId)
    setCodeLoading(true)
    setCode(null)
    try {
      const { code: snippet } = await integrationsApi.getCode(integration.id, actionId)
      setCode(snippet)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось получить код")
    } finally {
      setCodeLoading(false)
    }
  }

  function handleCopyCode() {
    if (!code) return
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const execAction = connector?.actions.find((a) => a.id === execActionId)

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[860px] px-6 py-10 md:px-10 md:py-12">
        <button
          type="button"
          onClick={() => router.push("/integrations")}
          className="inline-flex items-center gap-1.5 text-[13px]"
          style={{ color: COLORS.label }}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Интеграции
        </button>

        {error && (
          <p className="mt-4 rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: COLORS.red }}>
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: COLORS.accent }} />
          </div>
        ) : id === "new" && !connector ? (
          /* Выбор коннектора, если не передан через ?connector= */
          <div className="mt-8">
            <h1 className="text-[24px] font-semibold">Выберите сервис</h1>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {connectors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedConnectorId(c.id)}
                  className="flex items-center gap-3 rounded-xl p-4 text-left transition-colors"
                  style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                >
                  <ConnectorIcon icon={c.icon} color={COLORS.accent} />
                  <div>
                    <p className="text-[14px] font-medium">{c.name}</p>
                    <p className="text-[12px]" style={{ color: COLORS.label }}>{c.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {connector && <ConnectorIcon icon={connector.icon} size={26} color={COLORS.accent} />}
                <div>
                  <h1 className="text-[24px] font-semibold leading-tight">{integration ? integration.name : connector?.name}</h1>
                  <p className="text-[13px]" style={{ color: COLORS.label }}>{connector?.description}</p>
                </div>
              </div>

              {integration && (
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
                    style={{
                      backgroundColor: integration.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)",
                      color: integration.status === "active" ? COLORS.green : COLORS.label,
                    }}
                  >
                    {integration.status === "active" ? "активна" : "отключена"}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleStatus}
                    title={integration.status === "active" ? "Отключить" : "Включить"}
                    className="inline-flex items-center rounded-lg p-1.5"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    <Power size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center rounded-lg p-1.5 disabled:opacity-50"
                    style={{ color: COLORS.red }}
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={1.75} />}
                  </button>
                </div>
              )}
            </div>

            {/* Форма подключения */}
            <section className="mt-6 rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h2 className="text-[14px] font-medium">Настройки подключения</h2>

              <label className="mt-3 block text-[12px]" style={{ color: COLORS.label }}>
                Название интеграции
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={connector?.name}
                  className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                  style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                />
              </label>

              {connector?.fields.map((f) => (
                <label key={f.key} className="mt-3 block text-[12px]" style={{ color: COLORS.label }}>
                  {f.label}
                  {f.required && <span style={{ color: COLORS.red }}> *</span>}
                  <input
                    type={f.type === "password" ? "password" : "text"}
                    value={config[f.key] ?? ""}
                    onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                    style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  />
                </label>
              ))}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {id === "new" ? "Подключить" : "Сохранить"}
                </button>

                {integration && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-50"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} strokeWidth={1.75} />}
                    Тест
                  </button>
                )}
              </div>

              {testResult && (
                <p
                  className="mt-3 rounded-lg px-3 py-2 text-[12px]"
                  style={{
                    backgroundColor: testResult.success ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                    color: testResult.success ? COLORS.green : COLORS.red,
                  }}
                >
                  {testResult.success ? `Успешно (${testResult.durationMs} мс)` : testResult.error}
                </p>
              )}
            </section>

            {/* Выполнение действия */}
            {integration && connector && (
              <section className="mt-6 rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <h2 className="text-[14px] font-medium">Выполнить действие</h2>

                <label className="mt-3 block text-[12px]" style={{ color: COLORS.label }}>
                  Действие
                  <select
                    value={execActionId}
                    onChange={(e) => {
                      setExecActionId(e.target.value)
                      setExecParams({})
                      setExecResult(null)
                    }}
                    className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                    style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    <option value="">Выберите действие…</option>
                    {connector.actions.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </label>

                {execAction?.params.map((p) => (
                  <label key={p.key} className="mt-3 block text-[12px]" style={{ color: COLORS.label }}>
                    {p.label}
                    {p.required && <span style={{ color: COLORS.red }}> *</span>}
                    <input
                      value={execParams[p.key] ?? ""}
                      onChange={(e) => setExecParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                      className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                      style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                    />
                  </label>
                ))}

                {execAction && (
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={executing || integration.status !== "active"}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                  >
                    {executing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} strokeWidth={1.75} />}
                    Выполнить
                  </button>
                )}

                {execResult && (
                  <pre
                    className="mt-3 max-h-64 overflow-auto rounded-lg px-3 py-2 text-[11px] leading-snug"
                    style={{
                      backgroundColor: execResult.success ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                      color: execResult.success ? COLORS.green : COLORS.red,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {execResult.success ? JSON.stringify(execResult.data, null, 2) : execResult.error}
                  </pre>
                )}

                {/* Пример кода */}
                <div className="mt-5 border-t pt-4" style={{ borderColor: COLORS.border }}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-medium">Пример кода</h3>
                    <select
                      value={codeActionId}
                      onChange={(e) => handleLoadCode(e.target.value)}
                      className="rounded-lg px-2 py-1 text-[12px] outline-none"
                      style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                    >
                      <option value="">Действие…</option>
                      {connector.actions.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>

                  {codeLoading ? (
                    <div className="mt-3 flex justify-center">
                      <Loader2 size={16} className="animate-spin" style={{ color: COLORS.accent }} />
                    </div>
                  ) : code ? (
                    <div className="relative mt-3">
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]"
                        style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? "Скопировано" : "Копировать"}
                      </button>
                      <pre
                        className="max-h-80 overflow-auto rounded-lg px-3 py-3 text-[11px] leading-snug"
                        style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, whiteSpace: "pre-wrap" }}
                      >
                        {code}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            {/* Журнал вызовов */}
            {integration && logs.length > 0 && (
              <section className="mt-6 rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
                <h2 className="text-[14px] font-medium">Журнал вызовов</h2>
                <div className="mt-3 space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
                      style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}
                    >
                      {log.status === "success" ? (
                        <CheckCircle2 size={13} style={{ color: statusColor("success") }} />
                      ) : (
                        <XCircle size={13} style={{ color: statusColor("error") }} />
                      )}
                      <span className="font-medium">{log.action_id}</span>
                      <span style={{ color: COLORS.label }}>{log.duration_ms} мс</span>
                      <span className="ml-auto" style={{ color: COLORS.label }}>
                        {new Date(log.created_at).toLocaleString("ru-RU")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
