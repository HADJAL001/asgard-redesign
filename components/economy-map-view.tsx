"use client"

import Link from "next/link"
import { ArrowLeft, Zap, Gem, Diamond, Infinity as InfinityIcon, DollarSign } from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"

/* Palette: bg #0A0A0F · card #14141E · accent #00D4FF · label #6A6A8A · border #2A2A3E */

const STEPS = [
  { nameKey: "step1Name", descKey: "step1Desc", Icon: Zap, color: "#6A6A8A" },
  { nameKey: "step2Name", descKey: "step2Desc", Icon: Gem, color: "#8A8AA0" },
  { nameKey: "step3Name", descKey: "step3Desc", Icon: Diamond, color: "#00D4FF" },
  { nameKey: "step4Name", descKey: "step4Desc", Icon: InfinityIcon, color: "#C9A84C" },
  { nameKey: "step5Name", descKey: "step5Desc", Icon: DollarSign, color: "#4CD980" },
] as const

export function EconomyMapView() {
  const { t } = useTranslation()

  return (
    <div
      className="min-h-screen px-6 py-12"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)" }}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href="/docs"
          className="mb-8 inline-flex items-center gap-2 text-[13px] transition-colors hover:text-white"
          style={{ color: "#6A6A8A" }}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          {t("docsEconomyMap.backToDocs")}
        </Link>

        <h1 className="mb-2 text-[28px] font-semibold text-white">{t("docsEconomyMap.title")}</h1>
        <p className="mb-12 text-[15px]" style={{ color: "#6A6A8A" }}>
          {t("docsEconomyMap.subtitle")}
        </p>

        <div className="relative flex flex-col gap-0">
          {STEPS.map((step, i) => {
            const isLast = i === STEPS.length - 1
            return (
              <div key={step.nameKey} className="relative flex gap-5">
                <div className="flex flex-col items-center">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: "#14141E",
                      border: `1px solid ${step.color}`,
                      boxShadow: `0 0 16px ${step.color}33`,
                    }}
                  >
                    <step.Icon size={20} strokeWidth={1.75} style={{ color: step.color }} />
                  </div>
                  {!isLast && (
                    <div
                      className="my-1 w-px flex-1"
                      style={{ background: `linear-gradient(180deg, ${step.color}, ${STEPS[i + 1].color})`, minHeight: 48 }}
                    />
                  )}
                </div>

                <div className="pb-10">
                  <h2 className="mb-1 text-[17px] font-semibold" style={{ color: step.color }}>
                    {i + 1}. {t(`docsEconomyMap.${step.nameKey}`)}
                  </h2>
                  <p className="max-w-xl text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {t(`docsEconomyMap.${step.descKey}`)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <p
          className="mb-8 text-center text-[13px] italic"
          style={{ color: "#6A6A8A" }}
        >
          {t("docsEconomyMap.ladderCaption")}
        </p>

        <div
          className="rounded-xl p-4 text-center text-[13px]"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E", color: "#6A6A8A" }}
        >
          {t("docsEconomyMap.footerNote")}
        </div>
      </div>
    </div>
  )
}
