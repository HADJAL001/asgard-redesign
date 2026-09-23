import type { Preview } from "@storybook/react"
import "../app/tokens.css"

const preview: Preview = {
  parameters: { a11y: { element: "#storybook-root" }, backgrounds: { default: "osgard" } },
  globals: { theme: "dark" },
}
export default preview
