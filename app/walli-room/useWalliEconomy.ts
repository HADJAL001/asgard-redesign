'use client'

import { useState, useCallback, useRef } from 'react'

// ─── Типы ─────────────────────────────────────────────────────────────────────
export interface WalliStats {
  id: number
  user_id: number
  level: number
  skill: number
  trash_collected: number
  artifacts_found: number
  rare_found: number
  earned: number
  xp: number
  updated_at: number
}

export interface WalliAbilityEconomy {
  ability_type: 'find_artifacts' | 'trade' | 'analyze'
  current_level: number
  bonus: number
  next_level: number
  upgrade_price_usd: number
}

export interface WalliEconomy {
  stats: WalliStats
  abilities: WalliAbilityEconomy[]
  training: {
    training_level: number
    start_date: number
    end_date: number
    active: number
  } | null
  pricing: {
    ability_levels: Record<string, number>
    training_levels: Record<string, number>
    shop_items: {
      item_key: string
      item_type: string
      name: string
      price_usd: number | null
      price_tc: number | null
    }[]
  }
  xp_progress: {
    current_xp: number
    xp_in_level: number
    xp_to_next: number
    level: number
  }
}

// ─── Конфигурация API ─────────────────────────────────────────────────────────
// Ходим через тот же Next.js proxy (/api/*), что и lib/api-client.ts — сессия
// передаётся httpOnly cookie (credentials: "include"), никакого ручного
// Authorization-заголовка тут больше не нужно.
const API_BASE =
  typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '/api') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003')

// ─── Хук ─────────────────────────────────────────────────────────────────────
export function useWalliEconomy() {
  const [economy, setEconomy] = useState<WalliEconomy | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Накопитель несинхронизированных изменений (оффлайн-буфер)
  const pendingRef = useRef({
    trash_collected: 0,
    artifacts_found: 0,
    rare_found: 0,
    earned: 0,
    xp: 0,
  })

  // ── Загрузить полную экономику ────────────────────────────────────────────
  const loadEconomy = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/walli/economy`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: WalliEconomy = await res.json()
      setEconomy(data)
      return data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Обновить статистику (батч: накапливаем и флашим) ─────────────────────
  const recordTrash = useCallback((earned_tc = 0.5) => {
    pendingRef.current.trash_collected += 1
    pendingRef.current.earned          += earned_tc
    pendingRef.current.xp              += 10 // 10 XP за единицу мусора

    // Оптимистичное обновление локального стейта
    setEconomy(prev => {
      if (!prev) return prev
      const newStats = {
        ...prev.stats,
        trash_collected: prev.stats.trash_collected + 1,
        earned: Math.round((prev.stats.earned + earned_tc) * 100) / 100,
        xp: prev.stats.xp + 10,
      }
      // Пересчёт уровня
      const newLevel = Math.max(newStats.level, Math.floor(newStats.xp / 100) + 1)
      newStats.level = newLevel
      newStats.skill = Math.min(99, newLevel * 14)
      return {
        ...prev,
        stats: newStats,
        xp_progress: {
          current_xp: newStats.xp,
          xp_in_level: newStats.xp % 100,
          xp_to_next: 100 - (newStats.xp % 100),
          level: newLevel,
        },
      }
    })
  }, [])

  const recordArtifact = useCallback((rare = false) => {
    pendingRef.current.artifacts_found += 1
    if (rare) pendingRef.current.rare_found += 1
    pendingRef.current.xp += rare ? 50 : 25

    setEconomy(prev => {
      if (!prev) return prev
      return {
        ...prev,
        stats: {
          ...prev.stats,
          artifacts_found: prev.stats.artifacts_found + 1,
          rare_found: prev.stats.rare_found + (rare ? 1 : 0),
          xp: prev.stats.xp + (rare ? 50 : 25),
        },
      }
    })
  }, [])

  // ── Флашим буфер на сервер ────────────────────────────────────────────────
  const flushToServer = useCallback(async () => {
    const p = pendingRef.current
    if (!p.trash_collected && !p.artifacts_found && !p.xp) return

    const payload = { ...p }
    // Сброс буфера до отправки (на случай ошибки — не теряем следующие)
    pendingRef.current = { trash_collected: 0, artifacts_found: 0, rare_found: 0, earned: 0, xp: 0 }

    try {
      const res = await fetch(`${API_BASE}/walli/stats/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // Синхронизируем с сервером
      if (data.stats) {
        setEconomy(prev => prev ? { ...prev, stats: data.stats } : prev)
      }
    } catch {
      // Возвращаем в буфер при ошибке
      pendingRef.current.trash_collected += payload.trash_collected
      pendingRef.current.artifacts_found += payload.artifacts_found
      pendingRef.current.rare_found      += payload.rare_found
      pendingRef.current.earned          += payload.earned
      pendingRef.current.xp              += payload.xp
    }
  }, [])

  // ── Улучшить способность ──────────────────────────────────────────────────
  const upgradeAbility = useCallback(async (ability: 'find_artifacts' | 'trade' | 'analyze') => {
    try {
      const res = await fetch(`${API_BASE}/walli/upgrade/${ability}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ payment_confirmed: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // Обновить список способностей
      setEconomy(prev => {
        if (!prev) return prev
        return {
          ...prev,
          abilities: prev.abilities.map(a =>
            a.ability_type === ability
              ? { ...a, current_level: data.level, bonus: data.bonus, next_level: data.level + 1, upgrade_price_usd: data.price_usd }
              : a
          ),
        }
      })
      return data
    } catch (e) {
      throw e
    }
  }, [])

  // ── Запустить обучение ────────────────────────────────────────────────────
  const startTraining = useCallback(async (level: 1 | 2 | 3 | 4 | 5) => {
    const res = await fetch(`${API_BASE}/walli/train/${level}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    return res.json()
  }, [])

  // ── Купить предмет ────────────────────────────────────────────────────────
  const buyItem = useCallback(async (itemKey: string) => {
    const res = await fetch(`${API_BASE}/walli/buy/${itemKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    return res.json()
  }, [])

  return {
    economy,
    loading,
    error,
    loadEconomy,
    recordTrash,
    recordArtifact,
    flushToServer,
    upgradeAbility,
    startTraining,
    buyItem,
  }
}
