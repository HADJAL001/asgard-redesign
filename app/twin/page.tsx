"use client"

/* ================================================================
   Страница /twin — Цифровой Близнец
   ----------------------------------------------------------------
   GET  /twin/mine              → профиль близнеца (создаётся автоматически)
   GET  /twin/artifacts         → артефакты, созданные близнецом
   POST /twin/train             → { artifactId } — обучить на своём артефакте
   POST /twin/generate          → { prompt? } — сгенерировать артефакт в стиле близнеца
   PATCH /twin/name             → { name } — переименовать
   POST /twin/rental/toggle     → { enabled, priceTc? } — вкл/выкл аренду
   GET  /twin/marketplace       → список чужих близнецов в аренду
   POST /twin/rental/rent       → { twinId, days } — арендовать
   GET  /twin/rentals/income    → доход от сдачи своего близнеца
   ================================================================ */

import { useEffect, useState } from "react"
import {
  Sparkles,
  Zap,
  TrendingUp,
  Package,
  Pencil,
  Check,
  Loader2,
  Coins,
  Store,
} from "lucide-react"
import { Navbar } from "@/components/navbar"
import { apiClient } from "@/lib/api-client"
import { useRequireAuth } from "@/lib/auth-store"
import { useTranslation } from "@/lib/i18n/use-translation"

type Twin = {
  id: number
  userId: number
  name: string
  level: number
  xp: number
  styleVector: any
  styleTags: string[]
  trainedSamples: number
  artifactsCreated: number
  isRentable: boolean
  rentalPriceTc: number
  totalRentalIncome: number
  avatarSeed: string
  createdAt: number
  updatedAt: number
}

type TwinArtifact = {
  id: number
  twinId: number
  ownerId: number
  name: string
  type: string
  rarity: string
  power: number
  defense: number
  magic: number
  speed: number
  styleTag: string
  prompt: string
  description?: string | null
  source?: string | null
  createdAt: number
}

type MyArtifact = {
  id: number
  name: string
  type: string
  rarity: string
}

type MarketplaceTwin = {
  id: number
  userId: number
  name: string
  level: number
  styleTags: string[]
  rentalPriceTc: number
  artifactsCreated: number
  ownerUsername: string
  ownerDisplayName: string | null
}

const RARITY_COLORS: Record<string, string> = {
  common: "#6A6A8A",
  rare: "#3AA8FF",
  epic: "#B15CFF",
  legendary: "#FFC94A",
  mythic: "#FF3B8A",
}

function fmtTC(n: number): string {
  return `∞ ${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`
}

