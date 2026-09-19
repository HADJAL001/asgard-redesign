"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Zap, Gem, Infinity as InfinityIcon, Gift, Check, Loader2 } from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { apiClient } from "@/lib/api-client"

/* Palette: bg #10181d · card #17242a · accent #d7ae57 · label #9eb2bc · border #30424b */

const STEPS = [
  { name: "Credits", description: "Soft currency earned through activity. It pays for generations and forge materials; it cannot be withdrawn.", Icon: Zap, color: "#9eb2bc" },
  { name: "Forge materials", description: "Shards and crystals are materials, not money. Buy them with Credits and consume them in the recipe for a specific artifact.", Icon: Gem, color: "#8A8AA0" },
  { name: "TimeCoin", description: "Hard currency earned through marketplace sales, staking and challenges. It pays for premium upgrades, twin rental and can be withdrawn to USDC.", Icon: InfinityIcon, color: "#C9A84C" },
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
      style={{ background: "linear-gradient(180deg, #10181d 0%, #0F0F1A 100%)" }}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href="/docs"
          className="mb-8 inline-flex items-center gap-2 text-[13px] transition-colors hover:text-white"
          style={{ color: "#9eb2bc" }}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          {t("docsEconomyMap.backToDocs")}
        </Link>

        <h1 className="mb-2 text-[28px] font-semibold text-white">{t("docsEconomyMap.title")}</h1>
        <p className="mb-12 text-[15px]" style={{ color: "#9eb2bc" }}>
          {t("docsEconomyMap.subtitle")}
        </p>

        <div className="relative flex flex-col gap-0">
          {STEPS.map((step, i) => {
            const isLast = i === STEPS.length - 1
            return (
              <div key={step.name} className="relative flex gap-5">
                <div className="flex flex-col items-center">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: "#17242a",
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
                    {i + 1}. {step.name}
                  </h2>
                  <p className="max-w-xl text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {step.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <p
          className="mb-8 text-center text-[13px] italic"
          style={{ color: "#9eb2bc" }}
        >
          Two currencies for value, two materials for crafting.
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
          style={{ backgroundColor: "#17242a", border: "1px solid #30424b", color: "#9eb2bc" }}
        >
          {t("docsEconomyMap.footerNote")}
        </div>
      </div>
    </div>
  )
}
