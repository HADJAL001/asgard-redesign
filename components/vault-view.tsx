"use client"

/* ================================================================
   OSGARD · Хранилище провенанса — витрина доверия (read-only)
   ----------------------------------------------------------------
   Фаза D. Премиальная «комната-хранилище» поверх РЕАЛЬНЫХ данных:
   - /provenance/vault      — сводка вселенной + честный статус защиты
   - /provenance/artifact/:id — леджер жизни одного артефакта (по ?artifact=)
   Без «security theatre» и без выдуманных цифр: пусто → честно пусто.
   Строим ПОВЕРХ слоя авторства (#52, artifacts.creator_id → «Кузнец-создатель»).
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ShieldCheck, Lock, Sparkles, ArrowLeft, Hammer, Clock } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"
import { useTranslation } from "@/lib/i18n/use-translation"
import { RARITY, type Rarity } from "@/lib/economy"

const COLORS = {
  bg0: "#0A0A0F",
  bg1: "#141420",
  text: "#F5F5F7",
  dim: "rgba(245,245,247,0.5)",
  faint: "rgba(245,245,247,0.32)",
  gold: "#D4AF37",
  line: "rgba(212,175,55,0.18)",
}

/* --- типы ответов бэка (см. backend/src/routes/provenance.routes.ts) --- */
type VaultResponse = {
  success: boolean
  vault: {
    artifacts: { total: number; createdByYou: number; byRarity: Record<string, number> }
    security: {
      twoFactorEnabled: boolean
      encryptionConfigured: boolean
      encryptionAlgorithm: string
      protects: string[]
    }
    recent: Array<{ kind: string; text: string; at: string | null }>
    at: string
  }
}

type LedgerResponse = {
  success: boolean
  artifact: { id: number; name: string; type: string; rarity: string; level: number }
  origin: {
    at: string | null
    source: string
    projectId: number | null
    projectName: string | null
    creator: { name: string; isYou: boolean } | null
  }
  ledger: Array<{ kind: string; at: string | null; text: string; actor: string; meta: Record<string, unknown> | null }>
}

