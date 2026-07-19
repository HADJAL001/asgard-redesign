import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js"
import {
  getMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  transfer,
} from "@solana/spl-token"
import dotenv from "dotenv"

dotenv.config()

/* ================================================================
   OSGARD · Solana / TimeCoin (TC) — интеграция с резервным пулом
   ----------------------------------------------------------------
   Резервный пул — это ассоциированный токен-аккаунт (ATA) keypair'а
   из .env (RESERVE_WALLET_SECRET_KEY), на котором лежит запас TC.

   ∞ → TC: списываем ∞ в БД, переводим TC из резерва на кошелёк юзера.
   TC → ∞: проверяем входящую транзакцию TC на резерв, зачисляем ∞.
   ================================================================ */

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet")
const MINT_ADDRESS = process.env.TIMECOIN_MINT_ADDRESS || ""
const RESERVE_SECRET_KEY = process.env.RESERVE_WALLET_SECRET_KEY || "" // JSON-массив байт, как в timecoin-wallet.json

export const connection = new Connection(RPC_URL, "confirmed")

/** Keypair резервного пула TC, загружается из .env (RESERVE_WALLET_SECRET_KEY). */
export function getReserveKeypair(): Keypair {
  if (!RESERVE_SECRET_KEY) {
    throw new Error("RESERVE_WALLET_SECRET_KEY не задан в .env")
  }
  const secret = Uint8Array.from(JSON.parse(RESERVE_SECRET_KEY))
  return Keypair.fromSecretKey(secret)
}

export function getMintPubkey(): PublicKey {
  if (!MINT_ADDRESS) {
    throw new Error("TIMECOIN_MINT_ADDRESS не задан в .env")
  }
  return new PublicKey(MINT_ADDRESS)
}

/** Баланс TC на ассоциированном токен-аккаунте резервного пула. */
export async function getReserveBalance(): Promise<number> {
  const reserve = getReserveKeypair()
  const mint = getMintPubkey()
  const mintInfo = await getMint(connection, mint)

  const ata = await getOrCreateAssociatedTokenAccount(connection, reserve, mint, reserve.publicKey)
  const account = await getAccount(connection, ata.address)
  return Number(account.amount) / 10 ** mintInfo.decimals
}

/**
 * Перевод TC из резервного пула на указанный Solana-адрес пользователя.
 * Используется для конвертации ∞ → TC.
 */
export async function sendTcFromReserve(recipientAddress: string, amount: number): Promise<string> {
  const reserve = getReserveKeypair()
  const mint = getMintPubkey()
  const mintInfo = await getMint(connection, mint)
  const recipientPubkey = new PublicKey(recipientAddress)

  const reserveAta = await getOrCreateAssociatedTokenAccount(connection, reserve, mint, reserve.publicKey)
  const recipientAta = await getOrCreateAssociatedTokenAccount(connection, reserve, mint, recipientPubkey)

  const rawAmount = BigInt(Math.round(amount * 10 ** mintInfo.decimals))

  const signature = await transfer(
    connection,
    reserve,
    reserveAta.address,
    recipientAta.address,
    reserve.publicKey,
    rawAmount,
  )

  return signature
}

/**
 * Проверка транзакции перевода TC от пользователя обратно в резервный пул.
 * Используется для конвертации TC → ∞: клиент присылает signature транзакции,
 * которую он подписал в своём Solana-кошельке (Phantom/Solflare), переведя
 * TC на адрес резерва. Мы проверяем on-chain, что перевод реально был.
 *
 * Возвращает { amount, from } если транзакция валидна, иначе бросает ошибку.
 */
export async function verifyTcTransferToReserve(
  signature: string,
  expectedAmount: number,
): Promise<{ amount: number; from: string }> {
  const reserve = getReserveKeypair()
  const mint = getMintPubkey()
  const mintInfo = await getMint(connection, mint)

  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  })

  if (!tx) {
    throw new Error("Транзакция не найдена в сети Solana (ещё не подтверждена или неверная подпись)")
  }
  if (tx.meta?.err) {
    throw new Error("Транзакция завершилась с ошибкой on-chain")
  }

  const reserveAta = await getOrCreateAssociatedTokenAccount(connection, reserve, mint, reserve.publicKey)
  const reserveAtaStr = reserveAta.address.toBase58()

  const preBalances = tx.meta?.preTokenBalances || []
  const postBalances = tx.meta?.postTokenBalances || []

  const postReserve = postBalances.find(
    (b: any) => b.mint === mint.toBase58() && tx.transaction.message.accountKeys[b.accountIndex]?.pubkey.toBase58() === reserveAtaStr,
  )
  const preReserve = preBalances.find(
    (b: any) => b.mint === mint.toBase58() && tx.transaction.message.accountKeys[b.accountIndex]?.pubkey.toBase58() === reserveAtaStr,
  )

  if (!postReserve) {
    throw new Error("Транзакция не содержит перевод TC на адрес резервного пула")
  }

  const preAmount = preReserve ? Number(preReserve.uiTokenAmount.amount) : 0
  const postAmount = Number(postReserve.uiTokenAmount.amount)
  const rawDelta = postAmount - preAmount
  const amount = rawDelta / 10 ** mintInfo.decimals

  if (amount <= 0) {
    throw new Error("Транзакция не увеличивает баланс резервного пула TC")
  }
  if (Math.abs(amount - expectedAmount) > expectedAmount * 0.01 + 1e-6) {
    throw new Error(
      `Сумма в транзакции (${amount} TC) не совпадает с запрошенной (${expectedAmount} TC)`,
    )
  }

  const sender = tx.transaction.message.accountKeys[0]?.pubkey.toBase58() || "unknown"

  return { amount, from: sender }
}

export default connection
