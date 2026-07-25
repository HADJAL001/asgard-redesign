import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 070: Secret Room (супер-тайная комната)
   ----------------------------------------------------------------
   Приватная комната пользователя: платный вход ($99 разово + $9/мес),
   кастомизация (фон + мебель/картины), до 3 друзей бесплатно, далее
   $49 за каждого. Идемпотентно.
   ================================================================ */
export function runSecretRoomMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS secret_rooms (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name         TEXT NOT NULL DEFAULT 'Тайная комната',
        background   TEXT NOT NULL DEFAULT 'nebula',
        items        TEXT NOT NULL DEFAULT '[]',
        friend_slots INTEGER NOT NULL DEFAULT 3,
        access_until INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS secret_room_members (
        room_id  INTEGER NOT NULL REFERENCES secret_rooms(id) ON DELETE CASCADE,
        user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_secret_room_members_user ON secret_room_members(user_id);
    `)
    console.log("[migration:070] secret_room tables ready")
  } catch (e: any) {
    console.warn(`[migration:070] secret_room: ${e.message}`)
  }
}

runSecretRoomMigration()
