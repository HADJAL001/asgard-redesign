import type { GuestCodeAdapter } from "@/hooks/useGuestCodeGeneration"

/* ================================================================
   OSGARD · Guest Code Adapter — реальный бэкенд гостевой генерации
   ----------------------------------------------------------------
   Подставляется в useGuestCodeGeneration вместо DEFAULT_ADAPTER.
   Ходит через Next-прокси /api/* на backend demo-code.routes.ts:
     POST /api/demo/code/start {name, hint} → 202 {taskId}
     GET  /api/demo/code/:taskId            → {status, result?, error?}

   SSE пока нет (backend не публикует stream) — хук работает через
   polling, поэтому subscribeStream не задаём.
   ================================================================ */

async function readError(r: Response, fallback: string): Promise<string> {
  try {
    const d = await r.json()
    return d?.error || fallback
  } catch {
    return fallback
  }
}

export const guestCodeAdapter: GuestCodeAdapter = {
  async start({ name, hint }, signal) {
    const r = await fetch("/api/demo/code/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({ name, hint }),
    })
    if (!r.ok) {
      throw new Error(await readError(r, "Не удалось запустить генерацию"))
    }
    const d = await r.json()
    if (!d?.taskId) throw new Error("Бэкенд не вернул taskId")
    return { taskId: d.taskId }
  },

  async poll(taskId, signal) {
    const r = await fetch(`/api/demo/code/${encodeURIComponent(taskId)}`, { signal, cache: "no-store" })
    if (!r.ok) {
      throw new Error(await readError(r, "Не удалось получить статус генерации"))
    }
    return r.json()
  },

  subscribeStream(taskId, onProgress) {
    const source = new EventSource(`/api/demo/code/${encodeURIComponent(taskId)}/stream`)
    source.onmessage = (event) => {
      try {
        const progress = JSON.parse(event.data) as { type?: string; stage?: string; message?: string; pct?: number; status?: string }
        if (progress.type !== "progress" || !progress.stage) return
        onProgress({ stage: progress.stage, message: progress.message, pct: progress.pct })
        if (progress.status === "done" || progress.status === "error") source.close()
      } catch {
        // A malformed progress frame must not interrupt the polling fallback.
      }
    }
    return () => source.close()
  },
}
