/* ================================================================
   OSGARD · Проверка публичности URL (защита от SSRF)
   ----------------------------------------------------------------
   Общая проверка для любых сценариев, где сервер сам делает запрос
   на URL, заданный пользователем (webhooks.routes.ts, коннектор
   "Свой REST API" в service-bridge). Разрешает только http(s) на
   публичные хосты, блокирует loopback/private/cloud-metadata адреса
   по имени хоста.

   Это не полноценная защита от DNS-rebinding (для этого нужна
   проверка резолвленного IP непосредственно перед каждым fetch), но
   отсекает подавляющее большинство тривиальных попыток.
   ================================================================ */

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false

  const host = url.hostname.toLowerCase()
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return false
  if (host === "169.254.169.254") return false // cloud metadata (AWS/GCP/Azure)
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
  if (host.endsWith(".local") || host.endsWith(".internal")) return false

  return true
}
