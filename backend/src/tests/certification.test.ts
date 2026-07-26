// ПЕРВОЙ строкой: форсирует DB_PATH=:memory: до загрузки lib/db. См. economy-tx.test.ts.
import "./helpers/use-memory-db"
import { test } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · certification — «экзамен делом» + выпуск/отзыв credential
   ----------------------------------------------------------------
   Проверяем на реальной (in-memory) SQLite:
     • computeEligibility() — граничные случаи по каждому из 4
       критериев (тир/деплои/craft/авторские) и их комбинация;
     • issueCertificate/revokeCertificate — идемпотентность повторного
       revoke, гонка на partial-unique индексе (один АКТИВНЫЙ credential
       на пользователя — миграция 084).

   Схема — минимальный стаб под то, что реально читают certification.ts
   (users.architect_xp, projects.deploy_status, artifacts.creator_id/
   craft_score) и certificate.ts (academy_certificates, users.username).
   Пороги дефолтные (env не переопределён): tier>=2, deploys>=3,
   craft>=0.7, authored>=10 (см. certification.ts).
   ================================================================ */

import { computeEligibility } from "../lib/certification"
import { issueCertificate, revokeCertificate, getCertificateById } from "../lib/certificate"
import db from "../lib/db"

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL DEFAULT 'user',
    architect_xp INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    deploy_status TEXT NOT NULL DEFAULT 'draft'
  );
  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER,
    craft_score REAL
  );
  CREATE TABLE IF NOT EXISTS academy_certificates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    serial        TEXT NOT NULL UNIQUE,
    tier          TEXT NOT NULL DEFAULT 'founder_track'
                  CHECK(tier IN ('founder_track','founder_circle')),
    status        TEXT NOT NULL DEFAULT 'issued'
                  CHECK(status IN ('issued','revoked')),
    snapshot_json TEXT NOT NULL DEFAULT '{}',
    issued_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    revoked_at    INTEGER,
    revoked_by    INTEGER,
    revoke_reason TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_certificates_one_active
  ON academy_certificates(user_id) WHERE status = 'issued';
