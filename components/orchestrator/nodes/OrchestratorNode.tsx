"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react"
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { temperatureLabel } from "@/lib/orchestrator/temperature-label"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ORCHESTRATOR_PALETTE } from "../node-types"
import type { OrchestratorNodeData, OrchestratorNodeRunStatus } from "@/lib/orchestrator/types"

/** Старые сохранённые цепочки могли записать сырое имя провайдера в data.label ещё до ребрендинга — такие значения подменяются на актуальный i18n-лейбл, а любое реальное пользовательское имя узла остаётся нетронутым. */
const STALE_PROVIDER_LABELS: Record<string, string> = {
  claude: "claude",
  deepseek: "deepseek",
  grok: "grok",
}

/** displayNodes в OrchestratorEditor подмешивает статус/выход текущего запуска поверх сохранённых данных узла. */
type OrchestratorNodeRuntimeData = OrchestratorNodeData & {
  status?: OrchestratorNodeRunStatus
  output?: string
}

function statusGlow(status?: OrchestratorNodeRunStatus): string {
  if (status === "running") return `0 0 0 2px ${COLORS.accent}40, 0 0 18px ${COLORS.accent}60`
  if (status === "done") return `0 0 0 2px ${COLORS.green}40, 0 0 14px ${COLORS.green}50`
  if (status === "error") return `0 0 0 2px ${COLORS.red}40, 0 0 14px ${COLORS.red}50`
  return "none"
}

function statusBorder(status?: OrchestratorNodeRunStatus, selected?: boolean): string {
  if (selected) return COLORS.accent
  if (status === "running") return COLORS.accent
  if (status === "done") return COLORS.green
  if (status === "error") return COLORS.red
  return COLORS.border
}

function statusBg(status?: OrchestratorNodeRunStatus): string {
  if (status === "running") return `rgba(215, 174, 87,0.06)`
  if (status === "done") return `rgba(74,222,128,0.06)`
  if (status === "error") return `rgba(248,113,113,0.06)`
  return COLORS.card
}

/** Анимация-класс для ноды в зависимости от статуса */
function statusAnimClass(status?: OrchestratorNodeRunStatus): string {
  if (status === "running") return "orch-node-running"
  if (status === "done") return "orch-node-done"
  if (status === "error") return "orch-node-error"
  return ""
}

export const OrchestratorNode = memo(function OrchestratorNode({
  data,
  selected,
}: NodeProps<Node<OrchestratorNodeRuntimeData>>) {
  const { t } = useTranslation()
  const palette = ORCHESTRATOR_PALETTE.find((p) => p.type === data.type)
  const Icon = palette?.Icon
  const isStaleProviderLabel = STALE_PROVIDER_LABELS[data.type] === data.label?.trim().toLowerCase()
  const displayLabel = isStaleProviderLabel && palette ? t(palette.labelKey) : data.label

  // Обрезаем вывод до 80 символов для компактного отображения в ноде
  const outputPreview = data.output ? data.output.slice(0, 80) + (data.output.length > 80 ? "…" : "") : null

  return (
    <>
      <style>{NODE_ANIMATION_CSS}</style>
      <div
        className={`orch-node orch-node-${data.type} min-w-[190px] px-4 py-3 ${statusAnimClass(data.status)}`}
        style={{
          background: data.status ? statusBg(data.status) : "linear-gradient(135deg, rgba(20,42,62,.88), rgba(10,21,36,.78))",
          border: `1.5px solid ${statusBorder(data.status, selected)}`,
          boxShadow: statusGlow(data.status),
          transition: "border-color 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease",
        }}
      >
        <Handle type="target" position={Position.Left} />

        {/* Заголовок ноды */}
        <div className="flex items-center gap-2">
          {Icon && <span className="orch-miniature" style={{ "--mini-color": data.status === "running" ? COLORS.accent : palette?.color } as React.CSSProperties}><Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>}
          <span
            className="text-[13px] font-medium"
            style={{
              color: data.status === "done" ? COLORS.green : data.status === "error" ? COLORS.red : COLORS.text,
              transition: "color 0.3s ease",
            }}
          >
            {displayLabel}
          </span>

          {/* Иконка статуса */}
          <span className="ml-auto flex-shrink-0">
            {data.status === "pending" && (
              <Clock size={13} style={{ color: COLORS.label }} />
            )}
            {data.status === "running" && (
              <Loader2 size={13} className="animate-spin" style={{ color: COLORS.accent }} />
            )}
            {data.status === "done" && (
              <CheckCircle2 size={13} className="orch-icon-done" style={{ color: COLORS.green }} />
            )}
            {data.status === "error" && (
              <XCircle size={13} className="orch-icon-error" style={{ color: COLORS.red }} />
            )}
          </span>
        </div>

        {/* Подпись (температура, шаблон или сервис) */}
        {data.type === "prompt_template" ? (
          <p className="mt-1 truncate text-[11px]" style={{ color: COLORS.label }}>
            {data.template || "{{input}}"}
          </p>
        ) : data.type === "service_call" ? (
          <p className="mt-1 truncate text-[11px]" style={{ color: COLORS.label }}>
            {data.actionId || t("orchestrator.serviceCallNotConfigured")}
          </p>
        ) : (
          <p className="mt-1 truncate text-[11px]" style={{ color: COLORS.label }}>
            {temperatureLabel(data.temperature ?? 0.7)}
          </p>
        )}

        {/* Вывод ноды после завершения */}
        {outputPreview && data.status === "done" && (
          <p
            className="orch-output mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
            style={{
              backgroundColor: `rgba(74,222,128,0.08)`,
              border: `1px solid rgba(74,222,128,0.2)`,
              color: COLORS.green,
              wordBreak: "break-word",
            }}
          >
            {outputPreview}
          </p>
        )}

        {/* Сообщение об ошибке */}
        {outputPreview && data.status === "error" && (
          <p
            className="orch-output mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
            style={{
              backgroundColor: `rgba(248,113,113,0.08)`,
              border: `1px solid rgba(248,113,113,0.2)`,
              color: COLORS.red,
              wordBreak: "break-word",
            }}
          >
            {outputPreview}
          </p>
        )}

        {/* Прогресс-бар при выполнении */}
        {data.status === "running" && (
          <div
            className="mt-2 overflow-hidden rounded-full"
            style={{ height: 2, backgroundColor: `rgba(215, 174, 87,0.15)` }}
          >
            <div
              className="orch-progress-bar h-full rounded-full"
              style={{ backgroundColor: COLORS.accent }}
            />
          </div>
        )}

        <Handle type="source" position={Position.Right} />
      </div>
    </>
  )
})

