import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer, getMint } from '@solana/spl-token';
import bs58 from 'bs58';
import { solanaConfig } from '../config/solana.config';
import { cacheService } from './cache.service';

export class SolanaService {
  private connection: Connection;
  private treasuryWallet: Keypair | null = null;
  private mintAddress: PublicKey | null = null;
  readonly isAvailable: boolean;

  constructor() {
    this.connection = new Connection(solanaConfig.rpcUrl, 'confirmed');
    if (solanaConfig.isConfigured) {
      try {
        const secretKey = bs58.decode(solanaConfig.treasurySecretKey);
        this.treasuryWallet = Keypair.fromSecretKey(secretKey);
        this.mintAddress = new PublicKey(solanaConfig.tcMintAddress);
        this.isAvailable = true;
      } catch (e) {
        console.warn('[SolanaService] Invalid Solana config, on-chain transfers disabled:', (e as Error).message);
        this.isAvailable = false;
      }
    } else {
      console.warn('[SolanaService] TREASURY_SECRET_KEY / TC_MINT_ADDRESS not set — on-chain transfers disabled');
      this.isAvailable = false;
    }
  }

  private requireWallet(): { wallet: Keypair; mint: PublicKey } {
    if (!this.isAvailable || !this.treasuryWallet || !this.mintAddress) {
      throw new Error('Solana not configured. Set TREASURY_SECRET_KEY and TC_MINT_ADDRESS in .env');
    }
    return { wallet: this.treasuryWallet, mint: this.mintAddress };
  }

  async sendTokens(toAddress: string, amount: number): Promise<string> {
    const { wallet, mint } = this.requireWallet();
    const toPublicKey = new PublicKey(toAddress);

    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      wallet,
      mint,
      wallet.publicKey
    );

    const toTokenAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      wallet,
      mint,
      toPublicKey
    );

    // transfer() из @solana/spl-token сама отправляет транзакцию и возвращает подпись
    const signature = await transfer(
      this.connection,
      wallet,
      fromTokenAccount.address,
      toTokenAccount.address,
      wallet.publicKey,
      amount * 10 ** 9
    );

    await this.connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  async getTreasuryBalance(): Promise<number> {
    const { wallet, mint } = this.requireWallet();

    const cached = await cacheService.get('treasury_balance');
    if (cached !== null) return cached;

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      wallet,
      mint,
      wallet.publicKey
    );
    const balance = await this.connection.getTokenAccountBalance(tokenAccount.address);
    const value = balance.value.uiAmount || 0;
    await cacheService.set('treasury_balance', value, 5); // кэш на 5 секунд
    return value;
  }

  getTreasuryPublicKey(): string {
    const { wallet } = this.requireWallet();
    return wallet.publicKey.toBase58();
  }

  /**
   * Проверка входящего перевода TC на казначейский адрес — используется для
   * депозита ∞ (TC → ∞). Клиент присылает подпись транзакции, которую он
   * подписал в своём Solana-кошельке, переведя TC на адрес казначейства.
   * Сверяем on-chain дельту баланса ATA казначейства, а не верим заявленной
   * клиентом сумме напрямую (allowed tolerance ±1%, защита от округления).
   */
  async verifyIncomingTransfer(signature: string, expectedAmount: number): Promise<{ amount: number; from: string }> {
    const { wallet, mint } = this.requireWallet();
    const mintInfo = await getMint(this.connection, mint);

    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx) {
      throw new Error('Транзакция не найдена в сети Solana (ещё не подтверждена или неверная подпись)');
    }
    if (tx.meta?.err) {
      throw new Error('Транзакция завершилась с ошибкой on-chain');
    }

    const treasuryAta = await getOrCreateAssociatedTokenAccount(this.connection, wallet, mint, wallet.publicKey);
    const treasuryAtaStr = treasuryAta.address.toBase58();

    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    const postTreasury = postBalances.find(
      (b: any) =>
        b.mint === mint.toBase58() &&
        tx.transaction.message.accountKeys[b.accountIndex]?.pubkey.toBase58() === treasuryAtaStr,
    );
    const preTreasury = preBalances.find(
      (b: any) =>
        b.mint === mint.toBase58() &&
        tx.transaction.message.accountKeys[b.accountIndex]?.pubkey.toBase58() === treasuryAtaStr,
    );

    if (!postTreasury) {
      throw new Error('Транзакция не содержит перевод TC на адрес казначейства');
    }

    const preAmount = preTreasury ? Number(preTreasury.uiTokenAmount.amount) : 0;
    const postAmount = Number(postTreasury.uiTokenAmount.amount);
    const rawDelta = postAmount - preAmount;
    const amount = rawDelta / 10 ** mintInfo.decimals;

    if (amount <= 0) {
      throw new Error('Транзакция не увеличивает баланс казначейства TC');
    }
    if (Math.abs(amount - expectedAmount) > expectedAmount * 0.01 + 1e-6) {
      throw new Error(`Сумма в транзакции (${amount} TC) не совпадает с запрошенной (${expectedAmount} TC)`);
    }

    const sender = tx.transaction.message.accountKeys[0]?.pubkey.toBase58() || 'unknown';
    return { amount, from: sender };
  }
}
