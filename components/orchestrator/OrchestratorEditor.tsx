"use client"

import "@xyflow/react/dist/style.css"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
} from "@xyflow/react"
import { Loader2, Play, Save, Coins, Bot, CheckCircle2, Rocket, Zap, Cog, ChartNoAxesCombined } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { orchestratorApi } from "@/lib/orchestrator/api"
import { temperatureLabel } from "@/lib/orchestrator/temperature-label"
import { ApiError } from "@/lib/api-client"
import { useOrchestratorRun } from "@/hooks/useOrchestratorRun"
import { ORCHESTRATOR_PALETTE, DRAG_DATA_FORMAT } from "./node-types"
import { OrchestratorNode } from "./nodes/OrchestratorNode"
import { OrchestratorRadialShowcase } from "./OrchestratorRadialShowcase"
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
const TEMPLATE_VISUALS = [
  { label: "Быстрый прототип", detail: "1 узел, 30 секунд", color: "#FFB800", Icon: Zap },
  { label: "Полный цикл", detail: "3 узла, 5 минут", color: "#D7AE57", Icon: Cog },
  { label: "Анализ данных", detail: "2 узла, 2 минуты", color: "#B5A681", Icon: ChartNoAxesCombined },
]
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
          className="orch-terminal-input min-w-0 flex-1 rounded-lg px-4 py-3 text-[14px] font-medium outline-none"
          style={{ color: COLORS.text }}
        />

        {/* Счётчик узлов цепочки */}
        <div className="orch-energy-gauge flex min-w-[122px] items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium"
          style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: nodes.length >= MAX_NODES ? COLORS.red : COLORS.label,
          }}
        >
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${energy}%`, background: "linear-gradient(90deg,#785e2e,#d7ae57)" }} /></span>
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
          className="orch-launch inline-flex items-center gap-2 rounded-lg px-5 py-3 text-[14px] font-bold disabled:opacity-50"
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
                <div className="mx-auto mb-8" aria-hidden="true"><OrchestratorRadialShowcase /></div>
                <p className="text-[16px] font-semibold text-white/85">Соберите свой ИИ-конвейер</p>
                <p className="mt-1 text-[13px] text-white/45">Перетащите узлы из палитры или начните с готового шаблона.</p>
                <div className="pointer-events-auto mt-5 flex flex-wrap justify-center gap-2">
                  {FLOW_TEMPLATES.map((template, index) => { const visual = TEMPLATE_VISUALS[index]; const TemplateIcon = visual.Icon; return <button key={template.label} type="button" onClick={() => loadTemplate(template.types)} className="orch-template-card" style={{ "--template-color": visual.color } as React.CSSProperties}><TemplateIcon size={22} /><span><b>{visual.label}</b><small>{visual.detail}</small></span></button> })}
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
.orch-toolbar { background: linear-gradient(105deg, rgba(24,22,18,.94), rgba(18,18,18,.82)); border: 1px solid rgba(215,174,87,.24); box-shadow: inset 0 1px rgba(255,255,255,.06); }
.orch-terminal-input { background:rgba(0,0,0,.42); border:1px solid rgb(255 184 0 / .32); box-shadow:inset 0 0 20px rgb(255 184 0 / .06); color:#ffb800 !important; caret-color:#ffb800; font-family:var(--font-ibm-plex-mono,monospace); transition:border-color .3s ease,box-shadow .3s ease; }.orch-terminal-input:focus { border-color:#ffb800; box-shadow:inset 0 0 20px rgb(255 184 0 / .12),0 0 28px rgb(255 184 0 / .23); }
.orch-energy-gauge { position:relative; overflow:hidden; border-color:rgb(215 174 87 / .28)!important; background:rgb(9 9 8 / .6)!important; color:#d7ae57!important; font-family:var(--font-ibm-plex-mono,monospace); }.orch-energy-gauge>span:first-child { position:absolute; inset:0; height:100%!important; width:100%; border-radius:0; background:transparent!important; }.orch-energy-gauge>span:first-child>span { background:linear-gradient(90deg,#785e2e,#d7ae57)!important; box-shadow:none; }.orch-energy-gauge { justify-content:flex-end; }
.orch-launch { position:relative; overflow:hidden; background:rgba(215,174,87,.1); border:1px solid rgba(215,174,87,.7); color:#e6c77e; box-shadow:inset 0 1px rgba(255,255,255,.08); transition:border-color .2s ease,background .2s ease; }.orch-launch:hover { transform:none; background:rgba(215,174,87,.16); border-color:#f0d58b; box-shadow:inset 0 1px rgba(255,255,255,.1); }.orch-launch>* { position:relative; z-index:1; }
.orch-canvas { background: radial-gradient(circle at 72% 25%, rgba(215,174,87,.09), transparent 28%), radial-gradient(circle at 12% 84%, rgba(130,110,70,.08), transparent 32%), #0b0b0a; }
.orch-canvas::before { content:""; position:absolute; inset:0; pointer-events:none; z-index:2; opacity:.24; background-image: radial-gradient(circle at 15% 20%,#d7ae57 0 1px,transparent 1.5px),radial-gradient(circle at 74% 13%,#fff2bc 0 1px,transparent 1.5px),radial-gradient(circle at 88% 70%,#8e815f 0 1px,transparent 1.5px); background-size: 190px 160px,240px 210px,280px 230px; animation:orch-stars 16s linear infinite; }
.orch-canvas-running::before { animation-duration:3s; opacity:.65; }
.orch-canvas .react-flow__controls { border:1px solid rgba(215,174,87,.24); box-shadow:none; }
.orch-canvas .react-flow__controls button { background:#12110e; color:#d7ae57; border-color:rgba(215,174,87,.18); }
.orch-ghost-flow { display:flex; align-items:center; justify-content:center; gap:0; min-height:174px; opacity:.9; }
.orch-ghost-node { position:relative; display:grid; flex:0 0 auto; place-items:center; align-content:center; gap:3px; color:#fff; isolation:isolate; }
.orch-ghost-node b { font-family:var(--font-ibm-plex-mono,monospace); font-size:12px; letter-spacing:0; }.orch-ghost-node small { color:rgb(255 255 255 / .5); font-size:10px; }
.orch-ghost-node::before { content:""; position:absolute; inset:0; z-index:-1; background:linear-gradient(145deg,#4a3b1a 0%,#1d1b16 28%,#090b10 78%); box-shadow:inset 2px 2px 0 rgb(255 255 255 / .22),inset -8px -10px 18px rgb(0 0 0 / .7),0 14px 28px rgb(0 0 0 / .55); transform:perspective(260px) rotateX(7deg) rotateY(-8deg); }
.orch-ghost-node--planner { width:120px; height:120px; color:#ffb800; clip-path:polygon(25% 0,75% 0,100% 25%,100% 75%,75% 100%,25% 100%,0 75%,0 25%); filter:drop-shadow(0 0 13px rgb(255 184 0 / .7)); }.orch-ghost-node--planner::before { clip-path:inherit; border:2px solid #ffb800; }
.orch-ghost-node--architect { width:140px; height:140px; color:#5ed8ff; clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%); filter:drop-shadow(0 0 16px rgb(94 216 255 / .5)); }.orch-ghost-node--architect::before { background:linear-gradient(145deg,#24485a,#101820 52%,#071018); clip-path:inherit; border:2px solid #5ed8ff; }
.orch-ghost-node--processor { width:100px; height:100px; color:#c58cff; border-radius:50%; background:radial-gradient(circle at 32% 24%,#ead8ff,#634c84 14%,#191321 58%,#08090d 100%); box-shadow:inset 3px 3px 0 rgb(255 255 255 / .3),inset -10px -12px 20px rgb(0 0 0 / .7),0 0 28px rgb(197 140 255 / .55); }.orch-ghost-node--processor::before { display:none; }
.orch-ghost-brain,.orch-ghost-chip,.orch-ghost-crystal { display:block; width:38px; height:30px; position:relative; }.orch-ghost-brain { border:2px solid currentColor; border-radius:42% 45% 38% 44%; box-shadow:inset 8px 0 0 -6px currentColor; animation:orch-brain 1.8s ease-in-out infinite; }.orch-ghost-chip { width:38px; height:38px; border:2px solid currentColor; box-shadow:inset 0 0 12px currentColor; animation:orch-chip 1.4s linear infinite; }.orch-ghost-chip::before,.orch-ghost-chip::after { content:""; position:absolute; inset:7px; border:1px solid currentColor; }.orch-ghost-crystal { width:34px; height:34px; background:currentColor; clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%); opacity:.82; animation:orch-crystal 2.6s linear infinite; }
.orch-ghost-link { position:relative; width:100px; height:4px; border-radius:99px; background:linear-gradient(90deg,transparent,rgba(255,184,0,.8),transparent); box-shadow:0 0 12px rgb(255 184 0 / .65); transform:perspective(100px) rotateX(15deg); }.orch-ghost-link--two { background:linear-gradient(90deg,transparent,rgba(94,216,255,.8),transparent); box-shadow:0 0 12px rgb(94 216 255 / .55); }.orch-ghost-link i { position:absolute; top:-3px; width:10px; height:10px; border-radius:50%; background:#fff5bf; box-shadow:0 0 12px 3px #ffb800; animation:orch-pulse-run 1.8s linear infinite; }.orch-ghost-link i:nth-child(2) { animation-delay:.6s; }.orch-ghost-link i:nth-child(3) { animation-delay:1.2s; }
.orch-template-card { display:flex; width:180px; min-height:100px; align-items:flex-start; gap:11px; padding:15px; border:1px solid rgba(215,174,87,.22); border-radius:8px; background:rgba(14,14,12,.78); color:#d7ae57; text-align:left; backdrop-filter:blur(24px); transition:transform .25s ease,border-color .25s ease,background .25s ease; }.orch-template-card span { display:grid; gap:5px; }.orch-template-card b { font-size:13px; }.orch-template-card small { color:rgb(255 255 255 / .52); font-size:11px; }.orch-template-card:hover { transform:translateY(-6px); border-color:rgba(215,174,87,.72); background:rgba(215,174,87,.08); box-shadow:inset 0 1px rgb(255 255 255 / .1); }
@keyframes orch-stars { to { background-position:190px 160px,-240px 210px,280px -230px; } }
@keyframes orch-ghost-pulse { to { filter:hue-rotate(25deg); background-position:300px; } }
@keyframes orch-pulse-run { from { left:-6px; opacity:0; } 15%,80% { opacity:1; } to { left:100%; opacity:0; } }
@keyframes orch-brain { 50% { transform:scale(1.13); filter:brightness(1.35); } }
@keyframes orch-chip { to { rotate:360deg; } }
@keyframes orch-crystal { to { rotate:360deg; } }
@media (prefers-reduced-motion:reduce) { .orch-canvas::before,.orch-ghost-flow::before { animation:none; } .orch-launch:hover { transform:none; } }
`
