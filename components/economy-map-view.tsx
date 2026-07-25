"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Zap, Gem, Diamond, Infinity as InfinityIcon, DollarSign, Gift, Check, Loader2 } from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { apiClient } from "@/lib/api-client"
import { SectionHelp } from "./section-help"

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

  const [rewardClaimed, setRewardClaimed] = useState<boolean | null>(null)
  const [rewardCredits, setRewardCredits] = useState(40)
  const [claiming, setClaiming] = useState(false)
  const [rewardMsg, setRewardMsg] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<{ claimed: boolean; credits: number }>("/onboarding/economy-map-reward", { skipAuthRedirect: true })
      .then((r) => {
        setRewardClaimed(r.claimed)
        setRewardCredits(r.credits)
      })
      .catch(() => setRewardClaimed(null)) // гость/ошибка — просто прячем блок
  }, [])

  async function claimReward() {
    if (claiming) return
    setClaiming(true)
    setRewardMsg(null)
    try {
      const r = await apiClient.post<{ ok: boolean; credits: number }>("/onboarding/economy-map-reward")
      setRewardClaimed(true)
      setRewardMsg(`+${r.credits} кредитов зачислено. Добро пожаловать в экономику!`)
    } catch (err: any) {
      if (err?.data?.code === "ALREADY_CLAIMED") {
        setRewardClaimed(true)
      } else {
        setRewardMsg(err?.message || "Не удалось получить награду")
      }
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div
      className="min-h-screen px-6 py-12"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)" }}
    >
      <SectionHelp
        title="Карта экономики OSGARD"
        what="Экономика OSGARD — это лестница из пяти валют: от стартовых кредитов до реальных денег. Каждая ступень — шаг доверия миру. Пройдите обучение и заберите награду."
        goals={[
          { goal: "Понять путь денег", steps: ["Кредиты — за активность", "Шарды и кристаллы — за артефакты", "TimeCoin — валюта с рыночной ценой", "Доллары — вывод в реальные деньги"] },
          { goal: "Забрать награду за обучение", steps: ["Пролистайте пять ступеней", "Внизу нажмите «Забрать награду»", "Кредиты зачислятся один раз"] },
        ]}
        tour={[
          { title: "1. Кредиты", text: "Стартовая валюта — зарабатывается за активность: онбординг, посты, ежедневные действия." },
          { title: "2–3. Шарды и кристаллы", text: "Обмениваются на артефакты начального и качественного уровня, открывают премиум-усиления." },
          { title: "4. TimeCoin", text: "Валюта с реальной рыночной стоимостью: стейкинг, продажа на бирже, вывод." },
          { title: "5. Доллары", text: "Финальная ступень: TimeCoin конвертируется в реальные деньги. Это и есть цель лестницы." },
        ]}
      />
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

        {/* Награда за прохождение обучения (одноразовая) */}
        {rewardClaimed !== null && (
          <div
            className="mb-8 flex flex-col items-center gap-3 rounded-2xl p-6 text-center"
            style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.12), rgba(15,18,30,0.6))", border: "1px solid rgba(201,168,76,0.35)" }}
          >
            <Gift size={26} style={{ color: "#E6C868" }} />
            <p className="text-[15px] font-semibold text-white">Награда за изучение экономики</p>
            {rewardClaimed ? (
              <p className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: "#4CD980" }}>
                <Check size={15} /> Награда получена — спасибо, что разобрался!
              </p>
            ) : (
              <>
                <p className="max-w-md text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Прошёл лестницу валют? Забери {rewardCredits} кредитов на старт.
                </p>
                <button
                  type="button"
                  onClick={claimReward}
                  disabled={claiming}
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.03] disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #E6C868, #C69B2E)", color: "#1a1405" }}
                >
                  {claiming ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
                  Забрать {rewardCredits} кредитов
                </button>
              </>
            )}
            {rewardMsg && <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>{rewardMsg}</p>}
          </div>
        )}

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