/* ================================================================
   CSS-анимации для нод оркестратора
   ================================================================ */
const NODE_ANIMATION_CSS = `
.orch-node { position: relative; border-radius: 14px; backdrop-filter: blur(14px); box-shadow: inset 0 1px rgba(255,255,255,.13), 0 10px 28px rgba(0,0,0,.24); }
.orch-miniature { display:inline-grid; width:34px; height:34px; place-items:center; flex:0 0 auto; color:var(--mini-color); border:1px solid color-mix(in srgb, var(--mini-color) 62%, transparent); border-radius:10px; background:radial-gradient(circle at 30% 24%, color-mix(in srgb, var(--mini-color) 42%, white), color-mix(in srgb, var(--mini-color) 18%, transparent) 40%, rgba(2,8,16,.86) 78%); box-shadow:inset 0 1px rgba(255,255,255,.38), 0 0 16px color-mix(in srgb, var(--mini-color) 34%, transparent), 0 7px 14px rgba(0,0,0,.3); transform:perspective(80px) rotateX(8deg) rotateY(-8deg); }
.orch-node::before { content:""; position:absolute; inset:5px; border:1px solid rgba(174,216,255,.12); border-radius:10px; pointer-events:none; }
.orch-node-claude { clip-path: polygon(10% 0,90% 0,100% 25%,100% 75%,90% 100%,10% 100%,0 75%,0 25%); border-radius:0 !important; }
.orch-node-deepseek { clip-path: polygon(8px 0, calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px); border-radius:0 !important; }
.orch-node-webhook_trigger { border-radius: 999px; min-width: 160px; }
.orch-node .react-flow__handle { width: 11px; height:11px; border-radius:3px; background:#dff8ff; border:2px solid #5ed8ff; box-shadow:0 0 10px #5ed8ff; transition:transform .16s ease; }
.orch-node:hover .react-flow__handle { transform:scale(1.55); }

/* Пульсирующее свечение при running */
@keyframes orch-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(215, 174, 87,0.25), 0 0 12px rgba(215, 174, 87,0.4); }
  50%       { box-shadow: 0 0 0 3px rgba(215, 174, 87,0.45), 0 0 24px rgba(215, 174, 87,0.7); }
}
.orch-node-running {
  animation: orch-glow-pulse 1.4s ease-in-out infinite;
}

/* Плавный fade-in при done */
@keyframes orch-fade-in {
  from { opacity: 0.6; transform: scale(0.97); }
  to   { opacity: 1;   transform: scale(1); }
}
.orch-node-done {
  animation: orch-fade-in 0.4s ease-out forwards;
}

/* Shake при error */
@keyframes orch-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-4px); }
  40%      { transform: translateX(4px); }
  60%      { transform: translateX(-3px); }
  80%      { transform: translateX(3px); }
}
.orch-node-error {
  animation: orch-shake 0.4s ease-out forwards;
}

/* Pop-in для иконок статуса */
@keyframes orch-pop {
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(1); }
}
.orch-icon-done,
.orch-icon-error {
  display: inline-block;
  animation: orch-pop 0.35s ease-out forwards;
}

/* Бегущий прогресс-бар */
@keyframes orch-progress {
  0%   { width: 10%; margin-left: 0; }
  50%  { width: 60%; margin-left: 20%; }
  100% { width: 10%; margin-left: 90%; }
}
.orch-progress-bar {
  animation: orch-progress 1.6s ease-in-out infinite;
}

/* Плавное появление вывода */
@keyframes orch-output-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.orch-output {
  animation: orch-output-in 0.3s ease-out forwards;
}
`
