"use client"

/* ================================================================
   OSGARD · Activity feed store (Zustand)
   ----------------------------------------------------------------
   Источник данных — бэкенд (feed.routes.ts):
     GET /feed?before=<id>&limit=20 → публичная глобальная лента событий
   В отличие от notifications-store, лента не имеет получателя и
   доступна без авторизации (skipAuthRedirect всегда true).
   ================================================================ */

import { create } from "zustand"
import { apiClient, ApiError } from "@/lib/api-client"

export type ActivityActor = {
  id: number
  username: string
  displayName: string
  avatarUrl: string | null
}

export type ActivityEvent = {
  id: number
  type: "artifact_crafted" | "artifact_sold" | "hof_entry" | string
  entityType: string | null
  entityId: number | null
  text: string
  metadata: Record<string, unknown> | null
  createdAt: string
  actor: ActivityActor
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

type ActivityStoreState = {
  events: ActivityEvent[]
  nextCursor: number | null
  loading: boolean
  loadingMore: boolean
  error: string | null

  fetchFeed: () => Promise<void>
  loadMore: () => Promise<void>
  /** Фоновый поллинг «живого тикера»: тихо префиксит только по-настоящему новые
      события (id, которых ещё нет) к голове ленты. Ошибки глушим — фон не должен
      мигать баннером. Возвращает id новых событий (для анимации влёта). */
  refresh: () => Promise<number[]>
}

export const useActivityStore = create<ActivityStoreState>((set, get) => ({
  events: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: null,

  fetchFeed: async () => {
    set({ loading: true })
    try {
      const { events, nextCursor } = await apiClient.get<{ events: ActivityEvent[]; nextCursor: number | null }>(
        "/feed",
        { skipAuthRedirect: true },
      )
      set({ events, nextCursor, loading: false, error: null })
    } catch (err) {
      set({ loading: false, error: extractErrorMessage(err, "Не удалось загрузить ленту активности") })
    }
  },

  loadMore: async () => {
    const { nextCursor, loadingMore, events } = get()
    if (!nextCursor || loadingMore) return
    set({ loadingMore: true })
    try {
      const res = await apiClient.get<{ events: ActivityEvent[]; nextCursor: number | null }>(
        `/feed?before=${nextCursor}`,
        { skipAuthRedirect: true },
      )
      set({ events: [...events, ...res.events], nextCursor: res.nextCursor, loadingMore: false })
    } catch (err) {
      set({ loadingMore: false, error: extractErrorMessage(err, "Не удалось загрузить ленту активности") })
    }
  },

  refresh: async () => {
    const { events, loading } = get()
    // Не мешаем первичной загрузке и не трогаем состояние, если лента ещё пуста
    // (первый показ идёт через fetchFeed, чтобы отработали loading/empty-состояния).
    if (loading || events.length === 0) return []
    try {
      const res = await apiClient.get<{ events: ActivityEvent[]; nextCursor: number | null }>("/feed", {
        skipAuthRedirect: true,
      })
      const known = new Set(events.map((e) => e.id))
      const fresh = res.events.filter((e) => !known.has(e.id))
      if (fresh.length === 0) return []
      set({ events: [...fresh, ...events] })
      return fresh.map((e) => e.id)
    } catch {
      return [] // тихо — фоновый поллинг
    }
  },
}))
