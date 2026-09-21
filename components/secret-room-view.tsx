"use client"

/* ================================================================
   SecretRoomView — супер-тайная приватная комната
   ----------------------------------------------------------------
   Платный вход ($99 разово + $9/мес). Кастомизация: фон + мебель/
   картины. До 3 друзей бесплатно, далее +$49 за слот. Данные —
   /secret-room (GET/POST unlock/PATCH/members/friend-slots).
   ================================================================ */

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Armchair, BookOpen, CalendarDays, Check, Circle, Crown, Fish, Flower2, Frame, Gem, KeyRound, LampDesk, Loader2, Lock, Piano, Plus, Send, Server, Sparkles, Ticket, Trash2, Trophy, Upload, UserPlus, Vault, X, type LucideIcon } from "lucide-react"
import { Navbar } from "./navbar"
import { PremiumBackground } from "./premium-bg"
import { COLORS } from "@/lib/economy"
import { apiClient } from "@/lib/api-client"

const SecretRoomScene = dynamic(() => import("./secret-room-scene").then((module) => module.SecretRoomScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse" style={{ background: "radial-gradient(circle at 50% 46%, #5b468b, #0b0c16 70%)" }} />,
})

const GOLD = "#E6C868"

type RoomItem = { type: string; x: number; y: number }
type Room = { id: number; name: string; background: string; items: RoomItem[]; avatarGltf: string | null; friendSlots: number; accessUntil: number; active: boolean }
type Member = { userId: number; username: string; displayName?: string; addedAt: number }
type Pricing = { entryUsd: number; monthlyUsd: number; extraFriendUsd: number; freeFriendSlots: number; periodDays: number }
type RoomEvent = { id: number; title: string; description: string; startsAt: number; capacity: number; priceTimecoin: number; status: "active" | "cancelled"; attendeeCount: number; booked: boolean; isOwner: boolean }
type RoomActivity = { id: number; kind: string; detail: string; createdAt: number; username?: string; displayName?: string }
type AlphaAccess = { entitled: boolean; member: boolean; release: { version: string; notes: string; publishedAt: number } | null }

const BACKGROUNDS: Record<string, string> = {
  nebula: "radial-gradient(120% 120% at 30% 20%, #241a45, #0a0b1a 70%)",
  noir: "linear-gradient(160deg, #141416, #050506)",
  gold: "radial-gradient(120% 120% at 50% 0%, #2a2213, #0b0a06 70%)",
  matrix: "radial-gradient(120% 120% at 50% 30%, #04240f, #030806 70%)",
  sunset: "linear-gradient(160deg, #3a1830, #201033 60%, #0a0714)",
  aurora: "radial-gradient(120% 120% at 40% 10%, #063a3a, #04121a 70%)",
}
const BG_LIST = Object.keys(BACKGROUNDS)

const ITEMS: Record<string, LucideIcon> = {
  sofa: Armchair, lamp: LampDesk, plant: Flower2, painting: Frame, shelf: BookOpen, rug: Circle,
  throne: Crown, aquarium: Fish, piano: Piano, safe: Vault, trophy: Trophy, crystal: Gem, server: Server,
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
  const [events, setEvents] = useState<RoomEvent[]>([])
  const [activity, setActivity] = useState<RoomActivity[]>([])
  const [eventTitle, setEventTitle] = useState("")
  const [eventDescription, setEventDescription] = useState("")
  const [eventStart, setEventStart] = useState("")
  const [eventCapacity, setEventCapacity] = useState("10")
  const [eventPrice, setEventPrice] = useState("0")
  const [creatorMessage, setCreatorMessage] = useState("")
  const [creatorContacted, setCreatorContacted] = useState(false)
  const [alphaAccess, setAlphaAccess] = useState<AlphaAccess | null>(null)

  async function loadEvents() {
    const [eventsResponse, activityResponse] = await Promise.all([
      apiClient.get<{ events: RoomEvent[] }>("/secret-room/events", { skipAuthRedirect: true }),
      apiClient.get<{ activity: RoomActivity[] }>("/secret-room/activity", { skipAuthRedirect: true }),
    ])
    setEvents(eventsResponse.events || [])
    setActivity(activityResponse.activity || [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [r, alpha] = await Promise.all([
          apiClient.get<any>("/secret-room", { skipAuthRedirect: true }),
          apiClient.get<AlphaAccess>("/secret-room/alpha-access", { skipAuthRedirect: true }),
        ])
        if (cancelled) return
        setAlphaAccess(alpha)
        setHasAccess(!!r.hasAccess)
        setIsOwner(!!r.isOwner)
        setRoom(r.room || null)
        setMembers(r.members || [])
        if (r.pricing) setPricing(r.pricing)
        if (r.hasAccess) await loadEvents()
      } catch {
        if (!cancelled) setHasAccess(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function createEvent() {
    const startsAt = new Date(eventStart).getTime()
    if (!eventTitle.trim() || !Number.isFinite(startsAt)) { setMsg("Enter an event title and start time."); return }
    setBusy(true); setMsg(null)
    try {
      await apiClient.post("/secret-room/events", { title: eventTitle, description: eventDescription, startsAt, capacity: Number(eventCapacity), priceTimecoin: Number(eventPrice) })
      setEventTitle(""); setEventDescription(""); setEventStart(""); setEventCapacity("10"); setEventPrice("0")
      await loadEvents()
    } catch (e: any) { setMsg(e?.message || "Could not create event") } finally { setBusy(false) }
  }

  async function bookEvent(eventId: number) {
    setBusy(true); setMsg(null)
    try { await apiClient.post(`/secret-room/events/${eventId}/book`, {}); await loadEvents() }
    catch (e: any) { setMsg(e?.message || "Could not book event") } finally { setBusy(false) }
  }

  async function cancelEvent(eventId: number) {
    setBusy(true); setMsg(null)
    try { await apiClient.post(`/secret-room/events/${eventId}/cancel`, {}); await loadEvents() }
    catch (e: any) { setMsg(e?.message || "Could not cancel event") } finally { setBusy(false) }
  }

  async function unlock() {
    setBusy(true); setMsg(null)
    try {
      const r = await apiClient.post<{ url: string | null }>("/secret-room/create-checkout", { kind: "access" })
      if (!r.url) throw new Error("Не удалось открыть защищённую оплату")
      window.location.assign(r.url)
    } catch (e: any) { setMsg(e?.message || "Не удалось открыть доступ") } finally { setBusy(false) }
  }

  async function patch(next: Partial<Pick<Room, "name" | "background" | "items" | "avatarGltf">>) {
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
  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".gltf") || file.size > 512 * 1024) {
      setMsg("Upload a self-contained .gltf avatar up to 512 KB.")
      return
    }
    setBusy(true); setMsg(null)
    try { await patch({ avatarGltf: await file.text() }) }
    catch (error: any) { setMsg(error?.message || "Could not upload the avatar") }
    finally { setBusy(false) }
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
    try {
      const r = await apiClient.post<{ url: string | null }>("/secret-room/create-checkout", { kind: "friend_slot" })
      if (!r.url) throw new Error("Не удалось открыть защищённую оплату")
      window.location.assign(r.url)
    }
    catch (e: any) { setMsg(e?.message || "Не удалось купить слот") } finally { setBusy(false) }
  }
  async function removeFriend(userId: number) {
    try { const r = await apiClient.delete<any>(`/secret-room/members/${userId}`); setMembers(r.members) }
    catch (e: any) { setMsg(e?.message || "Не удалось убрать друга") }
  }
  async function messageCreators() {
    if (!creatorMessage.trim()) return
    setBusy(true); setMsg(null); setCreatorContacted(false)
    try {
      await apiClient.post("/secret-room/creator-line", { text: creatorMessage.trim() })
      setCreatorMessage("")
      setCreatorContacted(true)
    } catch (e: any) { setMsg(e?.message || "Could not send a message to the creators") } finally { setBusy(false) }
  }

  return (
    <div className="world-bunker relative min-h-screen overflow-hidden font-sans" style={{ color: COLORS.text }}>
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

              <section className="mt-5 flex items-center justify-between gap-4 rounded-xl px-4 py-3" style={{ background: alphaAccess?.entitled ? `${GOLD}12` : "rgba(255,255,255,0.035)", border: `1px solid ${alphaAccess?.entitled ? `${GOLD}55` : "rgba(255,255,255,0.1)"}` }}>
                <div className="flex min-w-0 items-center gap-3">
                  <Sparkles size={16} style={{ color: alphaAccess?.entitled ? GOLD : "rgba(255,255,255,0.45)" }} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: alphaAccess?.entitled ? GOLD : "rgba(255,255,255,0.5)" }}>Alpha preview</p>
                    <p className="truncate text-[13px] text-white/70">{alphaAccess?.release ? alphaAccess.release.version : "Релиз ещё не опубликован"}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px]" style={{ color: alphaAccess?.entitled ? GOLD : "rgba(255,255,255,0.4)" }}>{alphaAccess?.entitled ? "Доступ открыт" : "Ожидание релиза"}</span>
              </section>

              <div
                className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl"
                style={{ background: BACKGROUNDS[room.background] || BACKGROUNDS.nebula, border: `1px solid ${GOLD}33`, boxShadow: "inset 0 0 60px rgba(0,0,0,0.5)" }}
              >
                <SecretRoomScene items={room.items} avatarGltf={room.avatarGltf} background={room.background} isOwner={isOwner} onRemove={removeItem} />
                {room.items.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {isOwner ? "Добавьте мебель и картины из палитры справа →" : "Хозяин ещё обставляет комнату"}
                  </div>
                )}
              </div>

              <section className="mt-6 border-t pt-5" style={{ borderColor: `${GOLD}33` }}>
                <div className="flex items-center gap-2"><CalendarDays size={16} style={{ color: GOLD }} /><h2 className="text-[16px] font-semibold">Room events</h2></div>
                <div className="mt-3 space-y-2">
                  {events.filter((event) => event.status === "active").map((event) => (
                    <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <div><p className="text-[13px] font-semibold">{event.title}</p>{event.description && <p className="mt-0.5 text-[12px] text-white/50">{event.description}</p>}<p className="mt-1 text-[11px] text-white/40">{new Date(event.startsAt).toLocaleString("ru-RU")} · {event.attendeeCount}/{event.capacity}</p></div>
                      {event.isOwner ? <button type="button" onClick={() => cancelEvent(event.id)} disabled={busy || event.attendeeCount > 0} className="text-[12px] text-white/45 disabled:opacity-30">Cancel</button> : event.booked ? <span className="text-[12px]" style={{ color: GOLD }}>Booked</span> : <button type="button" onClick={() => bookEvent(event.id)} disabled={busy || event.attendeeCount >= event.capacity} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium disabled:opacity-40" style={{ border: `1px solid ${GOLD}66`, color: GOLD }}><Ticket size={13} />{event.priceTimecoin} TimeCoin</button>}
                    </div>
                  ))}
                  {events.filter((event) => event.status === "active").length === 0 && <p className="text-[12px] text-white/40">No upcoming events yet.</p>}
                </div>
                {isOwner && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Event title" className="rounded-lg px-3 py-2 text-[13px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                  <input type="datetime-local" value={eventStart} onChange={(event) => setEventStart(event.target.value)} className="rounded-lg px-3 py-2 text-[13px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                  <input value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} placeholder="Description" className="rounded-lg px-3 py-2 text-[13px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                  <div className="flex gap-2"><input type="number" min="1" value={eventCapacity} onChange={(event) => setEventCapacity(event.target.value)} aria-label="Capacity" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} /><input type="number" min="0" step="0.01" value={eventPrice} onChange={(event) => setEventPrice(event.target.value)} aria-label="TimeCoin price" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} /></div>
                  <button type="button" onClick={createEvent} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-50" style={{ background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}55` }}>Create event</button>
                </div>}
              </section>

              <section className="mt-6 border-t pt-5" style={{ borderColor: `${GOLD}33` }}>
                <h2 className="text-[16px] font-semibold">Room activity</h2>
                {activity.length ? <ol className="mt-3 space-y-2">
                  {activity.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-3 text-[12px] text-white/55">
                    <span><strong className="font-medium text-white/80">{entry.displayName || entry.username || "A member"}</strong> {entry.kind === "member_invited" ? `invited ${entry.detail}` : entry.kind === "member_removed" ? `removed ${entry.detail}` : entry.kind === "event_created" ? `created “${entry.detail}”` : entry.kind === "event_booked" ? `booked “${entry.detail}”` : entry.kind === "event_cancelled" ? `cancelled “${entry.detail}”` : entry.kind === "room_customized" ? "customized the headquarters" : "activated the headquarters"}</span>
                    <time className="shrink-0 text-white/35">{new Date(entry.createdAt).toLocaleDateString("ru-RU")}</time>
                  </li>)}
                </ol> : <p className="mt-3 text-[12px] text-white/40">The room is ready for its first activity.</p>}
              </section>

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
                    {ITEM_LIST.map((it) => {
                      const ItemIcon = ITEMS[it]
                      return <button key={it} type="button" onClick={() => addItem(it)}
                        className="flex size-10 items-center justify-center rounded-lg transition-transform hover:scale-110"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: GOLD }}
                        title={it} aria-label={`Добавить: ${it}`}>
                        <ItemIcon size={18} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    })}
                  </div>
                  <div className="mt-5 flex items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium" style={{ border: `1px solid ${GOLD}55`, color: GOLD }}>
                      <Upload size={14} /> Upload avatar
                      <input type="file" accept="model/gltf+json,.gltf" className="sr-only" onChange={uploadAvatar} disabled={busy} />
                    </label>
                    {room.avatarGltf && <button type="button" onClick={() => patch({ avatarGltf: null })} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] text-white/55 disabled:opacity-45" style={{ border: "1px solid rgba(255,255,255,0.12)" }}><X size={14} /> Remove avatar</button>}
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
              <div className="mt-4 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                <p className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: GOLD }}><Sparkles size={13} /> Direct line to the creators</p>
                <textarea value={creatorMessage} onChange={(event) => setCreatorMessage(event.target.value)} maxLength={2000} rows={3} placeholder="Ask the team anything..." className="mt-2 w-full resize-none rounded-lg px-3 py-2 text-[12px] outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <button type="button" onClick={messageCreators} disabled={busy || !creatorMessage.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium disabled:opacity-45" style={{ border: `1px solid ${GOLD}55`, color: GOLD }}><Send size={13} /> Send to creators</button>
                {creatorContacted && <Link href="/messages" className="mt-2 block text-center text-[11px]" style={{ color: "rgba(255,255,255,0.62)" }}>Sent. Open the private conversation.</Link>}
              </div>
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
