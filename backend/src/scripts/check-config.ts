import { solanaConfig } from '../config/solana.config';

console.log('✅ SOLANA_RPC_URL:      ', solanaConfig.rpcUrl);
console.log('✅ TC_MINT_ADDRESS:     ', solanaConfig.tcMintAddress);
console.log('✅ TREASURY_SECRET_KEY:', solanaConfig.treasurySecretKey ? '[SET]' : '[MISSING]');
