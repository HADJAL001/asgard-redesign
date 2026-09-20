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
import { Loader2, Play, Save, Coins, Bot, CheckCircle2, Rocket, Zap, WandSparkles } from "lucide-react"
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
  OrchestratorWebhookTrigger,
} from "@/lib/orchestrator/types"

const NODE_TYPES = { orchestratorNode: OrchestratorNode }
const EDGE_TYPES = { snake: SnakeEdge }
const DEFAULT_EDGE_OPTIONS = { type: "snake" }
const MAX_NODES = 20
const FLOW_TEMPLATES: Array<{ label: string; types: OrchestratorNodeType[] }> = [
  { label: "Быстрый прототип", types: ["claude", "deepseek"] },
  { label: "Полный цикл", types: ["claude", "deepseek", "grok"] },
  { label: "Анализ данных", types: ["webhook_trigger", "claude", "grok"] },
]

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

  // Webhook Trigger (инспектор узла webhook_trigger)
  const [webhookTrigger, setWebhookTrigger] = useState<OrchestratorWebhookTrigger | null>(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookCopied, setWebhookCopied] = useState(false)

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
    Promise.resolve().then(() => setQuotaLoading(true))
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

  // Триггер для выбранного узла webhook_trigger — грузим при смене выделения (цепочка должна быть уже сохранена).
  useEffect(() => {
    if (!selectedNode || selectedNode.data.type !== "webhook_trigger" || currentChainId === "new") {
      Promise.resolve().then(() => setWebhookTrigger(null))
      return
    }
    Promise.resolve().then(() => setWebhookLoading(true))
    orchestratorApi
      .getWebhookTrigger(currentChainId, selectedNode.id)
      .then(setWebhookTrigger)
      .catch(() => setWebhookTrigger(null))
      .finally(() => setWebhookLoading(false))
    // Намеренно узкий список: selectedNode — нестабильная ссылка (пересоздаётся на
    // каждом рендере через .find()), полная зависимость дёргала бы запрос на каждый
    // ре-рендер, а не только при смене узла.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, selectedNode?.data.type, currentChainId])

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

  function loadTemplate(types: OrchestratorNodeType[]) {
    if (nodes.length > 0 && !window.confirm("Заменить текущие узлы готовой цепочкой?")) return
    const nextNodes = types.map((type, index) => {
      const palette = ORCHESTRATOR_PALETTE.find((item) => item.type === type)!
      return { id: nextNodeId(), type: "orchestratorNode", position: { x: 90 + index * 255, y: 185 + (index % 2) * 70 }, data: { ...palette.defaultData } } as OrchestratorFlowNode
    })
    setNodes(nextNodes)
    setEdges(nextNodes.slice(1).map((node, index) => ({ id: `edge_${node.id}`, source: nextNodes[index].id, target: node.id, type: "snake" })))
    setSelectedNodeId(null)
    setSaveError(null)
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

  async function handleGenerateWebhook() {
    if (!selectedNode || currentChainId === "new") return
    setWebhookLoading(true)
    setSaveError(null)
    try {
      const trigger = await orchestratorApi.createOrRegenerateWebhookTrigger(currentChainId, selectedNode.id)
      setWebhookTrigger(trigger)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("orchestrator.webhookError"))
    } finally {
      setWebhookLoading(false)
    }
  }

  async function handleDeleteWebhook() {
    if (!selectedNode || currentChainId === "new") return
    setWebhookLoading(true)
    setSaveError(null)
    try {
      await orchestratorApi.deleteWebhookTrigger(currentChainId, selectedNode.id)
      setWebhookTrigger(null)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("orchestrator.webhookError"))
    } finally {
      setWebhookLoading(false)
    }
  }

  function handleCopyWebhookUrl() {
    if (!webhookTrigger) return
    navigator.clipboard.writeText(`${window.location.origin}/api${webhookTrigger.url}`).then(() => {
      setWebhookCopied(true)
      setTimeout(() => setWebhookCopied(false), 2000)
    })
  }

  const handleRunRef = useRef(handleRun)
  useEffect(() => {
    handleRunRef.current = handleRun
  })

  useEffect(() => {
    if (autoRun && currentChainId !== "new") {
      handleRunRef.current()
    }
  }, [autoRun, currentChainId])

  const displayNodes = nodes.map((n) => {
    const liveStatus = run.nodes.find((s) => s.id === n.id)
    return liveStatus ? { ...n, data: { ...n.data, status: liveStatus.status, output: liveStatus.output } } : n
  })
  const displayEdges = edges.map((edge) => ({ ...edge, data: { ...edge.data, active: run.status === "running" } }))
  const energy = Math.round((nodes.length / MAX_NODES) * 100)

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
      <style>{EDITOR_CSS}</style>
      <div className="orch-toolbar flex flex-wrap items-center gap-3 rounded-xl p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="orch-terminal-input min-w-0 flex-1 rounded-lg px-3 py-2 text-[14px] font-medium outline-none"
          style={{ color: COLORS.text }}
        />

        {/* Счётчик узлов цепочки */}
        <div className="flex min-w-[122px] items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium"
          style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: nodes.length >= MAX_NODES ? COLORS.red : COLORS.label,
          }}
        >
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${energy}%`, background: "linear-gradient(90deg,#36b9ff,#f5c451)" }} /></span>
          {nodes.length}/{MAX_NODES}
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
              backgroundColor: isJarvisTemplate ? `rgba(215, 174, 87,0.06)` : "transparent",
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
          className="btn-premium-gold inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={1.75} />}
          {t("orchestrator.saveBtn")}
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={run.status === "running"}
          className="orch-launch inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-50"
        >
          {run.status === "running" ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} strokeWidth={1.75} />}
          {t("orchestrator.runBtn")}
        </button>
      </div>

      <label className="block text-[12px]" style={{ color: COLORS.label }}>
        {t("orchestrator.chainInputLabel")}
        <textarea
          value={chainInput}
          onChange={(e) => setChainInput(e.target.value)}
          placeholder={t("orchestrator.chainInputPlaceholder")}
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
          className={`orch-canvas relative min-h-[540px] flex-1 overflow-hidden rounded-xl ${run.status === "running" ? "orch-canvas-running" : ""}`}
          style={{ border: "1px solid rgba(91,146,203,.35)" }}
        >
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="max-w-[500px] px-6 text-center">
                <div className="orch-ghost-flow mx-auto mb-5 h-16 w-[300px]" aria-hidden="true"><span /><i /><b /></div>
                <p className="text-[16px] font-semibold text-white/85">Соберите свой ИИ-конвейер</p>
                <p className="mt-1 text-[13px] text-white/45">Перетащите узлы из палитры или начните с готового шаблона.</p>
                <div className="pointer-events-auto mt-5 flex flex-wrap justify-center gap-2">
                  {FLOW_TEMPLATES.map((template) => <button key={template.label} type="button" onClick={() => loadTemplate(template.types)} className="rounded-lg border border-[#5b7895] bg-[#102238cc] px-3 py-2 text-[12px] text-[#dbeeff] transition hover:border-[#f5c451] hover:text-[#f5c451]"><WandSparkles className="mr-1 inline" size={13} />{template.label}</button>)}
                </div>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
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
            <Background color="#1d4e76" gap={24} size={1} />
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
            ) : selectedNode.data.type === "webhook_trigger" ? (
              <div className="space-y-2">
                {currentChainId === "new" ? (
                  <p className="rounded-lg px-2.5 py-2 text-[12px]" style={{ backgroundColor: COLORS.bg, color: COLORS.label }}>
                    {t("orchestrator.webhookSaveFirst")}
                  </p>
                ) : webhookLoading ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="animate-spin" size={16} style={{ color: COLORS.label }} />
                  </div>
                ) : webhookTrigger ? (
                  <>
                    <label className="block text-[12px]" style={{ color: COLORS.label }}>
                      {t("orchestrator.webhookUrl")}
                      <div className="mt-1 flex gap-1.5">
                        <input
                          readOnly
                          value={`${typeof window !== "undefined" ? window.location.origin : ""}/api${webhookTrigger.url}`}
                          onFocus={(e) => e.currentTarget.select()}
                          className="w-full rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                          style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                        />
                        <button
                          type="button"
                          onClick={handleCopyWebhookUrl}
                          className="shrink-0 rounded-lg px-2.5 text-[12px] font-medium"
                          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                        >
                          {webhookCopied ? <CheckCircle2 size={14} style={{ color: COLORS.accent }} /> : t("orchestrator.webhookCopy")}
                        </button>
                      </div>
                    </label>

                    <p className="text-[11px]" style={{ color: COLORS.label }}>
                      {webhookTrigger.triggerCount > 0
                        ? t("orchestrator.webhookLastTriggered", {
                            count: webhookTrigger.triggerCount,
                            date: webhookTrigger.lastTriggeredAt ? new Date(webhookTrigger.lastTriggeredAt).toLocaleString() : "—",
                          })
                        : t("orchestrator.webhookNeverTriggered")}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateWebhook}
                        className="flex-1 rounded-lg py-1.5 text-[12px] font-medium"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                      >
                        {t("orchestrator.webhookRegenerate")}
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteWebhook}
                        className="flex-1 rounded-lg py-1.5 text-[12px] font-medium"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.red }}
                      >
                        {t("orchestrator.webhookDelete")}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateWebhook}
                    className="w-full rounded-lg py-1.5 text-[12px] font-medium"
                    style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                  >
                    {t("orchestrator.webhookGenerate")}
                  </button>
                )}
              </div>
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

const EDITOR_CSS = `
.orch-toolbar { background: linear-gradient(105deg, rgba(10,24,42,.92), rgba(15,29,48,.72)); border: 1px solid rgba(99,151,204,.24); box-shadow: inset 0 1px rgba(255,255,255,.06); }
.orch-terminal-input { background: #07131f; border: 1px solid rgba(65,139,191,.4); box-shadow: inset 0 0 14px rgba(24,100,150,.12); caret-color: #f5c451; }
.orch-launch { background: linear-gradient(135deg,#ffca47,#e66e35); color:#150d04; box-shadow:0 0 20px rgba(242,175,61,.3); transition:transform .15s ease,box-shadow .15s ease; }
.orch-launch:hover { transform:translateY(-1px); box-shadow:0 0 28px rgba(242,175,61,.54); }
.orch-canvas { background: radial-gradient(circle at 72% 25%, rgba(25,76,130,.19), transparent 28%), radial-gradient(circle at 12% 84%, rgba(105,60,155,.12), transparent 32%), #050c17; }
.orch-canvas::before { content:""; position:absolute; inset:0; pointer-events:none; z-index:2; opacity:.36; background-image: radial-gradient(circle at 15% 20%,#b7e4ff 0 1px,transparent 1.5px),radial-gradient(circle at 74% 13%,#fff2bc 0 1px,transparent 1.5px),radial-gradient(circle at 88% 70%,#a5d9ff 0 1px,transparent 1.5px); background-size: 190px 160px,240px 210px,280px 230px; animation:orch-stars 16s linear infinite; }
.orch-canvas-running::before { animation-duration:3s; opacity:.65; }
.orch-canvas .react-flow__controls { border:1px solid rgba(104,159,216,.3); box-shadow:none; }
.orch-canvas .react-flow__controls button { background:#0c1d31; color:#b9d8ed; border-color:rgba(104,159,216,.22); }
.orch-ghost-flow { position:relative; opacity:.74; }
.orch-ghost-flow::before { content:""; position:absolute; left:28px; right:28px; top:29px; height:3px; background:linear-gradient(90deg,#36b9ff,#f5c451,#a970ff); box-shadow:0 0 12px #e6c868; animation:orch-ghost-pulse 1.3s linear infinite; }
.orch-ghost-flow span,.orch-ghost-flow i,.orch-ghost-flow b { position:absolute; top:8px; width:50px; height:50px; border:1px solid #e6c868; background:rgba(17,39,61,.8); box-shadow:0 0 18px rgba(230,200,104,.35); }
.orch-ghost-flow span { left:8px; clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%); }.orch-ghost-flow i { left:125px; border-radius:10px; border-color:#36b9ff; }.orch-ghost-flow b { right:8px; border-radius:50%; border-color:#a970ff; }
@keyframes orch-stars { to { background-position:190px 160px,-240px 210px,280px -230px; } }
@keyframes orch-ghost-pulse { to { filter:hue-rotate(25deg); background-position:300px; } }
@media (prefers-reduced-motion:reduce) { .orch-canvas::before,.orch-ghost-flow::before { animation:none; } .orch-launch:hover { transform:none; } }
`
