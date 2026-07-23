"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Heart, MessageCircle, Share2, Pin, Plus, X, Send, Loader2 } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient, ApiError } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"
import { ReadonlyGate, useReadonlyMode } from "@/lib/readonly-mode"
import { HOTKEY_SAVE_EVENT } from "@/lib/use-hotkeys"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

const AVATAR_FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80"

type Author = {
  id: number
  username: string
  displayName: string
  avatarUrl: string | null
  level: number
}

type Post = {
  id: number
  title: string | null
  text: string
  createdAt: number
  commentsCount: number
  likesCount: number
  likedByMe: boolean
  author: Author
}

type Comment = {
  id: number
  text: string
  createdAt: number
  author: Author
}

function formatTime(ts: number) {
  const diffMs = Date.now() - ts
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "только что"
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн назад`
  return new Date(ts).toLocaleDateString("ru-RU")
}

function Reaction({ Icon, value }: { Icon: typeof Heart; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px]" style={{ color: "#6A6A8A" }}>
      <Icon size={16} strokeWidth={1.5} />
      {value}
    </span>
  )
}

function LikeButton({
  value,
  active,
  disabled,
  onClick,
}: {
  value: number
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-[14px] transition-colors disabled:opacity-60"
      style={{ color: active ? "#FF6B6B" : "#6A6A8A" }}
    >
      <Heart size={16} strokeWidth={1.5} fill={active ? "#FF6B6B" : "none"} />
      {value}
    </button>
  )
}

export function CommunityView() {
  const [creating, setCreating] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPostId, setExpandedPostId] = useState<number | null>(null)
  const [comments, setComments] = useState<Record<number, Comment[]>>({})
  const [commentsLoading, setCommentsLoading] = useState<Record<number, boolean>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({})
  const [likingPostIds, setLikingPostIds] = useState<Set<number>>(new Set())
  const [commentSubmitting, setCommentSubmitting] = useState<Record<number, boolean>>({})
  const likingPostIdsRef = useRef<Set<number>>(new Set())

  const { isAuthenticated } = useAuth()
  const { triggerPaywall } = useReadonlyMode()

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.get<{ posts: Post[] }>("/posts", { skipAuthRedirect: true })
      setPosts(data.posts)
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить посты")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => loadPosts())
  }, [loadPosts])

  /* Ctrl+N (см. хук хоткеев) редиректит сюда с ?new=1 — сразу открываем модалку */
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("new") === "1") {
      if (isAuthenticated) Promise.resolve().then(() => setCreating(true))
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [isAuthenticated])

  const handlePostCreated = (post: Post) => {
    setPosts((prev) => [post, ...prev])
    setCreating(false)
  }

  const toggleComments = useCallback(
    async (postId: number) => {
      if (expandedPostId === postId) {
        setExpandedPostId(null)
        return
      }
      setExpandedPostId(postId)
      if (comments[postId]) return

      setCommentsLoading((prev) => ({ ...prev, [postId]: true }))
      try {
        const data = await apiClient.get<{ comments: Comment[] }>(`/posts/${postId}/comments`, { skipAuthRedirect: true })
        setComments((prev) => ({ ...prev, [postId]: data.comments }))
      } catch {
        setComments((prev) => ({ ...prev, [postId]: [] }))
      } finally {
        setCommentsLoading((prev) => ({ ...prev, [postId]: false }))
      }
    },
    [expandedPostId, comments],
  )

  const toggleLike = useCallback(
    async (postId: number) => {
      if (!isAuthenticated) {
        triggerPaywall("Оценить пост")
        return
      }
      if (likingPostIdsRef.current.has(postId)) return
      likingPostIdsRef.current.add(postId)
      setLikingPostIds((prev) => new Set(prev).add(postId))

      let prevLiked = false
      let prevCount = 0
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p
          prevLiked = p.likedByMe
          prevCount = p.likesCount
          const nextLiked = !prevLiked
          return { ...p, likedByMe: nextLiked, likesCount: prevCount + (nextLiked ? 1 : -1) }
        }),
      )

      try {
        const data = await apiClient.post<{ likesCount: number; likedByMe: boolean }>(`/posts/${postId}/like`)
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, likesCount: data.likesCount, likedByMe: data.likedByMe } : p,
          ),
        )
      } catch {
        // откатываем оптимистичное обновление при ошибке
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, likedByMe: prevLiked, likesCount: prevCount } : p)),
        )
      } finally {
        likingPostIdsRef.current.delete(postId)
        setLikingPostIds((prev) => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
      }
    },
    [isAuthenticated, triggerPaywall],
  )

  const submitComment = useCallback(
    async (postId: number, rawText: string) => {
      if (!isAuthenticated) {
        triggerPaywall("Комментировать пост")
        return
      }
      const text = rawText.trim()
      if (!text) return

      setCommentSubmitting((prev) => ({ ...prev, [postId]: true }))
      try {
        const data = await apiClient.post<{ comment: Comment }>(`/posts/${postId}/comments`, { text })
        setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data.comment] }))
        setCommentDrafts((prev) => ({ ...prev, [postId]: "" }))
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p)),
        )
      } catch {
        // ошибка отправки — оставляем черновик, чтобы пользователь не потерял текст
      } finally {
        setCommentSubmitting((prev) => ({ ...prev, [postId]: false }))
      }
    },
    [isAuthenticated, triggerPaywall],
  )

  const handleDraftChange = useCallback((postId: number, value: string) => {
    setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
  }, [])

  const metrics = useMemo(() => {
    const authorsCount = new Set(posts.map((p) => p.author.id)).size
    const commentsTotal = posts.reduce((sum, p) => sum + p.commentsCount, 0)
    return [
      { n: authorsCount, l: "Авторов" },
      { n: posts.length, l: "Постов" },
      { n: commentsTotal, l: "Комментариев" },
      { n: commentsTotal + posts.length, l: "Активность" },
    ]
  }, [posts])

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D1A 100%)", color: "#FFFFFF" }}>
      {/* Header */}
      <Navbar />

      <main className="mx-auto max-w-[900px] px-6 py-10 md:px-10 md:py-12">
        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Сообщество</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Архитекторы вселенной — общение, идеи, коллаборации
            </p>
          </div>
          <ReadonlyGate action="Создать пост" className="self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
              style={{ border: "1px solid #2A2A3E", color: "#FFFFFF" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#00D4FF"
                e.currentTarget.style.borderColor = "#00D4FF"
                e.currentTarget.style.color = "#0A0A0F"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
                e.currentTarget.style.borderColor = "#2A2A3E"
                e.currentTarget.style.color = "#FFFFFF"
              }}
            >
              <Plus size={16} strokeWidth={1.75} />
              Создать пост
            </button>
          </ReadonlyGate>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
              <p className="text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Feed */}
        {loading && (
          <div className="mt-10 flex items-center justify-center gap-2 text-[14px]" style={{ color: "#6A6A8A" }}>
            <Loader2 size={18} className="animate-spin" />
            Загрузка постов…
          </div>
        )}

        {!loading && error && (
          <div className="mt-10 rounded-xl p-5 text-[14px]" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E", color: "#FF6B6B" }}>
            {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="mt-10 rounded-xl p-8 text-center text-[14px]" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E", color: "#6A6A8A" }}>
            Пока нет постов. Будь первым архитектором, кто поделится идеей.
          </div>
        )}

        <div className="mt-8 flex flex-col gap-5">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              expanded={expandedPostId === p.id}
              liking={likingPostIds.has(p.id)}
              draft={commentDrafts[p.id] || ""}
              postComments={comments[p.id]}
              commentsLoading={!!commentsLoading[p.id]}
              commentSubmitting={!!commentSubmitting[p.id]}
              onToggleLike={toggleLike}
              onToggleComments={toggleComments}
              onDraftChange={handleDraftChange}
              onSubmitComment={submitComment}
            />
          ))}
        </div>
      </main>

      {creating && <CreatePostModal onClose={() => setCreating(false)} onCreated={handlePostCreated} />}
    </div>
  )
}

/* ---------------- Post card (memoized — не перерендеривается при вводе в чужих карточках) ---------------- */
const PostCard = memo(function PostCard({
  post: p,
  expanded,
  liking,
  draft,
  postComments,
  commentsLoading,
  commentSubmitting,
  onToggleLike,
  onToggleComments,
  onDraftChange,
  onSubmitComment,
}: {
  post: Post
  expanded: boolean
  liking: boolean
  draft: string
  postComments: Comment[] | undefined
  commentsLoading: boolean
  commentSubmitting: boolean
  onToggleLike: (postId: number) => void
  onToggleComments: (postId: number) => void
  onDraftChange: (postId: number, value: string) => void
  onSubmitComment: (postId: number, text: string) => void
}) {
  return (
    <article
      className="rounded-xl p-6 transition-all duration-200"
      style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
    >
      <div className="flex items-center gap-3">
        <Image
          src={p.author.avatarUrl || AVATAR_FALLBACK}
          alt={p.author.displayName}
          width={32}
          height={32}
          className="size-8 rounded-full object-cover"
          style={{ border: "1px solid #2A2A3E" }}
        />
        <div className="min-w-0">
          <p className="text-[16px] font-medium leading-tight">{p.author.displayName}</p>
          <p className="text-[12px]" style={{ color: "#6A6A8A" }}>Lvl.{p.author.level}</p>
        </div>
        <span className="ml-auto text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>{formatTime(p.createdAt)}</span>
      </div>

      {p.title && (
        <p className="mt-4 text-[16px] font-semibold leading-tight">{p.title}</p>
      )}
      <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
        {p.text}
      </p>

      <div className="mt-5 flex items-center gap-6">
        <LikeButton
          value={p.likesCount}
          active={p.likedByMe}
          disabled={liking}
          onClick={() => onToggleLike(p.id)}
        />
        <button
          type="button"
          onClick={() => onToggleComments(p.id)}
          className="inline-flex items-center gap-1.5 text-[14px] transition-colors"
          style={{ color: expanded ? "#00D4FF" : "#6A6A8A" }}
        >
          <MessageCircle size={16} strokeWidth={1.5} />
          {p.commentsCount}
        </button>
        <Reaction Icon={Share2} value={0} />
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] transition-colors"
          style={{ color: "#6A6A8A" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00D4FF")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6A6A8A")}
        >
          <Pin size={15} strokeWidth={1.5} />
          Закрепить
        </button>
      </div>

      {expanded && (
        <div className="mt-5 flex flex-col gap-3 pt-5" style={{ borderTop: "1px solid #2A2A3E" }}>
          {commentsLoading && (
            <p className="text-[13px]" style={{ color: "#6A6A8A" }}>Загрузка комментариев…</p>
          )}
          {!commentsLoading && (postComments || []).length === 0 && (
            <p className="text-[13px]" style={{ color: "#6A6A8A" }}>Комментариев пока нет.</p>
          )}
          {(postComments || []).map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <Image
                src={c.author.avatarUrl || AVATAR_FALLBACK}
                alt={c.author.displayName}
                width={24}
                height={24}
                className="size-6 shrink-0 rounded-full object-cover"
                style={{ border: "1px solid #2A2A3E" }}
              />
              <div className="min-w-0 flex-1 rounded-lg px-3 py-2" style={{ backgroundColor: "#0A0A0F" }}>
                <p className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>{c.author.displayName}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{c.text}</p>
              </div>
            </div>
          ))}

          <ReadonlyGate action="Комментировать пост">
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={draft}
                onChange={(e) => onDraftChange(p.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmitComment(p.id, draft)
                }}
                placeholder="Написать комментарий…"
                className="w-full rounded-lg px-3 py-2 text-[13px] outline-none placeholder:text-white/25"
                style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
              />
              <button
                type="button"
                onClick={() => onSubmitComment(p.id, draft)}
                disabled={commentSubmitting || !draft.trim()}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
              >
                {commentSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={1.75} />}
              </button>
            </div>
          </ReadonlyGate>
        </div>
      )}
    </article>
  )
})

/* ---------------- Create post modal (40% x 60%) ---------------- */
function CreatePostModal({ onClose, onCreated }: { onClose: () => void; onCreated: (post: Post) => void }) {
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError("Текст поста не может быть пустым")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const data = await apiClient.post<{ post: Post }>("/posts", {
        title: title.trim() || undefined,
        text: text.trim(),
      })
      onCreated(data.post)
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Не удалось опубликовать пост")
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const onSaveHotkey = () => {
      handleSubmit()
    }
    window.addEventListener(HOTKEY_SAVE_EVENT, onSaveHotkey)
    return () => window.removeEventListener(HOTKEY_SAVE_EVENT, onSaveHotkey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.72)" }} onClick={onClose}>
      <div
        className="flex max-h-[60vh] w-full max-w-[40vw] flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-8 py-5" style={{ borderBottom: "1px solid #2A2A3E" }}>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg" style={{ color: "#6A6A8A" }}>
            <X size={18} strokeWidth={1.75} />
          </button>
          <h2 className="text-[20px] font-semibold">Создать пост</h2>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 py-6">
          <label className="block">
            <span className="mb-2 block text-[13px]" style={{ color: "#6A6A8A" }}>Заголовок</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите заголовок (необязательно)"
              className="w-full rounded-lg px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-white/25"
              style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
            />
          </label>

          <label className="block flex-1">
            <span className="mb-2 block text-[13px]" style={{ color: "#6A6A8A" }}>Текст</span>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Что нового, архитектор?"
              className="w-full resize-none rounded-lg px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-white/25"
              style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
            />
          </label>

          {error && <p className="text-[13px]" style={{ color: "#FF6B6B" }}>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-8 py-5" style={{ borderTop: "1px solid #2A2A3E" }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px] transition-colors" style={{ border: "1px solid #2A2A3E", color: "#FFFFFF" }}>Отмена</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Опубликовать
          </button>
        </div>
      </div>
    </div>
  )
}
