"use client"

/* ================================================================
   PipelineFlipSubtitle — бивилингвальный «субтитр» активной стадии
   конвейера Мастерской.
   ----------------------------------------------------------------
   Жалоба основателя: «скучно ждать» + хочет два языка — сначала
   технический текст (что реально происходит под капотом), затем
   переворот на простое объяснение для человека без бэкграунда.
   3D CSS-флип (perspective + rotateX + backface-visibility, см.
   .eg-flip-subtitle* в globals.css); prefers-reduced-motion гасит
   вращение, но не сам факт переключения языка (см. media-запрос там же).
   Технический/простая пара для каждой стадии — i18n-ключи
   workspace.stageSubtitle.<stage>.{technical,simple}.
   ================================================================ */

import { useEffect, useState } from "react"
import { useTranslation } from "@/lib/i18n/use-translation"

const FLIP_INTERVAL_MS = 3800

export type PipelineStageKey = "intent" | "claude" | "compiler" | "run" | "deploy"

export function PipelineFlipSubtitle({ stage }: { stage: PipelineStageKey }) {
  const { t } = useTranslation()
  const [simple, setSimple] = useState(false)

  useEffect(() => {
    setSimple(false)
    const id = setInterval(() => setSimple((v) => !v), FLIP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [stage])

  const technical = t(`workspace.stageSubtitle.${stage}.technical`)
  const simpleText = t(`workspace.stageSubtitle.${stage}.simple`)

  return (
    <span className="relative inline-block max-w-full align-top">
      {/* Скринридеру — один раз технический текст, без визуального флипа и дублей. */}
      <span className="sr-only">{technical}</span>
      <span aria-hidden="true" className="eg-flip-subtitle block max-w-full">
        <span className={`eg-flip-subtitle-inner block${simple ? " eg-flip-subtitle-inner--flipped" : ""}`}>
          <span className="eg-flip-subtitle-face eg-flip-subtitle-face--front block truncate">{technical}</span>
          <span className="eg-flip-subtitle-face eg-flip-subtitle-face--back block truncate">{simpleText}</span>
        </span>
      </span>
    </span>
  )
}
