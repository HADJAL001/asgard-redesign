import { SolanaService } from '../services/solana.service';

async function test() {
  try {
    const service = new SolanaService();
    console.log('✅ Service initialized');
    console.log('🏦 Treasury:', service.getTreasuryPublicKey());
    
    const balance = await service.getTreasuryBalance();
    console.log('💰 Balance:', balance, 'TC');
    
    if (balance === 0) {
      console.log('⚠️ Пополни казну токенами');
    } else {
      console.log('✅ Казна готова к работе');
    }
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
  }
}

test();
