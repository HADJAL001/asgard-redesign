import type { Meta, StoryObj } from "@storybook/react"
import { MemoryLayerRail } from "./MemoryLayerRail"
import { PresetSwitcher } from "./PresetSwitcher"

const meta = { title: "OSGARD/Design System", parameters: { layout: "padded" } } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const MemoryFabric: Story = { render: () => <MemoryLayerRail counts={{ Atomic: 12, Semantic: 8, Episodic: 4, Procedural: 3 }} /> }
export const PresetControl: Story = { render: () => <PresetSwitcher /> }
