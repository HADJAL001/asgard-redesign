import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))
const checks = [
  ["reduced motion", "app/tokens.css", "prefers-reduced-motion"],
  ["visible focus", "app/tokens.css", "focus-visible"],
  ["dialog accessible name", "components/cofounder/CofounderConsole.tsx", "aria-label=\"НОВЫЙ КОНТРАКТ\""],
  ["tenant host guard", "app/api/design/tenant/route.ts", "osgardnewworld.com"],
  ["first-paint boot shell", "components/boot-shell-dismiss.tsx", "osgard-boot-shell"],
  ["boot shell reduced motion", "app/globals.css", "osgard-boot-pulse"],
  ["canvas bulk actions have a named toolbar", "components/cofounder/BlueprintCanvas.tsx", "aria-label=\"Bulk canvas actions\""],
  ["canvas selection announces changes", "components/cofounder/BlueprintCanvas.tsx", "aria-live=\"polite\""],
  ["canvas block actions are named", "components/cofounder/BlueprintCanvas.tsx", "aria-label={`Move ${slot.role} earlier`}"],
]
for (const [name, file, needle] of checks) {
  const text = await readFile(join(root, file), "utf8")
  if (!text.includes(needle)) throw new Error(`missing accessibility invariant: ${name}`)
  console.log(`a11y:ok ${name}`)
}