`)

function seedUser(id: number, architectXp = 0, username = `user${id}`) {
  db.prepare(
    `INSERT INTO users (id, username, architect_xp) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET username = excluded.username, architect_xp = excluded.architect_xp`,
  ).run(id, username, architectXp)
}

function seedDeployedProjects(userId: number, n: number) {
  db.prepare(`DELETE FROM projects WHERE user_id = ?`).run(userId)
  for (let i = 0; i < n; i++) {
    db.prepare(`INSERT INTO projects (user_id, deploy_status) VALUES (?, 'deployed')`).run(userId)
  }
}

function seedArtifacts(userId: number, scores: number[]) {
  db.prepare(`DELETE FROM artifacts WHERE creator_id = ?`).run(userId)
  for (const score of scores) {
    db.prepare(`INSERT INTO artifacts (creator_id, craft_score) VALUES (?, ?)`).run(userId, score)
  }
}

test("computeEligibility: новый пользователь без сигналов — ничего не выполнено", () => {
  const uid = 100
  seedUser(uid, 0)
  const result = computeEligibility(uid)
  assert.equal(result.eligible, false)
  assert.equal(result.metCount, 0)
  assert.equal(result.totalCount, 4)
  for (const c of result.criteria) {
    assert.equal(c.met, false)
    assert.equal(c.current, 0)
  }
})

test("computeEligibility: architect_tier — граница тира (xp=2000 → индекс 2, met; xp=1999 → индекс 1, не met)", () => {
  const uidBelow = 101
  seedUser(uidBelow, 1999)
  const below = computeEligibility(uidBelow).criteria.find((c) => c.key === "architect_tier")!
  assert.equal(below.current, 1)
  assert.equal(below.met, false)

  const uidAt = 102
  seedUser(uidAt, 2000)
  const at = computeEligibility(uidAt).criteria.find((c) => c.key === "architect_tier")!
  assert.equal(at.current, 2)
  assert.equal(at.met, true)
})

test("computeEligibility: deployed_projects — граница 3 (2 не met, 3 met)", () => {
  const uid = 103
  seedUser(uid)
  seedDeployedProjects(uid, 2)
  assert.equal(computeEligibility(uid).criteria.find((c) => c.key === "deployed_projects")!.met, false)

  seedDeployedProjects(uid, 3)
  const at = computeEligibility(uid).criteria.find((c) => c.key === "deployed_projects")!
  assert.equal(at.current, 3)
  assert.equal(at.met, true)
})

test("computeEligibility: peak_craft_score — MAX среди артефактов, граница 0.7", () => {
  const uid = 104
  seedUser(uid)
  seedArtifacts(uid, [0.2, 0.69])
  assert.equal(computeEligibility(uid).criteria.find((c) => c.key === "peak_craft_score")!.met, false)

  seedArtifacts(uid, [0.2, 0.7])
  const at = computeEligibility(uid).criteria.find((c) => c.key === "peak_craft_score")!
  assert.equal(at.current, 0.7)
  assert.equal(at.met, true)
})

test("computeEligibility: authored_artifacts — граница 10", () => {
  const uid = 105
  seedUser(uid)
  seedArtifacts(uid, Array(9).fill(0.1))
  assert.equal(computeEligibility(uid).criteria.find((c) => c.key === "authored_artifacts")!.met, false)

  seedArtifacts(uid, Array(10).fill(0.1))
  const at = computeEligibility(uid).criteria.find((c) => c.key === "authored_artifacts")!
  assert.equal(at.current, 10)
  assert.equal(at.met, true)
})

test("computeEligibility: все критерии на границе одновременно — eligible=true", () => {
  const uid = 106
  seedUser(uid, 2000)
  seedDeployedProjects(uid, 3)
  seedArtifacts(uid, [0.7])
  db.prepare(`INSERT INTO artifacts (creator_id, craft_score) VALUES (?, ?)`).run(uid, 0.5)
  for (let i = 0; i < 8; i++) db.prepare(`INSERT INTO artifacts (creator_id, craft_score) VALUES (?, ?)`).run(uid, 0.3)

  const result = computeEligibility(uid)
  assert.equal(result.metCount, 4)
  assert.equal(result.eligible, true)
})

test("issueCertificate: фиксирует снимок eligibility и выдаёт активный credential", () => {
  const uid = 200
  seedUser(uid, 2000, "vibecoder-200")
  seedDeployedProjects(uid, 3)
  seedArtifacts(uid, Array(10).fill(0.8))

  const cert = issueCertificate(uid, "founder_circle", "vibecoder-200")
  assert.equal(cert.status, "issued")
  assert.equal(cert.tier, "founder_circle")
  assert.match(cert.serial, /^OSGARD-VC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)

  const snapshot = JSON.parse(cert.snapshot_json)
  assert.equal(snapshot.metCount, 4)
  assert.equal(snapshot.totalCount, 4)
})

test("partial-unique индекс: второй АКТИВНЫЙ credential на того же пользователя запрещён (гонка issue)", () => {
  const uid = 201
  seedUser(uid, 0, "vibecoder-201")
  const first = issueCertificate(uid, "founder_track", "vibecoder-201")
  assert.equal(first.status, "issued")

  // Второй параллельный «победитель» гонки — прямой INSERT status='issued' для того же
  // user_id должен упереться в partial-unique индекс (idx_academy_certificates_one_active).
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO academy_certificates (user_id, serial, tier, status, snapshot_json, issued_at, created_at)
           VALUES (?, 'OSGARD-VC-RACE-RACE-RACE', 'founder_track', 'issued', '{}', 0, 0)`,
        )
        .run(uid),
    /UNIQUE constraint failed/,
  )
})

test("revokeCertificate: идемпотентен — повторный отзыв no-op, revoked_at не меняется", () => {
  const uid = 202
  seedUser(uid, 0, "vibecoder-202")
  const cert = issueCertificate(uid, "founder_track", "vibecoder-202")

  const revoked = revokeCertificate(cert.id, 999, "test-reason")!
  assert.equal(revoked.status, "revoked")
  assert.equal(revoked.revoke_reason, "test-reason")
  assert.ok(revoked.revoked_at)

  const revokedAgain = revokeCertificate(cert.id, 999, "different-reason")!
  assert.equal(revokedAgain.status, "revoked")
  assert.equal(revokedAgain.revoked_at, revoked.revoked_at, "revoked_at не должен обновиться на повторном отзыве")
  assert.equal(revokedAgain.revoke_reason, "test-reason", "причина не должна перезаписаться повторным вызовом")
})

test("revokeCertificate: несуществующий id → undefined", () => {
  assert.equal(revokeCertificate(999999, 1), undefined)
})

test("после revoke пользователь может получить новый активный credential (старый остаётся в истории)", () => {
  const uid = 203
  seedUser(uid, 0, "vibecoder-203")
  const first = issueCertificate(uid, "founder_track", "vibecoder-203")
  revokeCertificate(first.id, 999)

  const second = issueCertificate(uid, "founder_circle", "vibecoder-203")
  assert.equal(second.status, "issued")
  assert.notEqual(second.id, first.id)

  const historicalFirst = getCertificateById(first.id)!
  assert.equal(historicalFirst.status, "revoked", "старый credential остаётся revoked в истории")
})
