"use client"

/* ================================================================
   Страница /jarvis/shop — Магазин аксессуаров ВАЛЛИА
   ----------------------------------------------------------------
   GET  /jarvis/shop  → список аксессуаров (skin/voice/accessory) + owned/equipped
   POST /jarvis/buy   → { accessoryId } — купить (списывает ∞)
   POST /jarvis/equip → { accessoryId } — надеть купленный аксессуар
   ================================================================ */

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"

const JarvisAvatar = dynamic(() => import("@/components/JarvisAvatar"), {
  loading: () => <div style={{ height: 200 }} />,
  ssr: false,
})

import { Sparkles, Mic, Wand2, Check, Loader2 } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { apiClient } from "@/lib/api-client"
import { useRequireAuth } from "@/lib/auth-store"
import {
  type JarvisEquipment,
  EMPTY_EQUIPMENT,
  buildEquipmentFromItems,
  setEquipmentAndBroadcast,
  loadEquipmentFromCache,
} from "@/lib/jarvis-equipment"


type AccessoryType = "skin" | "voice" | "accessory"

type ShopItem = {
  id: number
  name: string
  description: string
  price: number
  image: string
  type: AccessoryType
  owned: 0 | 1
  equipped: 0 | 1
}

const TYPE_META: Record<AccessoryType, { label: string; Icon: typeof Sparkles }> = {
  skin: { label: "Скины", Icon: Sparkles },
  voice: { label: "Голоса", Icon: Mic },
  accessory: { label: "Аксессуары", Icon: Wand2 },
}

const TYPE_ORDER: AccessoryType[] = ["skin", "voice", "accessory"]

function fmtTC(n: number): string {
  return `∞ ${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`
}

