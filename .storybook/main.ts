import type { StorybookConfig } from "@storybook/react-vite"

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-essentials"],
  framework: { name: "@storybook/react-vite", options: {} },
  docs: { autodocs: "tag" },
}
export default config
