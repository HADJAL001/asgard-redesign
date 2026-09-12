import type { ComponentType } from "react"
import {
  PremiumClaudeIcon,
  PremiumDeepseekIcon,
  PremiumGrokIcon,
  PremiumTemplateIcon,
  PremiumServiceCallIcon,
  PremiumWebhookTriggerIcon,
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
    color: "#d7ae57",
    defaultData: {
      label: "OSGARD 5.0",
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
    color: "#d7ae57",
    defaultData: {
      label: "OSGARD 4.0",
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
      label: "OSGARD 3.3",
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
    color: "#9eb2bc",
    defaultData: {
      label: "Шаблон",
      type: "prompt_template",
      template: "{{input}}",
    },
  },
  {
    type: "service_call",
    labelKey: "orchestrator.nodeType.serviceCall",
    descriptionKey: "orchestrator.nodeType.serviceCallDesc",
    Icon: PremiumServiceCallIcon,
    color: "#e2685c",
    defaultData: {
      label: "Service Call",
      type: "service_call",
      params: {},
    },
  },
  {
    type: "webhook_trigger",
    labelKey: "orchestrator.nodeType.webhookTrigger",
    descriptionKey: "orchestrator.nodeType.webhookTriggerDesc",
    Icon: PremiumWebhookTriggerIcon,
    color: "#A855F7",
    defaultData: {
      label: "Webhook Trigger",
      type: "webhook_trigger",
    },
  },
]

export const DRAG_DATA_FORMAT = "application/osgard-orchestrator-node"