function rarityColor(rarity: string): string {
  return RARITY[rarity as Rarity]?.color ?? COLORS.faint
}

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(locale === "kz" ? "kk" : locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/* ================================================================ */
export function VaultView() {
  const { t, locale } = useTranslation()
  const params = useSearchParams()
  const artifactId = params.get("artifact")

  return (
    <div className="min-h-screen font-sans" style={{ background: `linear-gradient(180deg, ${COLORS.bg0} 0%, ${COLORS.bg1} 100%)`, color: COLORS.text }}>
      <Navbar />
      <main className="mx-auto max-w-[1080px] px-6 py-10 md:px-10 md:py-12">
        {artifactId ? <LedgerPanel id={artifactId} /> : <VaultSummary />}
      </main>
    </div>
  )

  /* ---------------- Сводка вселенной ---------------- */
  function VaultSummary() {
    const [data, setData] = useState<VaultResponse["vault"] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      let alive = true
      apiClient
        .get<VaultResponse>("/provenance/vault")
        .then((res) => {
          if (alive) setData(res.vault)
        })
        .catch((e) => {
          if (alive) setError(e?.message || t("vault.error"))
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [])

    if (loading) return <SkeletonBlock />
    if (error || !data) return <ErrorBlock message={error} />

    const { artifacts, security, recent } = data
    const rarityEntries = Object.entries(artifacts.byRarity).sort((a, b) => b[1] - a[1])

    return (
      <>
        <header className="mb-8">
          <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: COLORS.gold, letterSpacing: "0.14em" }}>
            <Lock size={14} /> {t("vault.eyebrow")}
          </div>
          <h1 className="mt-2 text-[34px] font-semibold leading-tight md:text-[40px]">{t("vault.title")}</h1>
          <p className="mt-2 max-w-[560px] text-[14px]" style={{ color: COLORS.dim }}>
            {t("vault.subtitle")}
          </p>
        </header>

        {/* Итоги по артефактам */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t("vault.totalArtifacts")} value={artifacts.total} icon={<Sparkles size={16} />} />
          <StatCard label={t("vault.forgedByYou")} value={artifacts.createdByYou} icon={<Hammer size={16} />} accent />
          <StatCard
            label={t("vault.rarityKinds")}
            value={rarityEntries.length}
            icon={<ShieldCheck size={16} />}
          />
        </section>

        {/* Разбивка по редкости */}
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.faint }}>
            {t("vault.byRarity")}
          </h2>
          {rarityEntries.length === 0 ? (
            <EmptyLine text={t("vault.noArtifacts")} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {rarityEntries.map(([rarity, n]) => (
                <div
                  key={rarity}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px]"
                  style={{ border: `1px solid ${rarityColor(rarity)}55`, background: `${rarityColor(rarity)}12` }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: rarityColor(rarity), display: "inline-block" }} />
                  <span style={{ color: rarityColor(rarity) }}>{RARITY[rarity as Rarity]?.label ?? rarity}</span>
                  <span style={{ color: COLORS.text, fontWeight: 600 }}>{n}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Статус защиты — честный, реальный */}
        <section
          className="mt-8 rounded-2xl p-5"
          style={{ border: `1px solid ${COLORS.line}`, background: "rgba(212,175,55,0.04)" }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} style={{ color: COLORS.gold }} />
            <h2 className="text-[15px] font-semibold">{t("vault.securityTitle")}</h2>
          </div>
          <ul className="mt-4 space-y-3">
            <SecurityRow
              on={security.encryptionConfigured}
              label={t("vault.encryption")}
              detail={
                security.encryptionConfigured
                  ? t("vault.encryptionOn", { algo: security.encryptionAlgorithm })
                  : t("vault.encryptionOff")
              }
            />
            <SecurityRow
              on={security.twoFactorEnabled}
              label={t("vault.twoFactor")}
              detail={security.twoFactorEnabled ? t("vault.twoFactorOn") : t("vault.twoFactorOff")}
            />
          </ul>
          {security.protects.length > 0 && (
            <p className="mt-4 text-[12px]" style={{ color: COLORS.faint }}>
              {t("vault.protects")}: {security.protects.join(", ")}
            </p>
          )}
        </section>

        {/* Последние собственные события */}
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.faint }}>
            {t("vault.recentTitle")}
          </h2>
          {recent.length === 0 ? (
            <EmptyLine text={t("vault.noEvents")} />
          ) : (
            <ol className="space-y-2">
              {recent.map((e, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl px-4 py-3"
                  style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
                >
                  <Clock size={14} className="mt-0.5 shrink-0" style={{ color: COLORS.faint }} />
                  <div className="min-w-0">
                    <div className="text-[14px]">{e.text}</div>
                    <div className="text-[12px]" style={{ color: COLORS.faint }}>
                      {fmtDate(e.at, locale)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </>
    )
  }

  /* ---------------- Леджер одного артефакта ---------------- */
  function LedgerPanel({ id }: { id: string }) {
    const [data, setData] = useState<LedgerResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      let alive = true
      setLoading(true)
      setError(null)
      apiClient
        .get<LedgerResponse>(`/provenance/artifact/${encodeURIComponent(id)}`, { skipAuthRedirect: true })
        .then((res) => {
          if (alive) setData(res)
        })
        .catch((e) => {
          if (alive) setError(e?.status === 404 ? t("vault.notFound") : e?.message || t("vault.error"))
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [id])

    return (
      <>
        <Link href="/vault" className="mb-6 inline-flex items-center gap-2 text-[13px] transition-opacity hover:opacity-80" style={{ color: COLORS.dim }}>
          <ArrowLeft size={14} /> {t("vault.backToVault")}
        </Link>

        {loading ? (
          <SkeletonBlock />
        ) : error || !data ? (
          <ErrorBlock message={error} />
        ) : (
          <>
            <header className="mb-6">
              <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: rarityColor(data.artifact.rarity), letterSpacing: "0.12em" }}>
                {RARITY[data.artifact.rarity as Rarity]?.label ?? data.artifact.rarity} · {t("vault.level")} {data.artifact.level}
              </div>
              <h1 className="mt-2 text-[30px] font-semibold leading-tight md:text-[36px]">{data.artifact.name}</h1>
            </header>

            {/* Происхождение */}
            <section
              className="rounded-2xl p-5"
              style={{ border: `1px solid ${COLORS.line}`, background: "rgba(212,175,55,0.04)" }}
            >
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.faint }}>
                {t("vault.origin")}
              </h2>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                <OriginRow label={t("vault.bornAt")} value={fmtDate(data.origin.at, locale)} />
                <OriginRow label={t("vault.source")} value={data.origin.source} />
                {data.origin.projectName && <OriginRow label={t("vault.fromProject")} value={data.origin.projectName} />}
                <OriginRow
                  label={t("vault.creator")}
                  value={
                    data.origin.creator
                      ? data.origin.creator.isYou
                        ? `${data.origin.creator.name} · ${t("vault.you")}`
                        : data.origin.creator.name
                      : t("vault.creatorUnknown")
                  }
                />
              </dl>
            </section>

            {/* Леджер жизни */}
            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.faint }}>
                {t("vault.ledger")}
              </h2>
              {data.ledger.length === 0 ? (
                <EmptyLine text={t("vault.noLedger")} />
              ) : (
                <ol className="relative space-y-4 pl-6">
                  <span className="absolute bottom-2 left-[7px] top-2 w-px" style={{ background: COLORS.line }} />
                  {data.ledger.map((e, i) => (
                    <li key={i} className="relative">
                      <span
                        className="absolute -left-6 top-1"
                        style={{ width: 12, height: 12, borderRadius: "50%", background: COLORS.gold, boxShadow: `0 0 0 3px ${COLORS.bg1}` }}
                      />
                      <div className="text-[14px]">{e.text}</div>
                      <div className="text-[12px]" style={{ color: COLORS.faint }}>
                        {fmtDate(e.at, locale)} · {e.actor}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </>
    )
  }
}

/* ---------------- мелкие пресентационные блоки ---------------- */
function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        border: accent ? `1px solid ${COLORS.line}` : "1px solid rgba(255,255,255,0.07)",
        background: accent ? "rgba(212,175,55,0.05)" : "rgba(255,255,255,0.02)",
      }}
    >
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.1em]" style={{ color: COLORS.faint }}>
        <span style={{ color: accent ? COLORS.gold : COLORS.dim }}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-[32px] font-semibold" style={{ color: accent ? COLORS.gold : COLORS.text }}>
        {value}
      </div>
    </div>
  )
}

function SecurityRow({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]"
        style={{
          background: on ? "rgba(46,204,113,0.16)" : "rgba(255,255,255,0.06)",
          color: on ? "#2ecc71" : COLORS.faint,
        }}
      >
        {on ? "✓" : "—"}
      </span>
      <div>
        <div className="text-[14px] font-medium">{label}</div>
        <div className="text-[12px]" style={{ color: COLORS.faint }}>
          {detail}
        </div>
      </div>
    </li>
  )
}

function OriginRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: COLORS.faint }}>
        {label}
      </dt>
      <dd className="text-[14px]" style={{ color: COLORS.text }}>
        {value}
      </dd>
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl px-4 py-6 text-center text-[13px]"
      style={{ border: "1px dashed rgba(255,255,255,0.1)", color: COLORS.faint }}
    >
      {text}
    </div>
  )
}

function SkeletonBlock() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
      ))}
    </div>
  )
}

function ErrorBlock({ message }: { message: string | null }) {
  const { t } = useTranslation()
  return (
    <div
      className="rounded-2xl px-5 py-8 text-center"
      style={{ border: "1px solid rgba(231,76,60,0.28)", background: "rgba(231,76,60,0.06)", color: "#E74C3C" }}
    >
      {message || t("vault.error")}
    </div>
  )
}
