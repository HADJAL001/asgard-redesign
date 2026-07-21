import { Router } from "express"
import db from "../lib/db"
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/authMiddleware"

const router = Router()

const MAX_POST_LENGTH = 4000
const MAX_TITLE_LENGTH = 200
const MAX_COMMENT_LENGTH = 2000
const POSTS_PAGE_SIZE = 50

type AuthorRow = {
  id: number
  username: string
  display_name: string | null
  avatar_url: string | null
  level: number
}

function mapAuthor(row: AuthorRow) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || null,
    level: row.level,
  }
}

/* ---------------- GET /posts ---------------- */
router.get("/", optionalAuth, (req: AuthRequest, res) => {
  const userId = req.user?.userId ?? null

  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.text, p.created_at,
              u.id as author_id, u.username, u.display_name, u.avatar_url, u.level,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments_count,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) as likes_count,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ?) as liked_by_me
       FROM posts p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC
       LIMIT ?`,
    )
    .all(userId, POSTS_PAGE_SIZE) as any[]

  const posts = rows.map((r) => ({
    id: r.id,
    title: r.title,
    text: r.text,
    createdAt: r.created_at,
    commentsCount: r.comments_count,
    likesCount: r.likes_count,
    likedByMe: !!r.liked_by_me,
    author: mapAuthor({
      id: r.author_id,
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      level: r.level,
    }),
  }))

  res.json({ success: true, posts })
})

/* ---------------- POST /posts ---------------- */
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ error: "Требуется авторизация" })
  }

  const { title, text } = req.body || {}

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Текст поста не может быть пустым" })
  }
  if (text.trim().length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: `Текст поста слишком длинный (макс. ${MAX_POST_LENGTH} символов)` })
  }
  if (title && (typeof title !== "string" || title.length > MAX_TITLE_LENGTH)) {
    return res.status(400).json({ error: `Заголовок слишком длинный (макс. ${MAX_TITLE_LENGTH} символов)` })
  }

  const now = Date.now()
  const result = db
    .prepare(`INSERT INTO posts (user_id, title, text, created_at) VALUES (?, ?, ?, ?)`)
    .run(userId, title ? String(title).trim() : null, text.trim(), now)

  const author = db
    .prepare(`SELECT id, username, display_name, avatar_url, level FROM users WHERE id = ?`)
    .get(userId) as AuthorRow

  res.status(201).json({
    success: true,
    post: {
      id: result.lastInsertRowid,
      title: title ? String(title).trim() : null,
      text: text.trim(),
      createdAt: now,
      commentsCount: 0,
      author: mapAuthor(author),
    },
  })
})

/* ---------------- GET /posts/:id/comments ---------------- */
router.get("/:id/comments", optionalAuth, (req, res) => {
  const postId = Number(req.params.id)
  if (!Number.isInteger(postId)) {
    return res.status(400).json({ error: "Некорректный ID поста" })
  }

  const rows = db
    .prepare(
      `SELECT c.id, c.text, c.created_at,
              u.id as author_id, u.username, u.display_name, u.avatar_url, u.level
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`,
    )
    .all(postId) as any[]

  const comments = rows.map((r) => ({
    id: r.id,
    text: r.text,
    createdAt: r.created_at,
    author: mapAuthor({
      id: r.author_id,
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      level: r.level,
    }),
  }))

  res.json({ success: true, comments })
})

/* ---------------- POST /posts/:id/comments ---------------- */
router.post("/:id/comments", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ error: "Требуется авторизация" })
  }

  const postId = Number(req.params.id)
  if (!Number.isInteger(postId)) {
    return res.status(400).json({ error: "Некорректный ID поста" })
  }

  const post = db.prepare(`SELECT id FROM posts WHERE id = ?`).get(postId)
  if (!post) {
    return res.status(404).json({ error: "Пост не найден" })
  }

  const { text } = req.body || {}
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Комментарий не может быть пустым" })
  }
  if (text.trim().length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Комментарий слишком длинный (макс. ${MAX_COMMENT_LENGTH} символов)` })
  }

  const now = Date.now()
  const result = db
    .prepare(`INSERT INTO comments (post_id, user_id, text, created_at) VALUES (?, ?, ?, ?)`)
    .run(postId, userId, text.trim(), now)

  const author = db
    .prepare(`SELECT id, username, display_name, avatar_url, level FROM users WHERE id = ?`)
    .get(userId) as AuthorRow

  res.status(201).json({
    success: true,
    comment: {
      id: result.lastInsertRowid,
      text: text.trim(),
      createdAt: now,
      author: mapAuthor(author),
    },
  })
})

/* ---------------- POST /posts/:id/like (toggle) ---------------- */
router.post("/:id/like", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user?.userId
  if (!userId) {
    return res.status(401).json({ error: "Требуется авторизация" })
  }

  const postId = Number(req.params.id)
  if (!Number.isInteger(postId)) {
    return res.status(400).json({ error: "Некорректный ID поста" })
  }

  const post = db.prepare(`SELECT id FROM posts WHERE id = ?`).get(postId)
  if (!post) {
    return res.status(404).json({ error: "Пост не найден" })
  }

  const existing = db
    .prepare(`SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?`)
    .get(postId, userId)

  if (existing) {
    db.prepare(`DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`).run(postId, userId)
  } else {
    db.prepare(`INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)`).run(
      postId,
      userId,
      Date.now(),
    )
  }

  const likesCount = (
    db.prepare(`SELECT COUNT(*) as c FROM post_likes WHERE post_id = ?`).get(postId) as { c: number }
  ).c

  res.json({ success: true, likesCount, likedByMe: !existing })
})

export default router
