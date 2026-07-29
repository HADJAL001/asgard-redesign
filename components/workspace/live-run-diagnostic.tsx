"use client"

/* ================================================================
   LiveRunDiagnostic — честная причина, почему «Живой запуск» недоступен
   в этом браузере, + рабочий фолбэк, чтобы результат можно было увидеть
   в любом случае.
   ----------------------------------------------------------------
   Раньше вместо запуска показывался один нейтральный текст
   («в этом окружении она недоступна»), который не объяснял причину и
   не давал рабочего пути посмотреть приложение. Платформа и деплой при
   этом полностью исправны — недоступность строго браузерная (приватное
   окно Firefox, Enhanced Tracking Protection, Safari <16.4 без COOP/COEP).

   Detection — эвристика по User-Agent, поэтому UI формулирует причину
   с хеджированием («вероятно», «похоже») — точный детект синхронно
   невозможен, а притворяться, что он точный, было бы новой нечестностью
   взамен старой.

   Приватное окно Firefox и обычный Firefox с ETP неразличимы по одному
   лишь UA (оба просто "Firefox"). Синхронно по умолчанию — "tracking"
   (ETP включена у всех пользователей Firefox по умолчанию), асинхронно
   дотягиваем через navigator.storage.estimate(): в приватных окнах
   Firefox квота хранилища исторически урезана (эвристика, похожая на
   detectIncognito.js) — если квота подозрительно мала, апгрейдим вывод
   до "firefox-private".
   ================================================================ */

import { useEffect, useState } from "react"
import { AlertTriangle, ExternalLink, Rocket, Loader2 } from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { COLORS } from "@/lib/economy"

export type LiveRunCause = "firefox-private" | "firefox-tracking" | "safari-old" | "unknown"

const PRIVATE_QUOTA_THRESHOLD_BYTES = 120 * 1024 * 1024

export function diagnoseLiveRunEnvironment(ua: string): { cause: LiveRunCause; browser: string } {
  const firefoxMatch = ua.match(/Firefox\/(\d+)/)
  if (firefoxMatch) {
    return { cause: "firefox-tracking", browser: "Firefox" }
  }

  const isChromeLike = /Chrome|Chromium|CriOS|Edg\//.test(ua)
  const safariMatch = !isChromeLike && ua.match(/Version\/(\d+)\.(\d+).*Safari/)
  if (safariMatch) {
    const major = Number(safariMatch[1])
    const minor = Number(safariMatch[2])
    const browser = `Safari ${major}.${minor}`
    if (major < 16 || (major === 16 && minor < 4)) {
      return { cause: "safari-old", browser }
    }
    return { cause: "unknown", browser }
  }

  return { cause: "unknown", browser: "браузер" }
}

function useLiveRunCause() {
  const [result, setResult] = useState<{ cause: LiveRunCause; browser: string } | null>(null)

  useEffect(() => {
    const initial = diagnoseLiveRunEnvironment(navigator.userAgent)
    setResult(initial)

    if (initial.cause !== "firefox-tracking") return
    if (!navigator.storage?.estimate) return

    navigator.storage
      .estimate()
      .then((estimate) => {
        if ((estimate.quota ?? Infinity) < PRIVATE_QUOTA_THRESHOLD_BYTES) {
          setResult({ cause: "firefox-private", browser: initial.browser })
        }
      })
      .catch(() => {})
  }, [])

  return result
}

const CAUSE_KEY: Record<LiveRunCause, string> = {
  "firefox-private": "workspace.liveRunCauseFirefoxPrivate",
  "firefox-tracking": "workspace.liveRunCauseFirefoxTracking",
  "safari-old": "workspace.liveRunCauseSafariOld",
  unknown: "workspace.liveRunCauseUnknown",
}

export function LiveRunDiagnostic({
  liveUrl,
  deployStatus,
  deploying,
  onDeploy,
}: {
  liveUrl: string | null | undefined
  deployStatus: string | null | undefined
  deploying: boolean
  onDeploy: () => void
}) {
  const { t } = useTranslation()
  const diagnosis = useLiveRunCause()

  const causeText = diagnosis ? t(CAUSE_KEY[diagnosis.cause], { browser: diagnosis.browser }) : t("workspace.noIsolation")

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle size={22} style={{ color: COLORS.amber }} />
      <p className="max-w-[320px] text-[12.5px]" style={{ color: COLORS.label }}>{causeText}</p>
      <p className="max-w-[320px] text-[12px]" style={{ color: COLORS.label, opacity: 0.75 }}>
        {t("workspace.liveRunFallbackHint")}
      </p>
      {deployStatus === "deployed" && liveUrl ? (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-premium-gold mt-1 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-medium"
        >
          <ExternalLink size={14} strokeWidth={1.75} />
          {t("workspace.liveRunFallbackOpenLive")}
        </a>
      ) : (
        <button
          type="button"
          onClick={onDeploy}
          disabled={deploying}
          className="btn-premium-gold mt-1 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} strokeWidth={1.75} />}
          {t("workspace.liveRunFallbackDeployNow")}
        </button>
      )}
    </div>
  )
}
