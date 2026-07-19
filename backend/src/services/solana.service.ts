import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
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

    const cached = cacheService.get('treasury_balance');
    if (cached !== null) return cached;

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      wallet,
      mint,
      wallet.publicKey
    );
    const balance = await this.connection.getTokenAccountBalance(tokenAccount.address);
    const value = balance.value.uiAmount || 0;
    cacheService.set('treasury_balance', value, 5); // кэш на 5 секунд
    return value;
  }

  getTreasuryPublicKey(): string {
    const { wallet } = this.requireWallet();
    return wallet.publicKey.toBase58();
  }
}
