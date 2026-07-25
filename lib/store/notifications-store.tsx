"use client"

/* ================================================================
   OSGARD · Notifications store (Zustand)
   ----------------------------------------------------------------
   Источник данных — бэкенд (notifications.routes.ts):
     GET  /notifications              → список уведомлений
     GET  /notifications/unread-count → счётчик непрочитанных (для бейджа в навбаре)
     POST /notifications/:id/read     → отметить одно как прочитанное
     POST /notifications/read-all     → отметить все как прочитанные
   ================================================================ */

import { useEffect } from "react"
import { create } from "zustand"
import { apiClient, ApiError } from "@/lib/api-client"

export type NotificationActor = {
  id: number
  username: string
  displayName: string
  avatarUrl: string | null
}

export type AppNotification = {
  id: number
  type: "like" | "comment" | string
  entityType: string | null
  entityId: number | null
  text: string
  read: boolean
  createdAt: string
  actor: NotificationActor | null
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

type NotificationsStoreState = {
  notifications: AppNotification[]
  unreadCount: number
  loading: boolean
  error: string | null

  fetchNotifications: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  fetchUnreadCount: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  /** Применяет пришедшее по SSE уведомление: добавляет в список (с дедупом по id) и обновляет счётчик. */
  applyIncoming: (n: AppNotification, unreadCount: number) => void
  /** Синхронизирует счётчик непрочитанных из снапшота SSE. */
  setUnreadCount: (unreadCount: number) => void
}

export const useNotificationsStore = create<NotificationsStoreState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  fetchNotifications: async (opts) => {
    set({ loading: true })
    try {
      const { notifications } = await apiClient.get<{ notifications: AppNotification[] }>("/notifications", opts)
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
        loading: false,
        error: null,
      })
    } catch (err) {
      set({ loading: false, error: extractErrorMessage(err, "Не удалось загрузить уведомления") })
    }
  },

  fetchUnreadCount: async (opts) => {
    try {
      const { unreadCount } = await apiClient.get<{ unreadCount: number }>("/notifications/unread-count", opts)
      set({ unreadCount })
    } catch {
      /* тихо игнорируем — счётчик в навбаре не критичен */
    }
  },

  markRead: async (id) => {
    const prev = get().notifications
    set({
      notifications: prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, get().unreadCount - (prev.find((n) => n.id === id && !n.read) ? 1 : 0)),
    })
    try {
      await apiClient.post(`/notifications/${id}/read`)
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось отметить уведомление прочитанным") })
    }
  },

  markAllRead: async () => {
    set({
      notifications: get().notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })
    try {
      await apiClient.post("/notifications/read-all")
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось отметить уведомления прочитанными") })
    }
  },

  applyIncoming: (n, unreadCount) =>
    set((s) => ({
      notifications: s.notifications.some((x) => x.id === n.id) ? s.notifications : [n, ...s.notifications],
      unreadCount,
    })),

  setUnreadCount: (unreadCount) => set({ unreadCount }),
}))

/* ================================================================
   useNotificationStream — SSE-подписка на GET /api/notifications/stream.
   ----------------------------------------------------------------
   Держит одно EventSource-соединение, пока enabled=true (авторизован),
   и обновляет стор в реальном времени. Реконнект с линейным бэкоффом,
   как в tc-market-panel.tsx. Опрос unread-count в навбаре остаётся
   резервным каналом, если SSE недоступен (прокси/прокладка).
   ================================================================ */
export function useNotificationStream(enabled: boolean) {
  const applyIncoming = useNotificationsStore((s) => s.applyIncoming)
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount)

  useEffect(() => {
    if (!enabled) return

    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let closed = false

    const connect = () => {
      source = new EventSource("/api/notifications/stream", { withCredentials: true })

      source.onopen = () => {
        attempts = 0
      }

      source.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as {
            type?: string
            notification?: AppNotification
            unreadCount?: number
          }
          if (msg.type === "snapshot") {
            setUnreadCount(msg.unreadCount ?? 0)
          } else if (msg.type === "notification" && msg.notification) {
            applyIncoming(msg.notification, msg.unreadCount ?? 0)
          }
        } catch {
          /* игнорируем некорректный кадр */
        }
      }

      source.onerror = () => {
        source?.close()
        source = null
        if (closed) return
        attempts += 1
        const delay = Math.min(30_000, 1000 * attempts)
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      source?.close()
      source = null
    }
  }, [enabled, applyIncoming, setUnreadCount])
}
