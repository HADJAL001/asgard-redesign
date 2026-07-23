"use client"

import "@xyflow/react/dist/style.css"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
} from "@xyflow/react"
import { Loader2, Play, Save, Coins, Bot, CheckCircle2 } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { orchestratorApi } from "@/lib/orchestrator/api"
import { temperatureLabel } from "@/lib/orchestrator/temperature-label"
import { ApiError } from "@/lib/api-client"
import { useOrchestratorRun } from "@/hooks/useOrchestratorRun"
import { ORCHESTRATOR_PALETTE, DRAG_DATA_FORMAT } from "./node-types"
import { OrchestratorNode } from "./nodes/OrchestratorNode"
import { SnakeEdge } from "./edges/SnakeEdge"
import { PremiumModal } from "@/components/PremiumModal"
import { integrationsApi } from "@/lib/integrations/api"
import type { ConnectorPublic, Integration } from "@/lib/integrations/types"
import type {
  OrchestratorChain,
  OrchestratorFlowEdge,
  OrchestratorFlowNode,
  OrchestratorNodeType,
} from "@/lib/orchestrator/types"

const NODE_TYPES = { orchestratorNode: OrchestratorNode }
const EDGE_TYPES = { snake: SnakeEdge }
const DEFAULT_EDGE_OPTIONS = { type: "snake" }
const MAX_NODES = 20

/** Старые сохранённые цепочки могут хранить edges без type — проставляем "snake" сразу при инициализации, чтобы не было "мигания" стандартной связи. */
function normalizeEdges(edges: OrchestratorFlowEdge[]): OrchestratorFlowEdge[] {
  return edges.map((edge) => (edge.type ? edge : { ...edge, type: "snake" }))
}

/** Старые сохранённые узлы могут хранить сырое имя провайдера в data.label ещё до ребрендинга — приводим такие значения к актуальному дефолту из палитры. Любое реальное пользовательское имя узла (не совпадающее с "Claude"/"DeepSeek"/"Grok") остаётся нетронутым. */
const STALE_PROVIDER_LABELS: Record<string, string> = {
  claude: "claude",
  deepseek: "deepseek",
  grok: "grok",
}
function normalizeNodes(nodes: OrchestratorFlowNode[]): OrchestratorFlowNode[] {
  return nodes.map((node) => {
    const isStale = STALE_PROVIDER_LABELS[node.data.type] === node.data.label?.trim().toLowerCase()
    if (!isStale) return node
    const palette = ORCHESTRATOR_PALETTE.find((p) => p.type === node.data.type)
    if (!palette) return node
    return { ...node, data: { ...node.data, label: palette.defaultData.label } }
  })
}

let idCounter = 0
function nextNodeId() {
  idCounter += 1
  return `node_${Date.now()}_${idCounter}`
}

interface OrchestratorEditorProps {
  chainId: number | "new"
  initialChain?: OrchestratorChain | null
  autoRun?: boolean
  /** Отдаёт наружу функцию добавления узла кликом по палитре (OrchestratorPanel живёт вне ReactFlowProvider). */
  onRegisterAddNode?: (addNode: (nodeType: OrchestratorNodeType) => void) => void
}

