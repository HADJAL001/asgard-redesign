const base = process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com"
const pageResponse = await fetch(`${base}/cofounder`, { redirect: "manual" })
const hsts = pageResponse.headers.get("strict-transport-security") || ""
if (!hsts.toLowerCase().includes("max-age=31536000") || !hsts.toLowerCase().includes("includesubdomains")) {
  console.error("security header gate: Strict-Transport-Security is missing or too weak")
  process.exitCode = 1
}
const routes = ["/cofounder", "/api/design/tokens?preset=futuristic", "/api/design/tenant", "/api/design/manifest?app=universal"]
for (const route of routes) {
  const started = performance.now()
  const response = await fetch(`${base}${route}`, { redirect: "manual" })
  const body = await response.arrayBuffer()
  const latencyMs = Math.round(performance.now() - started)
  console.log(JSON.stringify({ route, status: response.status, latencyMs, bytes: body.byteLength }))
  if (!response.ok || latencyMs > 2500) process.exitCode = 1
}
const started = performance.now()
const blueprint = await fetch(`${base}/api/design/blueprint`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "performance-check", brief: "A production performance probe for the universal client portal preview flow." }) })
const latencyMs = Math.round(performance.now() - started)
console.log(JSON.stringify({ route: "/api/design/blueprint [POST]", status: blueprint.status, latencyMs }))
if (blueprint.status !== 201 || latencyMs > 2500) process.exitCode = 1
