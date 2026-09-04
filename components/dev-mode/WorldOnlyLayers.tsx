"use client"

/* ================================================================
   OSGARD · WorldOnlyLayers — глобальные слои, живущие ТОЛЬКО в
   обычном режиме (OSGARD WORLD).
   ----------------------------------------------------------------
   Зачем: плавающий виджет ДЖАРВИСа монтируется в AppShell, то есть на
   каждой странице платформы — включая студию разработчика, где он
   нарушает главный принцип режима (на экране только задача человека).

   Почему не CSS-скрытие, как у футера: виджет клиентский, и мы можем
   честно НЕ монтировать его — это дешевле (не грузится код и его
   состояние) и надёжнее, чем прятать уже отрисованный узел. Футер же
   рендерится серверным layout'ом, туда хук не занести — он скрывается
   правилом `.dev-mode footer` в globals.css.
   ================================================================ */

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useDevMode } from "@/lib/dev-mode"

const JarvisFloatingWidget = dynamic(
  () => import("../JarvisFloatingWidget").then((m) => m.JarvisFloatingWidget),
  { ssr: false },
)

export function WorldOnlyLayers() {
  const { mode } = useDevMode()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const idle = window.requestIdleCallback?.(() => setReady(true), { timeout: 1_500 })
    if (idle !== undefined) return () => window.cancelIdleCallback?.(idle)

    const timer = window.setTimeout(() => setReady(true), 1_500)
    return () => window.clearTimeout(timer)
  }, [])

  if (mode === "dev" || !ready) return null
  return <JarvisFloatingWidget />
}