export default function TwinPage() {
  useRequireAuth()
  const { t } = useTranslation()

  const [twin, setTwin] = useState<Twin | null>(null)
  const [artifacts, setArtifacts] = useState<TwinArtifact[]>([])
  const [myArtifacts, setMyArtifacts] = useState<MyArtifact[]>([])
  const [marketplace, setMarketplace] = useState<MarketplaceTwin[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [rentalPriceDraft, setRentalPriceDraft] = useState("")
  const [rentDaysDraft, setRentDaysDraft] = useState<Record<number, string>>({})

  async function loadAll() {
    setLoading(true)
    try {
      const opts = { skipAuthRedirect: true }
      const [twinData, artifactsData, marketplaceData, myArtifactsData] = await Promise.all([
        apiClient.get<{ twin: Twin }>("/twin/mine", opts),
        apiClient.get<{ artifacts: TwinArtifact[] }>("/twin/artifacts", opts),
        apiClient.get<{ listings: MarketplaceTwin[] }>("/twin/marketplace", opts),
        apiClient.get<{ artifacts: MyArtifact[] }>("/artifacts/mine", opts),
      ])
      setTwin(twinData.twin)
      setArtifacts(artifactsData.artifacts)
      setMarketplace(marketplaceData.listings)
      setMyArtifacts(myArtifactsData.artifacts)
      setRentalPriceDraft(String(twinData.twin.rentalPriceTc || ""))
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || t("twinPage.loadFailed") })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(loadAll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleTrain(artifactId: number) {
    setBusy(true)
    setNotice(null)
    try {
      const data = await apiClient.post<{ twin: Twin; xpGained: number; leveledUp: boolean }>("/twin/train", {
        artifactId,
      })
      setTwin(data.twin)
      setNotice({
        ok: true,
        text: data.leveledUp
          ? `${t("twinPage.trainDone", { xp: data.xpGained })} · ${t("twinPage.levelUp")}`
          : t("twinPage.trainDone", { xp: data.xpGained }),
      })
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || t("twinPage.trainFailed") })
    } finally {
      setBusy(false)
    }
  }

  async function handleGenerate() {
    setBusy(true)
    setNotice(null)
    try {
      const data = await apiClient.post<{ artifact: TwinArtifact }>("/twin/generate", {})
      setArtifacts((prev) => [data.artifact, ...prev])
      setTwin((prev) => (prev ? { ...prev, artifactsCreated: prev.artifactsCreated + 1 } : prev))
      setNotice({ ok: true, text: t("twinPage.generateDone", { name: data.artifact.name }) })
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || t("twinPage.generateFailed") })
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveName() {
    if (!nameDraft.trim()) return
    setBusy(true)
    try {
      const data = await apiClient.patch<{ twin: Twin }>("/twin/name", { name: nameDraft.trim() })
      setTwin(data.twin)
      setEditingName(false)
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || t("twinPage.loadFailed") })
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleRental() {
    if (!twin) return
    setBusy(true)
    setNotice(null)
    try {
      const enabled = !twin.isRentable
      const priceTc = Number(rentalPriceDraft) || undefined
      const data = await apiClient.post<{ twin: Twin }>("/twin/rental/toggle", { enabled, priceTc })
      setTwin(data.twin)
      setRentalPriceDraft(String(data.twin.rentalPriceTc || ""))
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || t("twinPage.loadFailed") })
    } finally {
      setBusy(false)
    }
  }

  async function handleRent(listing: MarketplaceTwin) {
    const days = Number(rentDaysDraft[listing.id]) || 1
    setBusy(true)
    setNotice(null)
    try {
      await apiClient.post("/twin/rental/rent", { twinId: listing.id, days })
      setNotice({ ok: true, text: t("twinPage.rentDone") })
      await loadAll()
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || t("twinPage.rentFailed") })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ backgroundColor: "#0A0A0F", minHeight: "100vh", color: "#FFFFFF" }}>
        <Navbar />
        <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
          <Loader2 className="mr-2 animate-spin" size={18} />
          {t("common.loading")}
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: "#0A0A0F", minHeight: "100vh", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{t("twinPage.title")}</h1>
          <p className="mt-1 text-sm" style={{ color: "#6A6A8A" }}>
            {t("twinPage.subtitle")}
          </p>
        </header>

        {notice && (
          <div
            className="mb-6 rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: notice.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              border: `1px solid ${notice.ok ? "#4ADE80" : "#F87171"}`,
              color: notice.ok ? "#4ADE80" : "#F87171",
            }}
          >
            {notice.text}
          </div>
        )}

        {twin && (
          <>
            {/* ---- Профиль близнеца ---- */}
            <div
              className="mb-6 flex flex-col gap-6 rounded-xl p-6 sm:flex-row sm:items-center sm:justify-between"
              style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex size-16 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(0,212,255,0.12)", border: "1px solid #00D4FF" }}
                >
                  <Sparkles size={28} strokeWidth={1.5} style={{ color: "#00D4FF" }} />
                </div>
                <div>
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                        placeholder={t("twinPage.namePlaceholder")}
                        className="rounded-lg px-3 py-1.5 text-lg font-semibold outline-none"
                        style={{ backgroundColor: "#0A0A0F", border: "1px solid #00D4FF", color: "#FFFFFF" }}
                      />
                      <button onClick={handleSaveName} disabled={busy}>
                        <Check size={18} style={{ color: "#4ADE80" }} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{twin.name}</h2>
                      <button
                        onClick={() => {
                          setNameDraft(twin.name)
                          setEditingName(true)
                        }}
                        aria-label={t("twinPage.renameBtn")}
                      >
                        <Pencil size={14} style={{ color: "#6A6A8A" }} />
                      </button>
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-sm" style={{ color: "#6A6A8A" }}>
                    <span style={{ color: "#00D4FF" }}>{t("twinPage.level", { level: twin.level })}</span>
                    <span>{t("twinPage.xp", { xp: twin.xp })}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {twin.styleTags.length > 0 ? (
                      twin.styleTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full px-2.5 py-0.5 text-[11px]"
                          style={{ backgroundColor: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid #00D4FF" }}
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs" style={{ color: "#6A6A8A" }}>
                        {t("twinPage.noStyleTags")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={busy || twin.trainedSamples === 0}
                className="flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
                title={twin.trainedSamples === 0 ? t("twinPage.generateNeedTraining") : undefined}
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                {busy ? t("twinPage.generating") : t("twinPage.generateBtn")}
              </button>
            </div>

            {/* ---- Статистика ---- */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { icon: Package, label: t("twinPage.trainedSamples"), value: twin.trainedSamples },
                { icon: Sparkles, label: t("twinPage.artifactsCreated"), value: twin.artifactsCreated },
                { icon: Coins, label: t("twinPage.totalIncome"), value: fmtTC(twin.totalRentalIncome) },
                { icon: TrendingUp, label: t("twinPage.level", { level: twin.level }), value: `${twin.xp} XP` },
              ].map(({ icon: Icon, label, value }, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
                >
                  <Icon size={18} strokeWidth={1.5} style={{ color: "#00D4FF" }} />
                  <div className="mt-2 text-lg font-semibold">{value}</div>
                  <div className="text-xs" style={{ color: "#6A6A8A" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* ---- Обучение близнеца ---- */}
              <div className="rounded-xl p-5" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
                <h3 className="mb-3 font-medium">{t("twinPage.trainBtn")}</h3>
                {myArtifacts.length === 0 ? (
                  <p className="text-sm" style={{ color: "#6A6A8A" }}>
                    {t("artifacts.notFound")}
                  </p>
                ) : (
                  <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                    {myArtifacts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-lg px-3 py-2"
                        style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
                      >
                        <div>
                          <div className="text-sm">{a.name}</div>
                          <div className="text-[11px]" style={{ color: RARITY_COLORS[a.rarity] || "#6A6A8A" }}>
                            {a.rarity} · {a.type}
                          </div>
                        </div>
                        <button
                          onClick={() => handleTrain(a.id)}
                          disabled={busy}
                          className="rounded-md px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-50"
                          style={{ backgroundColor: "transparent", color: "#00D4FF", border: "1px solid #00D4FF" }}
                        >
                          {t("twinPage.trainBtn")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---- Сдача в аренду ---- */}
              <div className="rounded-xl p-5" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
                <h3 className="mb-3 font-medium">{t("twinPage.rentalTitle")}</h3>
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px]"
                    style={{
                      backgroundColor: twin.isRentable ? "rgba(74,222,128,0.12)" : "rgba(106,106,138,0.12)",
                      color: twin.isRentable ? "#4ADE80" : "#6A6A8A",
                      border: `1px solid ${twin.isRentable ? "#4ADE80" : "#2A2A3E"}`,
                    }}
                  >
                    {twin.isRentable ? t("twinPage.rentalEnabled") : t("twinPage.rentalDisabled")}
                  </span>
                </div>
                <label className="mb-1 block text-xs" style={{ color: "#6A6A8A" }}>
                  {t("twinPage.rentalPrice")}
                </label>
                <input
                  type="number"
                  value={rentalPriceDraft}
                  onChange={(e) => setRentalPriceDraft(e.target.value)}
                  className="mb-3 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
                />
                <button
                  onClick={handleToggleRental}
                  disabled={busy || (twin.trainedSamples === 0 && !twin.isRentable)}
                  className="w-full rounded-lg py-2 text-sm font-medium transition-opacity disabled:opacity-40"
                  style={{
                    backgroundColor: twin.isRentable ? "transparent" : "#00D4FF",
                    color: twin.isRentable ? "#F87171" : "#0A0A0F",
                    border: twin.isRentable ? "1px solid #F87171" : "none",
                  }}
                >
                  {twin.isRentable ? t("twinPage.disableRental") : t("twinPage.enableRental")}
                </button>
              </div>
            </div>

            {/* ---- Артефакты близнеца ---- */}
            <div className="mb-8">
              <h3 className="mb-3 font-medium">{t("twinPage.myArtifactsTitle")}</h3>
              {artifacts.length === 0 ? (
                <div
                  className="rounded-xl py-10 text-center text-sm"
                  style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E", color: "#6A6A8A" }}
                >
                  {t("twinPage.noArtifacts")}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {artifacts.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl p-4"
                      style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">{a.name}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] uppercase"
                          style={{ color: RARITY_COLORS[a.rarity] || "#6A6A8A", border: `1px solid ${RARITY_COLORS[a.rarity] || "#2A2A3E"}` }}
                        >
                          {a.rarity}
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: "#6A6A8A" }}>
                        {a.type} · {a.styleTag}
                      </div>
                      {a.description && (
                        <p className="mt-2 text-xs italic" style={{ color: "#9A9AB5" }}>
                          {a.description}
                        </p>
                      )}
                      <div className="mt-2 grid grid-cols-4 gap-1 text-[11px]" style={{ color: "#6A6A8A" }}>
                        <span>⚔ {a.power}</span>
                        <span>🛡 {a.defense}</span>
                        <span>✨ {a.magic}</span>
                        <span>💨 {a.speed}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ---- Маркетплейс близнецов ---- */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Store size={18} style={{ color: "#00D4FF" }} />
            <h3 className="font-medium">{t("twinPage.marketplaceTitle")}</h3>
          </div>
          <p className="mb-4 text-sm" style={{ color: "#6A6A8A" }}>
            {t("twinPage.marketplaceSubtitle")}
          </p>

          {marketplace.length === 0 ? (
            <div
              className="rounded-xl py-10 text-center text-sm"
              style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E", color: "#6A6A8A" }}
            >
              {t("twinPage.noListings")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {marketplace.map((listing) => (
                <div
                  key={listing.id}
                  className="flex flex-col rounded-xl p-4"
                  style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{listing.name}</span>
                    <span style={{ color: "#00D4FF" }} className="text-xs">
                      {t("twinPage.level", { level: listing.level })}
                    </span>
                  </div>
                  <div className="mb-2 text-xs" style={{ color: "#6A6A8A" }}>
                    {t("twinPage.owner", { name: listing.ownerDisplayName || listing.ownerUsername })}
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {listing.styleTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full px-2 py-0.5 text-[10px]"
                        style={{ backgroundColor: "rgba(0,212,255,0.1)", color: "#00D4FF" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mb-3 text-sm font-semibold" style={{ color: "#00D4FF" }}>
                    {fmtTC(listing.rentalPriceTc)} / день
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      placeholder={t("twinPage.rentDays")}
                      value={rentDaysDraft[listing.id] || ""}
                      onChange={(e) => setRentDaysDraft((prev) => ({ ...prev, [listing.id]: e.target.value }))}
                      className="w-20 rounded-lg px-2 py-1.5 text-sm outline-none"
                      style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
                    />
                    <button
                      onClick={() => handleRent(listing)}
                      disabled={busy}
                      className="flex-1 rounded-lg py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
                    >
                      {busy ? t("twinPage.renting") : t("twinPage.rentBtn")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