export default function JarvisShopPage() {
  useRequireAuth()

  const [items, setItems] = useState<ShopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState<AccessoryType | "all">("all")
  /* Текущая экипировка ВАЛЛИА — для мгновенного превью 3D-аватара прямо в магазине. */
  const [equipment, setEquipment] = useState<JarvisEquipment>(EMPTY_EQUIPMENT)

  async function loadShop() {
    setLoading(true)
    try {
      const data = await apiClient.get<{ items: ShopItem[] }>("/jarvis/shop", { skipAuthRedirect: true })
      setItems(data.items)
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || "Не удалось загрузить магазин" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setEquipment(loadEquipmentFromCache())
    loadShop()
  }, [])


  async function handleBuy(item: ShopItem) {
    setBusyId(item.id)
    setNotice(null)
    try {
      await apiClient.post("/jarvis/buy", { accessoryId: item.id })
      setNotice({ ok: true, text: `Куплено: ${item.name}` })

      /* Сразу после покупки автоматически надеваем аксессуар (первый в своём слоте
         пользователь обычно и хочет применить немедленно), чтобы 3D-аватар
         преобразился без дополнительного клика "Надеть". */
      try {
        await apiClient.post("/jarvis/equip", { accessoryId: item.id })
        const optimisticItems = items.map((i) => {
          if (i.id === item.id) return { ...i, owned: 1 as const, equipped: 1 as const }
          if (i.type === item.type) return { ...i, equipped: 0 as const }
          return i
        })
        setItems(optimisticItems)
        const nextEquipment = buildEquipmentFromItems(optimisticItems)
        setEquipment(nextEquipment)
        setEquipmentAndBroadcast(nextEquipment)
      } catch {
        /* если автонадевание не удалось — не критично, просто обновим список ниже */
      }

      await loadShop()
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || "Не удалось купить аксессуар" })
    } finally {
      setBusyId(null)
    }
  }


  async function handleEquip(item: ShopItem) {
    setBusyId(item.id)
    setNotice(null)
    try {
      await apiClient.post("/jarvis/equip", { accessoryId: item.id })
      setNotice({ ok: true, text: `Надето: ${item.name}` })

      /* ----------------------------------------------------------------
         Мгновенное применение к 3D-аватару:
         1. Обновляем локальный список item'ов (owned/equipped), чтобы
            сразу пересчитать объект экипировки без ожидания повторного
            GET /jarvis/shop.
         2. Сохраняем экипировку в localStorage и рассылаем событие
            "jarvis-equipment-changed" — JarvisChat (и любой другой открытый
            компонент с аватаром) перерисуется без перезагрузки страницы.
         3. Затем всё равно перезагружаем список магазина, чтобы отразить
            актуальные owned/equipped флаги на карточках.
         ---------------------------------------------------------------- */
      const optimisticItems = items.map((i) => {
        if (i.type !== item.type) return i
        return { ...i, equipped: (i.id === item.id ? 1 : 0) as 0 | 1 }
      })
      setItems(optimisticItems)
      const nextEquipment = buildEquipmentFromItems(optimisticItems)
      setEquipment(nextEquipment)
      setEquipmentAndBroadcast(nextEquipment)

      await loadShop()
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || "Не удалось надеть аксессуар" })
    } finally {
      setBusyId(null)
    }
  }


  const visibleItems = filter === "all" ? items : items.filter((i) => i.type === filter)

  return (
    <div style={{ backgroundColor: "#0A0A0F", minHeight: "100vh", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Магазин ВАЛЛИА</h1>
          <p className="mt-1 text-sm" style={{ color: "#6A6A8A" }}>
            Скины, голоса и аксессуары для вашего ИИ-ассистента. Оплата в ∞ (TimeCoin).
          </p>
        </header>

        {/* ---- Живое превью 3D-аватара: сразу отражает надетые аксессуары ---- */}
        <div
          className="mb-8 flex flex-col items-center rounded-xl py-4"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        >
          <JarvisAvatar equipment={equipment} height={200} />
          <span className="mt-1 text-xs" style={{ color: "#6A6A8A" }}>
            Предпросмотр ВАЛЛИА — обновляется мгновенно при покупке/надевании
          </span>
        </div>


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

        {/* ---- Фильтр по типу ---- */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: filter === "all" ? "#00D4FF" : "transparent",
              color: filter === "all" ? "#0A0A0F" : "#6A6A8A",
              border: "1px solid #2A2A3E",
            }}
          >
            Все
          </button>
          {TYPE_ORDER.map((t) => {
            const meta = TYPE_META[t]
            const Icon = meta.Icon
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: filter === t ? "#00D4FF" : "transparent",
                  color: filter === t ? "#0A0A0F" : "#6A6A8A",
                  border: "1px solid #2A2A3E",
                }}
              >
                <Icon size={14} strokeWidth={1.75} />
                {meta.label}
              </button>
            )
          })}
        </div>

        {/* ---- Сетка карточек ---- */}
        {loading ? (
          <div className="flex items-center justify-center py-20" style={{ color: "#6A6A8A" }}>
            <Loader2 className="mr-2 animate-spin" size={18} />
            Загрузка…
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="py-20 text-center text-sm" style={{ color: "#6A6A8A" }}>
            Ничего не найдено
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => {
              const Icon = TYPE_META[item.type].Icon
              const isBusy = busyId === item.id
              return (
                <div
                  key={item.id}
                  className="flex flex-col rounded-xl p-4"
                  style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
                >
                  <div
                    className="mb-3 flex h-32 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full rounded-lg object-cover"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = "none"
                        }}
                      />
                    ) : (
                      <Icon size={36} strokeWidth={1.25} style={{ color: "#00D4FF" }} />
                    )}
                  </div>

                  <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: "#6A6A8A" }}>
                    <Icon size={12} strokeWidth={1.75} />
                    {TYPE_META[item.type].label.replace(/ы$/, "")}
                  </div>

                  <h3 className="mb-1 font-medium">{item.name}</h3>
                  <p className="mb-3 flex-1 text-sm" style={{ color: "#6A6A8A" }}>
                    {item.description}
                  </p>

                  <div className="mb-3 text-lg font-semibold" style={{ color: "#00D4FF" }}>
                    {fmtTC(item.price)}
                  </div>

                  {item.owned ? (
                    item.equipped ? (
                      <button
                        disabled
                        className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium"
                        style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ADE80", border: "1px solid #4ADE80" }}
                      >
                        <Check size={14} /> Надето
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEquip(item)}
                        disabled={isBusy}
                        className="rounded-lg py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                        style={{ backgroundColor: "transparent", color: "#00D4FF", border: "1px solid #00D4FF" }}
                      >
                        {isBusy ? "Надеваем…" : "Надеть"}
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handleBuy(item)}
                      disabled={isBusy}
                      className="rounded-lg py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
                    >
                      {isBusy ? "Покупаем…" : `Купить за ${fmtTC(item.price)}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
