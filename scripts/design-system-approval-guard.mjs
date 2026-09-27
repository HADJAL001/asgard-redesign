import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))
const route = await readFile(join(root, "app/api/design/blueprint/[id]/approve/route.ts"), "utf8")
const comments = await readFile(join(root, "app/api/design/blueprint/[id]/comments/route.ts"), "utf8")
const e2e = await readFile(join(root, "e2e/design-system.spec.ts"), "utf8")

const authCheck = route.indexOf("requireBlueprintActor(request)")
const write = route.indexOf("saveBlueprint(approved)")
if (authCheck < 0 || write < 0 || authCheck > write) {
  throw new Error("approval must validate an authenticated session with the backend before writing approval")
}
if (!e2e.includes('approval.status()).toBe(401)') || !e2e.includes('approved.blueprint.approval.status).toBe("approved")')) {
  throw new Error("approval e2e coverage must include anonymous denial and authenticated approval")
}
if (!comments.includes("requireBlueprintActor(request)") || !comments.includes("blueprintActorName(actor.actor)") || !e2e.includes('comment.status()).toBe(401)')) {
  throw new Error("approval comments must require an authenticated actor and reject anonymous writes")
}

console.log("design-system:approval-guard:ok")
