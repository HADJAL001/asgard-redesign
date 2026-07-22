import type { ComponentType } from "react"
import {
  PremiumClaudeIcon,
  PremiumDeepseekIcon,
  PremiumGrokIcon,
  PremiumTemplateIcon,
  type NodeIconProps,
} from "./PremiumNodeIcon"
import type { OrchestratorNodeData, OrchestratorNodeType } from "@/lib/orchestrator/types"

export interface OrchestratorPaletteItem {
  type: OrchestratorNodeType
  labelKey: string
  descriptionKey: string
  Icon: ComponentType<NodeIconProps>
  color: string
  defaultData: OrchestratorNodeData
}

export const ORCHESTRATOR_PALETTE: OrchestratorPaletteItem[] = [
  {
    type: "claude",
    labelKey: "orchestrator.nodeType.claude",
    descriptionKey: "orchestrator.nodeType.claudeDesc",
    Icon: PremiumClaudeIcon,
    color: "#00D4FF",
    defaultData: {
      label: "OS 5.0",
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
    Icon: PremiumDeepseekIcon,
    color: "#4ADE80",
    defaultData: {
      label: "OS 3.0",
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
    Icon: PremiumGrokIcon,
    color: "#FBBF24",
    defaultData: {
      label: "OS 3.3",
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
    Icon: PremiumTemplateIcon,
    color: "#6A6A8A",
    defaultData: {
      label: "Шаблон",
      type: "prompt_template",
      template: "{{input}}",
    },
  },
]

export const DRAG_DATA_FORMAT = "application/osgard-orchestrator-node"
