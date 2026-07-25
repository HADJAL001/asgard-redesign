import { test } from "node:test"
import assert from "node:assert/strict"
import { TwoFAService } from "../services/twofa.service"

/* ================================================================
   OSGARD · Юнит-тест: TwoFAService (усиление 2FA, Блок безопасности)
   ----------------------------------------------------------------
   Чистые проверки без поднятия сервера/БД: шифрование секрета «в покое»,
   генерация/расход одноразовых резервных кодов, подсчёт остатка.
   ================================================================ */

test("шифрование секрета обратимо (encrypt → decryptSecret)", () => {
  const secret = "JBSWY3DPEHPK3PXP"
  const enc = TwoFAService.encryptSecret(secret)
  assert.notEqual(enc, secret, "секрет не должен храниться открытым текстом")
  assert.equal(TwoFAService.decryptSecret(enc), secret)
})

test("decryptSecret обратно совместим с незашифрованным (старым) секретом", () => {
  // Старые записи в БД хранили секрет открытым текстом — не должны ломаться.
  const legacy = "JBSWY3DPEHPK3PXP"
  assert.equal(TwoFAService.decryptSecret(legacy), legacy)
})

test("генерируется 10 backup-кодов формата xxxxx-xxxxx", () => {
  const { plain, hashed } = TwoFAService.generateBackupCodes()
  assert.equal(plain.length, 10)
  assert.equal(hashed.length, 10)
  for (const code of plain) {
    assert.match(code, /^[0-9a-f]{5}-[0-9a-f]{5}$/)
  }
  // Хеши не должны совпадать с открытыми кодами.
  assert.equal(new Set(hashed).size, 10, "все хеши уникальны")
})

test("backup-код одноразовый: расходуется и не срабатывает повторно", () => {
  const { plain, hashed } = TwoFAService.generateBackupCodes()
  const stored = TwoFAService.serializeBackupHashes(hashed)

  assert.equal(TwoFAService.countBackupCodes(stored), 10)

  // Валидный код расходуется → в наборе остаётся 9.
  const afterUse = TwoFAService.consumeBackupCode(stored, plain[0])
  assert.ok(afterUse, "валидный код должен пройти")
  assert.equal(afterUse!.length, 9)

  // Повторное использование того же кода поверх нового набора — уже неуспех.
  const stored2 = TwoFAService.serializeBackupHashes(afterUse!)
  assert.equal(TwoFAService.consumeBackupCode(stored2, plain[0]), null)
})

test("неверный backup-код отклоняется", () => {
  const { hashed } = TwoFAService.generateBackupCodes()
  const stored = TwoFAService.serializeBackupHashes(hashed)
  assert.equal(TwoFAService.consumeBackupCode(stored, "00000-00000"), null)
})

test("backup-код нечувствителен к регистру и пробелам", () => {
  const { plain, hashed } = TwoFAService.generateBackupCodes()
  const stored = TwoFAService.serializeBackupHashes(hashed)
  const messy = `  ${plain[0].toUpperCase()}  `
  assert.ok(TwoFAService.consumeBackupCode(stored, messy), "код должен пройти несмотря на регистр/пробелы")
})

test("verifyStoredToken работает поверх зашифрованного секрета", () => {
  const speakeasy = require("speakeasy")
  const { secret } = TwoFAService.generateSecret("test@osgard.com")
  const enc = TwoFAService.encryptSecret(secret)
  const token = speakeasy.totp({ secret, encoding: "base32" })
  assert.equal(TwoFAService.verifyStoredToken(enc, token), true)
  assert.equal(TwoFAService.verifyStoredToken(enc, "000000"), false)
})
