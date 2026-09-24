const origin = (process.env.DESIGN_SYSTEM_ORIGIN || "https://osgardnewworld.com").replace(/\/$/, "")
const route = `${origin}/cofounder`

const pageResponse = await fetch(route, { redirect: "manual" })
if (!pageResponse.ok) throw new Error(`asset gate: ${route} returned ${pageResponse.status}`)

const html = await pageResponse.text()
const stylesheetUrls = [...new Set(
  [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((match) => {
    const href = match[1]
    return href.startsWith("http") ? href : new URL(href, origin).toString()
  }),
)]
if (!stylesheetUrls.length) throw new Error("asset gate: no stylesheets found in document")

async function fetchAsset(url) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`asset gate: ${url} returned ${response.status}`)
      if (![500, 502, 503, 504].includes(response.status)) throw lastError
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
  }
  throw lastError || new Error(`asset gate: ${url} request failed`)
}

const styles = await Promise.all(stylesheetUrls.map(async (url) => {
  const response = await fetchAsset(url)
  const body = await response.text()
  if (body.trim().length < 100) throw new Error(`asset gate: ${url} is unexpectedly empty`)
  return body
}))

const css = styles.join("\n")
for (const selector of [".cofounder-deck", ".cofounder-grid", ".ds-hull", ".ds-focus:focus-visible"]) {
  if (!css.includes(selector)) throw new Error(`asset gate: missing critical selector ${selector}`)
}

console.log(`design-system:assets:ok (${stylesheetUrls.length} stylesheets, ${css.length} bytes)`)
