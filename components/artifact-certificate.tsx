"use client"

/* ================================================================
   ArtifactCertificate — «карта коллекционера» (Фаза B, сенсорный слой)
   ----------------------------------------------------------------
   Премиальный сертификат владения артефактом: serif-числа
   (--font-cormorant), фольга редкости, плёночное зерно (--grain),
   золотая рамка и фирменный ∞-водяной знак. Открывается модалкой из
   карточки артефакта (artifacts-view.tsx).

   Честность данных («без халтуры»):
   - «Рождён» рендерится ТОЛЬКО если передан реальный bornAt.
   - «Печать провенанса» — заглушка до Фазы D. Когда придёт реальный
     provenanceHref (GET /provenance/artifact/:id), печать станет
     кликабельной ссылкой; до тех пор — статичный «запечатанный» штамп
     без фейковых цифр.
   - Шэринг — navigator.share с фолбэком на копирование в буфер; без
     зависимости от ещё не подключённой OG-инфры (отдельный PR).

   Тумблер сенсорной подписи по умолчанию OFF → play() внутри уважает
   его и reduced-motion, поэтому у текущих пользователей поведение не
   меняется.
   ================================================================ */

import { useEffect, useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { X, Lock, Share2, Check, ShieldCheck } from "lucide-react"
import { RARITY, ARTIFACT_TYPES, STAT_META, COLORS, type Rarity, type ArtifactType } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { useSignature } from "@/hooks/useSignature"

function safeRarity(r: string): Rarity {
  return r in RARITY ? (r as Rarity) : "common"
}
function safeType(t: string): ArtifactType {
  return t in ARTIFACT_TYPES ? (t as ArtifactType) : "artifact"
}

export type CertificateArtifact = {
  id: number
  name: string
  type: string
  rarity: string
  level: number
  power: number
  defense: number
  magic: number
  speed: number
}

export function ArtifactCertificate({
  artifact,
  architect,
  bornAt,
  provenanceHref,
  onClose,
}: {
  artifact: CertificateArtifact | null
  /** Имя архитектора-создателя (если известно) — строка провенанса. */
  architect?: string
  /** Реальная дата рождения артефакта (ISO). Без неё строка «Рождён» не рендерится. */
  bornAt?: string
  /** Реальная ссылка на леджер провенанса (Фаза D). Пока не передана — печать-заглушка. */
  provenanceHref?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const { play } = useSignature()
  const [shared, setShared] = useState(false)

  const open = artifact !== null

  // Сенсорная «подпись» открытия сертификата — один раз на монтирование карты.
  useEffect(() => {
    if (!open) return
    play("artifactBorn")
    // play зависит от тумблера/редьюса внутри — эффект на факт открытия.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.id])

  // Esc закрывает модалку.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!artifact) return null

  const rarityKey = safeRarity(artifact.rarity)
  const rarity = RARITY[rarityKey]
  const TypeIcon = ARTIFACT_TYPES[safeType(artifact.type)].Icon
  const isMythic = rarityKey === "mythic"
  const isLegendary = rarityKey === "legendary"
  const stats = { power: artifact.power, defense: artifact.defense, magic: artifact.magic, speed: artifact.speed }
  const statSum = stats.power + stats.defense + stats.magic + stats.speed

  const iconGlow = isMythic
    ? `0 0 22px ${rarity.color}, inset 0 0 14px ${rarity.color}55`
    : isLegendary
      ? `0 0 16px ${rarity.color}88`
      : `0 0 10px ${rarity.color}44`

  const bornLabel = bornAt
    ? new Date(bornAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
    : null

  async function handleShare() {
    const text = `${artifact!.name} · ${rarity.label} · ${statSum} ⚡ — OSGARD`
    play("rarityUp")
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${artifact!.name} — ${t("signature.certificate")}`, text })
        return
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      }
    } catch {
      /* пользователь отменил шэр или буфер недоступен — тихо игнорируем */
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] flex items-center justify-center p-4"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ background: "rgba(5,7,15,0.78)", backdropFilter: "blur(10px)" }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={t("signature.certificate")}
      >
        <motion.article
          className="premium-card relative w-full max-w-[360px] overflow-hidden p-6"
          initial={reduce ? false : { opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, y: 20, scale: 0.94 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "linear-gradient(180deg, #12121C 0%, #0A0A12 100%)",
            border: "1px solid var(--color-gold)",
            boxShadow: "var(--eg-glow-gold), 0 24px 64px rgba(5,7,15,0.6)",
          }}
        >
          {/* Фирменный ∞-водяной знак */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-8 select-none font-serif text-[160px] leading-none"
            style={{ color: "var(--color-gold)", opacity: 0.05 }}
          >
            ∞
          </span>

          {/* Закрыть */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg transition-colors"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = COLORS.text
              e.currentTarget.style.borderColor = "var(--color-gold)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = COLORS.label
              e.currentTarget.style.borderColor = COLORS.border
            }}
          >
            <X size={15} strokeWidth={2} />
          </button>

          {/* Шапка: гриф сертификата */}
          <div className="relative flex items-center gap-2">
            <ShieldCheck size={14} strokeWidth={1.75} style={{ color: "var(--color-gold)" }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--color-gold)" }}
            >
              {t("signature.certificate")}
            </span>
          </div>

          {/* Икона типа в рамке редкости */}
          <div className="relative mt-5 flex flex-col items-center text-center">
            <span
              className="flex size-20 items-center justify-center rounded-2xl"
              style={{ border: `1px solid ${rarity.color}`, boxShadow: iconGlow }}
            >
              <TypeIcon size={38} strokeWidth={1.1} style={{ color: rarity.color }} />
            </span>

            {/* Имя — фольга на высших тирах */}
            <h2
              className={`serif-title mt-4 text-[24px] leading-tight ${isMythic ? "rarity-mythic-foil" : ""}`}
              style={
                isLegendary
                  ? { color: rarity.color, textShadow: `0 0 18px ${rarity.color}55` }
                  : { color: COLORS.text }
              }
            >
              {artifact.name}
            </h2>

            {/* Тип · уровень · редкость */}
            <div className="mt-2 flex items-center gap-2 text-[12px]">
              <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[safeType(artifact.type)].label}</span>
              <span style={{ color: COLORS.border }}>·</span>
              <span style={{ color: COLORS.label }}>Ур. {artifact.level}</span>
              <span style={{ color: COLORS.border }}>·</span>
              <span className="inline-flex items-center gap-1" style={{ color: rarity.color }}>
                <span aria-hidden>{rarity.symbol}</span>
                {rarity.label}
              </span>
            </div>
          </div>

          {/* Разделитель */}
          <div className="my-5 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${rarity.color}55, transparent)` }} />

          {/* Статы — serif-числа */}
          <div className="grid grid-cols-2 gap-2">
            {STAT_META.map((s) => (
              <div
                key={s.key}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px]"
                style={{ border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,0.02)" }}
              >
                <span className="inline-flex items-center gap-1.5" style={{ color: COLORS.label }}>
                  <s.Icon size={13} strokeWidth={1.5} />
                  {s.label}
                </span>
                <span className="premium-num text-[15px]" style={{ color: COLORS.text }}>
                  {stats[s.key]}
                </span>
              </div>
            ))}
          </div>

          {/* Совокупная мощь */}
          <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2" style={{ border: `1px solid var(--color-gold)33`, background: "rgba(212,175,55,0.05)" }}>
            <span className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.label }}>
              {t("signature.power")}
            </span>
            <span className="premium-num text-[18px]" style={{ color: "var(--color-gold)" }}>
              {statSum} ⚡
            </span>
          </div>

          {/* Провенанс: архитектор + дата рождения (только реальные данные) */}
          {(architect || bornLabel) && (
            <div className="mt-4 space-y-1 text-center text-[11px]" style={{ color: COLORS.label }}>
              {architect && (
                <p>
                  {t("signature.provenanceSeal")} · <span style={{ color: COLORS.text }}>{architect}</span>
                </p>
              )}
              {bornLabel && (
                <p>
                  {t("signature.born")} · <span style={{ color: COLORS.text }}>{bornLabel}</span>
                </p>
              )}
            </div>
          )}

          {/* Печать провенанса: заглушка (Фаза D → реальная ссылка) */}
          <div className="mt-5">
            {provenanceHref ? (
              <a
                href={provenanceHref}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-medium transition-colors"
                style={{ border: `1px solid var(--color-gold)66`, color: "var(--color-gold)" }}
              >
                <ShieldCheck size={14} strokeWidth={1.75} />
                {t("signature.provenanceSeal")}
              </a>
            ) : (
              <div
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px]"
                style={{ border: `1px dashed ${COLORS.border}`, color: COLORS.label }}
                title={t("signature.provenanceSeal")}
              >
                <Lock size={13} strokeWidth={1.75} />
                {t("signature.provenanceSeal")}
              </div>
            )}
          </div>

          {/* Поделиться картой */}
          <button
            type="button"
            onClick={handleShare}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-gold)", color: "#0A0A12" }}
          >
            {shared ? <Check size={15} strokeWidth={2.25} /> : <Share2 size={15} strokeWidth={2} />}
            {shared ? t("signature.copied") : t("signature.shareCard")}
          </button>
        </motion.article>
      </motion.div>
    </AnimatePresence>
  )
}