function EditorInner({ chainId, initialChain, autoRun, onRegisterAddNode }: OrchestratorEditorProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { screenToFlowPosition } = useReactFlow()

  const [name, setName] = useState(initialChain?.name ?? t("orchestrator.untitled"))
  const [nodes, setNodes, onNodesChange] = useNodesState<OrchestratorFlowNode>(normalizeNodes(initialChain?.nodes ?? []))
  const [edges, setEdges, onEdgesChange] = useEdgesState<OrchestratorFlowEdge>(normalizeEdges(initialChain?.edges ?? []))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [chainInput, setChainInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [runCost, setRunCost] = useState<number | null>(null)
  const [executionId, setExecutionId] = useState<number | null>(null)
  const [currentChainId, setCurrentChainId] = useState(chainId)
  const [insufficientTcOpen, setInsufficientTcOpen] = useState(false)

  // Квота запросов
  const [quota, setQuota] = useState<{ remaining: number; total: number } | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)

  // Интеграции для узла Service Call (инспектор)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [connectors, setConnectors] = useState<ConnectorPublic[]>([])

  // Шаблон ДЖАРВИСА
  const [isJarvisTemplate, setIsJarvisTemplate] = useState<boolean>(
    initialChain?.is_jarvis_template === 1,
  )
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)

  const run = useOrchestratorRun(executionId, nodes.map((n) => n.id))
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  // Загружаем квоту при монтировании и после каждого запуска
  useEffect(() => {
    if (currentChainId === "new") return
    setQuotaLoading(true)
    orchestratorApi
      .getRemainingQuota()
      .then(setQuota)
      .catch(() => {
        /* не критично — квота недоступна для non-premium, не показываем */
      })
      .finally(() => setQuotaLoading(false))
  }, [currentChainId, executionId])

  // Интеграции/коннекторы для инспектора узла Service Call — грузим один раз при монтировании.
  useEffect(() => {
    integrationsApi.getIntegrations().then(setIntegrations).catch(() => {})
    integrationsApi.getConnectors().then(setConnectors).catch(() => {})
  }, [])

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, type: "snake" }, eds)),
    [setEdges],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const nodeType = event.dataTransfer.getData(DRAG_DATA_FORMAT) as OrchestratorNodeType
      if (!nodeType) return
      const palette = ORCHESTRATOR_PALETTE.find((p) => p.type === nodeType)
      if (!palette) return
      if (nodes.length >= MAX_NODES) {
        setSaveError(t("orchestrator.maxNodesReached", { max: MAX_NODES }))
        return
      }

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const newNode: OrchestratorFlowNode = {
        id: nextNodeId(),
        type: "orchestratorNode",
        position,
        data: { ...palette.defaultData },
      }
      setNodes((nds) => nds.concat(newNode))
    },
    [screenToFlowPosition, setNodes, nodes.length, t],
  )

  /** Альтернатива onDrop для клика по карточке палитры (вместо перетаскивания) — ставит узел
   *  в видимую область канваса со смещением по числу уже добавленных узлов, чтобы новые узлы
   *  не ложились друг на друга стопкой. */
  const addNodeFromPalette = useCallback(
    (nodeType: OrchestratorNodeType) => {
      const palette = ORCHESTRATOR_PALETTE.find((p) => p.type === nodeType)
      if (!palette) return
      if (nodes.length >= MAX_NODES) {
        setSaveError(t("orchestrator.maxNodesReached", { max: MAX_NODES }))
        return
      }

      const rect = wrapperRef.current?.getBoundingClientRect()
      const centerX = rect ? rect.left + rect.width / 2 : 300
      const centerY = rect ? rect.top + rect.height / 2 : 200
      const stagger = (nodes.length % 6) * 28
      const position = screenToFlowPosition({ x: centerX + stagger, y: centerY + stagger })

      const newNode: OrchestratorFlowNode = {
        id: nextNodeId(),
        type: "orchestratorNode",
        position,
        data: { ...palette.defaultData },
      }
      setNodes((nds) => nds.concat(newNode))
    },
    [screenToFlowPosition, setNodes, nodes.length, t],
  )

  useEffect(() => {
    onRegisterAddNode?.(addNodeFromPalette)
  }, [onRegisterAddNode, addNodeFromPalette])

  function updateSelectedNodeData(patch: Partial<OrchestratorFlowNode["data"]>) {
    if (!selectedNodeId) return
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const input = { name, nodes, edges }
      if (currentChainId === "new") {
        const created = await orchestratorApi.createChain(input)
        setCurrentChainId(created.id)
        window.history.replaceState(null, "", `/orchestrator/${created.id}`)
      } else {
        await orchestratorApi.updateChain(currentChainId, input)
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("orchestrator.saveError"))
    } finally {
      setSaving(false)
    }
  }

  async function handleRun() {
    if (currentChainId === "new") {
      setSaveError(t("orchestrator.saveBeforeRun"))
      return
    }
    if (!chainInput.trim()) {
      setSaveError(t("orchestrator.chainInputRequired"))
      return
    }
    setSaveError(null)
    setRunCost(null)
    try {
      const { executionId: newExecutionId, cost } = await orchestratorApi.runChain(currentChainId, chainInput)
      setRunCost(cost)
      setExecutionId(newExecutionId)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("orchestrator.runError")
      if (/timecoin/i.test(message)) {
        setInsufficientTcOpen(true)
      } else {
        setSaveError(message)
      }
    }
  }

  async function handleToggleJarvisTemplate() {
    if (currentChainId === "new") {
      setSaveError(t("orchestrator.saveBeforeTemplate"))
      return
    }
    setSavingTemplate(true)
    setSaveError(null)
    try {
      if (isJarvisTemplate) {
        await orchestratorApi.removeJarvisTemplate(currentChainId)
        setIsJarvisTemplate(false)
      } else {
        await orchestratorApi.saveAsJarvisTemplate(currentChainId)
        setIsJarvisTemplate(true)
        setTemplateSaved(true)
        setTimeout(() => setTemplateSaved(false), 3000)
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("orchestrator.templateError"))
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleRunRef = useRef(handleRun)
  handleRunRef.current = handleRun

  useEffect(() => {
    if (autoRun && currentChainId !== "new") {
      handleRunRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, currentChainId])

  const displayNodes = nodes.map((n) => {
    const liveStatus = run.nodes.find((s) => s.id === n.id)
    return liveStatus ? { ...n, data: { ...n.data, status: liveStatus.status, output: liveStatus.output } } : n
  })

  // Цвет индикатора квоты
  function quotaColor(remaining: number, total: number): string {
    const ratio = remaining / total
    if (ratio > 0.5) return COLORS.green
    if (ratio > 0.2) return COLORS.accent
    return COLORS.red
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[14px] font-medium outline-none"
          style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        />

        {/* Счётчик узлов цепочки */}
        <div
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium"
          style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: nodes.length >= MAX_NODES ? COLORS.red : COLORS.label,
          }}
        >
          {t("orchestrator.editorNodeCount", { count: nodes.length, max: MAX_NODES })}
        </div>

        {/* Индикатор остатка запросов */}
        {quota !== null && !quotaLoading && (
          <div
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium"
            style={{
              backgroundColor: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: quotaColor(quota.remaining, quota.total),
            }}
            title={t("orchestrator.quotaTooltip", { remaining: quota.remaining, total: quota.total })}
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: quotaColor(quota.remaining, quota.total) }}
            />
            {t("orchestrator.quotaLabel", { remaining: quota.remaining, total: quota.total })}
          </div>
        )}

        {/* Кнопка «Шаблон ДЖАРВИСА» */}
        {currentChainId !== "new" && (
          <button
            type="button"
            onClick={handleToggleJarvisTemplate}
            disabled={savingTemplate}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors disabled:opacity-50"
            style={{
              border: `1px solid ${isJarvisTemplate ? COLORS.accent : COLORS.border}`,
              color: isJarvisTemplate ? COLORS.accent : COLORS.label,
              backgroundColor: isJarvisTemplate ? `rgba(0,212,255,0.06)` : "transparent",
            }}
            title={t(isJarvisTemplate ? "orchestrator.removeJarvisTemplate" : "orchestrator.saveAsJarvisTemplate")}
          >
            {savingTemplate ? (
              <Loader2 size={14} className="animate-spin" />
            ) : templateSaved ? (
              <CheckCircle2 size={14} style={{ color: COLORS.green }} />
            ) : (
              <Bot size={14} />
            )}
            {t(isJarvisTemplate ? "orchestrator.jarvisTemplateActive" : "orchestrator.jarvisTemplateBtn")}
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-50"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={1.75} />}
          {t("orchestrator.saveBtn")}
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={run.status === "running"}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
        >
          {run.status === "running" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} strokeWidth={1.75} />}
          {t("orchestrator.runBtn")}
        </button>
      </div>

      <label className="block text-[12px]" style={{ color: COLORS.label }}>
        {t("orchestrator.chainInputLabel")}
        <textarea
          value={chainInput}
          onChange={(e) => setChainInput(e.target.value)}
          rows={2}
          className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-[13px] outline-none"
          style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        />
      </label>

      {saveError && (
        <p className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: COLORS.red }}>
          {saveError}
        </p>
      )}
      {run.error && (
        <p className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: COLORS.red }}>
          {run.error}
        </p>
      )}
      {run.status === "success" && run.output && (
        <p className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "rgba(74,222,128,0.1)", color: COLORS.green }}>
          {run.output}
          {runCost !== null && (
            <span className="ml-2" style={{ color: COLORS.label }}>
              {t("orchestrator.runCost", { cost: runCost })}
            </span>
          )}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          ref={wrapperRef}
          className="min-h-[480px] flex-1 overflow-hidden rounded-xl"
          style={{ border: `1px solid ${COLORS.border}` }}
        >
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            colorMode="dark"
            fitView
          >
            <Background color={COLORS.border} gap={20} />
            <Controls />
            <MiniMap pannable zoomable style={{ backgroundColor: COLORS.card }} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div
            className="w-[280px] shrink-0 space-y-3 rounded-xl p-4"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <p className="text-[12px] font-medium uppercase tracking-wide" style={{ color: COLORS.label }}>
              {t("orchestrator.nodeParams")}
            </p>

            <label className="block text-[12px]" style={{ color: COLORS.label }}>
              {t("orchestrator.paramLabel")}
              <input
                value={selectedNode.data.label}
                onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              />
            </label>

            {selectedNode.data.type === "prompt_template" ? (
              <label className="block text-[12px]" style={{ color: COLORS.label }}>
                {t("orchestrator.paramTemplate")}
                <textarea
                  value={selectedNode.data.template ?? ""}
                  onChange={(e) => updateSelectedNodeData({ template: e.target.value })}
                  rows={4}
                  className="mt-1 w-full resize-none rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                  style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                />
              </label>
            ) : selectedNode.data.type === "service_call" ? (
              (() => {
                const selectedIntegration = integrations.find((i) => i.id === selectedNode.data.integrationId)
                const connector = selectedIntegration ? connectors.find((c) => c.id === selectedIntegration.connectorId) : undefined
                const action = connector?.actions.find((a) => a.id === selectedNode.data.actionId)

                return (
                  <>
                    {integrations.length === 0 ? (
                      <p className="rounded-lg px-2.5 py-2 text-[12px]" style={{ backgroundColor: COLORS.bg, color: COLORS.label }}>
                        {t("orchestrator.noIntegrations")}{" "}
                        <button
                          type="button"
                          onClick={() => router.push("/integrations")}
                          className="underline"
                          style={{ color: COLORS.accent }}
                        >
                          {t("orchestrator.noIntegrationsLink")}
                        </button>
                      </p>
                    ) : (
                      <label className="block text-[12px]" style={{ color: COLORS.label }}>
                        {t("orchestrator.paramIntegration")}
                        <select
                          value={selectedNode.data.integrationId ?? ""}
                          onChange={(e) =>
                            updateSelectedNodeData({
                              integrationId: e.target.value ? Number(e.target.value) : undefined,
                              actionId: undefined,
                              params: {},
                            })
                          }
                          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                          style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                        >
                          <option value="">{t("orchestrator.selectIntegration")}</option>
                          {integrations.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.connectorName})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {connector && (
                      <label className="block text-[12px]" style={{ color: COLORS.label }}>
                        {t("orchestrator.paramAction")}
                        <select
                          value={selectedNode.data.actionId ?? ""}
                          onChange={(e) => updateSelectedNodeData({ actionId: e.target.value || undefined, params: {} })}
                          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                          style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                        >
                          <option value="">{t("orchestrator.selectAction")}</option>
                          {connector.actions.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {action && action.params.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px]" style={{ color: COLORS.label }}>
                          {t("orchestrator.paramMappingHint")}
                        </p>
                        {action.params.map((p) => (
                          <label key={p.key} className="block text-[12px]" style={{ color: COLORS.label }}>
                            {p.label}
                            {p.required && <span style={{ color: COLORS.red }}> *</span>}
                            <input
                              value={selectedNode.data.params?.[p.key] ?? ""}
                              onChange={(e) =>
                                updateSelectedNodeData({ params: { ...selectedNode.data.params, [p.key]: e.target.value } })
                              }
                              placeholder="{{input}}"
                              className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                              style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()
            ) : (
              <>
                <label className="block text-[12px]" style={{ color: COLORS.label }}>
                  {t("orchestrator.paramSystemPrompt")}
                  <textarea
                    value={selectedNode.data.systemPrompt ?? ""}
                    onChange={(e) => updateSelectedNodeData({ systemPrompt: e.target.value })}
                    rows={4}
                    className="mt-1 w-full resize-none rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                    style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  />
                </label>

                <label className="block text-[12px]" style={{ color: COLORS.label }}>
                  {t("orchestrator.paramTemperature")}: {temperatureLabel(selectedNode.data.temperature ?? 0.7)}
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={selectedNode.data.temperature ?? 0.7}
                    onChange={(e) => updateSelectedNodeData({ temperature: Number(e.target.value) })}
                    className="mt-1 w-full"
                  />
                </label>

                <label className="block text-[12px]" style={{ color: COLORS.label }}>
                  {t("orchestrator.paramMaxTokens")}
                  <input
                    type="number"
                    min={1}
                    value={selectedNode.data.maxTokens ?? 1024}
                    onChange={(e) => updateSelectedNodeData({ maxTokens: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                    style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  />
                </label>
              </>
            )}
          </div>
        )}
      </div>

      <PremiumModal
        open={insufficientTcOpen}
        onClose={() => setInsufficientTcOpen(false)}
        maxWidth="sm"
        icon={<Coins size={20} style={{ color: COLORS.accent }} />}
        title={t("orchestrator.insufficientTcTitle")}
        subtitle={t("orchestrator.insufficientTcMessage")}
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/wallet")}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            {t("orchestrator.topUpBtn")}
          </button>
          <button
            type="button"
            onClick={() => setInsufficientTcOpen(false)}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-medium"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            {t("orchestrator.closeBtn")}
          </button>
        </div>
      </PremiumModal>
    </div>
  )
}

export function OrchestratorEditor(props: OrchestratorEditorProps) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
