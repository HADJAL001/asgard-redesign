import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const sourceRoots = ["app", "components", "lib"]
const sourceExtensions = new Set([".ts", ".tsx"])

function filesUnder(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot)
  const result = []
  if (!fs.existsSync(absoluteRoot)) return result
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.join(relativeRoot, entry.name)
    if (entry.isDirectory()) result.push(...filesUnder(relative))
    else if (sourceExtensions.has(path.extname(entry.name))) result.push(relative)
  }
  return result
}

const frontendEvents = new Set()
for (const relativeFile of sourceRoots.flatMap(filesUnder)) {
  const source = fs.readFileSync(path.join(root, relativeFile), "utf8")
  for (const match of source.matchAll(/\btrack\(\s*["']([A-Za-z0-9_]+)["']/g)) frontendEvents.add(match[1])
}

const backendSource = fs.readFileSync(path.join(root, "backend/src/routes/analytics.routes.ts"), "utf8")
const allowlistBlock = backendSource.match(/const ALLOWED_EVENTS\s*=\s*new Set\(\[(.*?)\]\)/s)?.[1] || ""
const backendEvents = new Set([...allowlistBlock.matchAll(/["']([A-Za-z0-9_]+)["']/g)].map((match) => match[1]))
const missing = [...frontendEvents].filter((event) => !backendEvents.has(event)).sort()

if (missing.length) {
  console.error(`analytics-contract: missing backend events: ${missing.join(", ")}`)
  process.exit(1)
}

console.log(`analytics-contract:ok (${frontendEvents.size} frontend events, ${backendEvents.size} allowlisted)`)
