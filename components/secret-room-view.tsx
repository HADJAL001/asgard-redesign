"use client"

/* ================================================================
   SecretRoomView — супер-тайная приватная комната
   ----------------------------------------------------------------
   Платный вход ($99 разово + $9/мес). Кастомизация: фон + мебель/
   картины. До 3 друзей бесплатно, далее +$49 за слот. Данные —
   /secret-room (GET/POST unlock/PATCH/members/friend-slots).
   ================================================================ */

import { useEffect, useState } from "react"
import { Lock, Loader2, Plus, Trash2, UserPlus, X, Sparkles, KeyRound, Check } from "lucide-react"
import { Navbar } from "./navbar"
import { PremiumBackground } from "./premium-bg"
import { COLORS } from "@/lib/economy"
import { apiClient } from "@/lib/api-client"

const GOLD = "#E6C868"

type RoomItem = { type: string; x: number; y: number }
type Room = { id: number; name: string; background: string; items: RoomItem[]; friendSlots: number; accessUntil: number; active: boolean }
type Member = { userId: number; username: string; displayName?: string; addedAt: number }
type Pricing = { entryUsd: number; monthlyUsd: number; extraFriendUsd: number; freeFriendSlots: number; periodDays: number }

const BACKGROUNDS: Record<string, string> = {
  nebula: "radial-gradient(120% 120% at 30% 20%, #241a45, #0a0b1a 70%)",
  noir: "linear-gradient(160deg, #141416, #050506)",
  gold: "radial-gradient(120% 120% at 50% 0%, #2a2213, #0b0a06 70%)",
  matrix: "radial-gradient(120% 120% at 50% 30%, #04240f, #030806 70%)",
  sunset: "linear-gradient(160deg, #3a1830, #201033 60%, #0a0714)",
  aurora: "radial-gradient(120% 120% at 40% 10%, #063a3a, #04121a 70%)",
}
const BG_LIST = Object.keys(BACKGROUNDS)

const ITEMS: Record<string, string> = {
  sofa: "🛋️", lamp: "💡", plant: "🪴", painting: "🖼️", shelf: "📚", rug: "🟫",
  throne: "🪑", aquarium: "🐠", piano: "🎹", safe: "🔐", trophy: "🏆", crystal: "💎",
}
const ITEM_LIST = Object.keys(ITEMS)

