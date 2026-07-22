import { Sparkles, Bot, Zap, FileText, type LucideIcon } from "lucide-react"
import type { OrchestratorNodeData, OrchestratorNodeType } from "@/lib/orchestrator/types"

export interface OrchestratorPaletteItem {
  type: OrchestratorNodeType
  labelKey: string
  descriptionKey: string
  Icon: LucideIcon
  color: string
  defaultData: OrchestratorNodeData
}

export const ORCHESTRATOR_PALETTE: OrchestratorPaletteItem[] = [
  {
    type: "claude",
    labelKey: "orchestrator.nodeType.claude",
    descriptionKey: "orchestrator.nodeType.claudeDesc",
    Icon: Sparkles,
    color: "#00D4FF",
    defaultData: {
      label: "Claude",
      type: "claude",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 1024,
    },
  },
  {
    type: "deepseek",
    labelKey: "orchestrator.nodeType.deepseek",
    descriptionKey: "orchestrator.nodeType.deepseekDesc",
    Icon: Bot,
    color: "#4ADE80",
    defaultData: {
      label: "DeepSeek",
      type: "deepseek",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 1024,
    },
  },
  {
    type: "grok",
    labelKey: "orchestrator.nodeType.grok",
    descriptionKey: "orchestrator.nodeType.grokDesc",
    Icon: Zap,
    color: "#FBBF24",
    defaultData: {
      label: "Grok",
      type: "grok",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 1024,
    },
  },
  {
    type: "prompt_template",
    labelKey: "orchestrator.nodeType.promptTemplate",
    descriptionKey: "orchestrator.nodeType.promptTemplateDesc",
    Icon: FileText,
    color: "#6A6A8A",
    defaultData: {
      label: "Шаблон",
      type: "prompt_template",
      template: "{{input}}",
    },
  },
]

export const DRAG_DATA_FORMAT = "application/osgard-orchestrator-node"
