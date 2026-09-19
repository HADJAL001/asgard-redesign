import db from "../lib/db"

/** Stores a small, self-contained glTF avatar with the room. The column is
 * intentionally text: assets stay inside the existing persistent database,
 * never on an ephemeral application filesystem. */
export function runSecretRoomAvatarMigration() {
  const columns = db.prepare("PRAGMA table_info(secret_rooms)").all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === "avatar_gltf")) {
    db.exec("ALTER TABLE secret_rooms ADD COLUMN avatar_gltf TEXT")
  }
}