export function SecretRoomView() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [pricing, setPricing] = useState<Pricing>({ entryUsd: 99, monthlyUsd: 9, extraFriendUsd: 49, freeFriendSlots: 3, periodDays: 30 })
  const [friendName, setFriendName] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await apiClient.get<any>("/secret-room", { skipAuthRedirect: true })
        if (cancelled) return
        setHasAccess(!!r.hasAccess)
        setIsOwner(!!r.isOwner)
        setRoom(r.room || null)
        setMembers(r.members || [])
        if (r.pricing) setPricing(r.pricing)
      } catch {
        if (!cancelled) setHasAccess(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function unlock() {
    setBusy(true); setMsg(null)
    try {
      const r = await apiClient.post<any>("/secret-room/unlock")
      setRoom(r.room); setMembers(r.members || []); setHasAccess(true); setIsOwner(true)
      setMsg("Доступ открыт. Добро пожаловать в тайную комнату.")
    } catch (e: any) { setMsg(e?.message || "Не удалось открыть доступ") } finally { setBusy(false) }
  }

  async function patch(next: Partial<Pick<Room, "name" | "background" | "items">>) {
    if (!room || !isOwner) return
    const optimistic = { ...room, ...next }
    setRoom(optimistic)
    try {
      const r = await apiClient.patch<any>("/secret-room", next)
      setRoom(r.room)
    } catch (e: any) { setMsg(e?.message || "Не удалось сохранить") }
  }

  function addItem(type: string) {
    if (!room) return
    const n = room.items.length
    const item: RoomItem = { type, x: 15 + ((n * 17) % 70), y: 20 + ((n * 23) % 60) }
    patch({ items: [...room.items, item] })
  }
  function removeItem(idx: number) {
    if (!room) return
    patch({ items: room.items.filter((_, i) => i !== idx) })
  }

  async function addFriend() {
    if (!friendName.trim()) return
    setBusy(true); setMsg(null)
    try {
      const r = await apiClient.post<any>("/secret-room/members", { username: friendName.trim() })
      setMembers(r.members); setFriendName("")
    } catch (e: any) {
      if (e?.data?.code === "NEED_SLOT") setMsg(`Свободных слотов нет — купите слот за $${pricing.extraFriendUsd}.`)
      else setMsg(e?.message || "Не удалось добавить друга")
    } finally { setBusy(false) }
  }
  async function buySlot() {
    setBusy(true); setMsg(null)
    try { const r = await apiClient.post<any>("/secret-room/friend-slots/buy"); setRoom(r.room); setMsg("Слот добавлен.") }
    catch (e: any) { setMsg(e?.message || "Не удалось купить слот") } finally { setBusy(false) }
  }
  async function removeFriend(userId: number) {
    try { const r = await apiClient.delete<any>(`/secret-room/members/${userId}`); setMembers(r.members) }
    catch (e: any) { setMsg(e?.message || "Не удалось убрать друга") }
  }

  return (
    <div className="relative min-h-screen overflow-hidden font-sans" style={{ background: "linear-gradient(180deg, #05060d, #0b0a06)", color: COLORS.text }}>
      <PremiumBackground variant="gold" />
      <Navbar />
      <main className="relative z-10 mx-auto max-w-[1100px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl" style={{ border: `1px solid ${GOLD}66`, boxShadow: `0 0 18px ${GOLD}33` }}>
            <Lock size={20} style={{ color: GOLD }} />
          </span>
          <div>
            <h1 className="text-[30px] font-bold leading-tight">Тайная комната</h1>
            <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.45)" }}>Приватное пространство только для своих</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-20 flex justify-center"><Loader2 className="animate-spin" style={{ color: GOLD }} /></div>
        ) : !hasAccess ? (
          /* ---- Пейвол ---- */
          <div className="mx-auto mt-10 max-w-[560px] rounded-2xl p-8 text-center" style={{ background: "rgba(15,18,30,0.6)", backdropFilter: "blur(14px)", border: `1px solid ${GOLD}44`, boxShadow: `0 20px 60px rgba(0,0,0,0.5)` }}>
            <KeyRound size={34} style={{ color: GOLD }} className="mx-auto" />
            <h2 className="mt-4 text-[22px] font-bold">Вход по приглашению судьбы</h2>
            <p className="mx-auto mt-2 max-w-[420px] text-[14px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              Супер-защищённая приватная комната: свой фон, мебель, картины — как дом, только тайный. Приглашай до {pricing.freeFriendSlots} друзей бесплатно.
            </p>
            <div className="mt-6 flex items-end justify-center gap-2">
              <span className="text-[40px] font-bold" style={{ color: GOLD }}>${pricing.entryUsd}</span>
              <span className="mb-2 text-[14px]" style={{ color: "rgba(255,255,255,0.5)" }}>разово + ${pricing.monthlyUsd}/мес</span>
            </div>
            <button
              type="button"
              onClick={unlock}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-semibold transition-transform hover:scale-[1.03] disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #C69B2E)`, color: "#1a1405" }}
            >
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Lock size={17} />} Открыть доступ
            </button>
            {msg && <p className="mt-4 text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>{msg}</p>}
          </div>
        ) : room ? (
          /* ---- Комната ---- */
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            {/* Канвас */}
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {isOwner && (
                  <input
                    value={room.name}
                    onChange={(e) => setRoom({ ...room, name: e.target.value })}
                    onBlur={() => patch({ name: room.name })}
                    className="rounded-lg px-3 py-1.5 text-[14px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                  />
                )}
                {!isOwner && <span className="text-[14px] font-semibold">{room.name}</span>}
                <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  активна до {new Date(room.accessUntil).toLocaleDateString("ru-RU")}
                </span>
              </div>

              <div
                className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl"
                style={{ background: BACKGROUNDS[room.background] || BACKGROUNDS.nebula, border: `1px solid ${GOLD}33`, boxShadow: "inset 0 0 60px rgba(0,0,0,0.5)" }}
              >
                {room.items.map((it, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => isOwner && removeItem(i)}
                    title={isOwner ? "Убрать" : undefined}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-[34px] leading-none transition-transform hover:scale-110"
                    style={{ left: `${it.x}%`, top: `${it.y}%`, cursor: isOwner ? "pointer" : "default", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}
                  >
                    {ITEMS[it.type] || "❔"}
                  </button>
                ))}
                {room.items.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {isOwner ? "Добавьте мебель и картины из палитры справа →" : "Хозяин ещё обставляет комнату"}
                  </div>
                )}
              </div>

              {isOwner && (
                <>
                  <p className="mt-5 mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>Фон</p>
                  <div className="flex flex-wrap gap-2">
                    {BG_LIST.map((bg) => (
                      <button key={bg} type="button" onClick={() => patch({ background: bg })}
                        className="size-9 rounded-lg transition-transform hover:scale-110"
                        style={{ background: BACKGROUNDS[bg], border: `2px solid ${room.background === bg ? GOLD : "transparent"}` }}
                        aria-label={bg} />
                    ))}
                  </div>

                  <p className="mt-5 mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>Добавить предмет</p>
                  <div className="flex flex-wrap gap-2">
                    {ITEM_LIST.map((it) => (
                      <button key={it} type="button" onClick={() => addItem(it)}
                        className="flex size-10 items-center justify-center rounded-lg text-[20px] transition-transform hover:scale-110"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                        title={it}>
                        {ITEMS[it]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Друзья */}
            <aside className="rounded-2xl p-5" style={{ background: "rgba(15,18,30,0.6)", backdropFilter: "blur(14px)", border: `1px solid ${GOLD}33` }}>
              <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles size={16} style={{ color: GOLD }} /> Свои люди</h3>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                {members.length} / {room.friendSlots} · {pricing.freeFriendSlots} бесплатно, далее ${pricing.extraFriendUsd}/слот
              </p>

              <ul className="mt-4 space-y-2">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span className="text-[13px]">{m.displayName || m.username}</span>
                    {isOwner && (
                      <button type="button" onClick={() => removeFriend(m.userId)} className="text-white/40 hover:text-red-400" aria-label="Убрать"><Trash2 size={14} /></button>
                    )}
                  </li>
                ))}
                {members.length === 0 && <li className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>Пока никого. Позовите своих.</li>}
              </ul>

              {isOwner && (
                <div className="mt-4">
                  <div className="flex gap-2">
                    <input
                      value={friendName}
                      onChange={(e) => setFriendName(e.target.value)}
                      placeholder="username друга"
                      className="flex-1 rounded-lg px-3 py-2 text-[13px]"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                    />
                    <button type="button" onClick={addFriend} disabled={busy} className="rounded-lg px-3" style={{ background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}55` }} aria-label="Добавить">
                      <UserPlus size={16} />
                    </button>
                  </div>
                  {members.length >= room.friendSlots && (
                    <button type="button" onClick={buySlot} disabled={busy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-medium" style={{ border: `1px solid ${GOLD}55`, color: GOLD }}>
                      <Plus size={14} /> Купить слот за ${pricing.extraFriendUsd}
                    </button>
                  )}
                </div>
              )}

              {msg && <p className="mt-3 text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>{msg}</p>}
              <button type="button" onClick={unlock} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px]" style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>
                <Check size={13} /> Продлить на {pricing.periodDays} дн. (${pricing.monthlyUsd})
              </button>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  )
}
