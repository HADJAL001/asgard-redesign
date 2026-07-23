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
}))
