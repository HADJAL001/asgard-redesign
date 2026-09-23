const base = process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com"
const routes = ["/cofounder", "/api/design/tokens?preset=futuristic", "/api/design/tenant"]
for (const route of routes) {
  const started = performance.now()
  const response = await fetch(`${base}${route}`, { redirect: "manual" })
  const body = await response.arrayBuffer()
  const latencyMs = Math.round(performance.now() - started)
  console.log(JSON.stringify({ route, status: response.status, latencyMs, bytes: body.byteLength }))
  if (!response.ok || latencyMs > 2500) process.exitCode = 1
}
