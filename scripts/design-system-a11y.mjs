import { readFile } from "node:fs/promises"

const root = new URL("../", import.meta.url).pathname
const checks = [
  ["reduced motion", "app/tokens.css", "prefers-reduced-motion"],
  ["visible focus", "app/tokens.css", "focus-visible"],
  ["dialog accessible name", "components/cofounder/CofounderConsole.tsx", "aria-label=\"НОВЫЙ КОНТРАКТ\""],
  ["tenant host guard", "app/api/design/tenant/route.ts", "osgardnewworld.com"],
]
for (const [name, file, needle] of checks) {
  const text = await readFile(new URL(file, root), "utf8")
  if (!text.includes(needle)) throw new Error(`missing accessibility invariant: ${name}`)
  console.log(`a11y:ok ${name}`)
}
