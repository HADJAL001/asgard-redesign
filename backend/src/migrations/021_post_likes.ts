import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 021: лайки постов (post_likes)
   ================================================================ */

export function runPostLikesMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
  `)
}

runPostLikesMigration()
