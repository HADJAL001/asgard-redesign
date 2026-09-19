import { apiClient } from '@/lib/api-client';
import type { RecipientLookupResult } from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';

export async function lookupRecipient(email: string): Promise<RecipientLookupResult> {
  return apiClient.get<RecipientLookupResult>(`/wallet/lookup-recipient?email=${encodeURIComponent(email)}`);
}

export async function transferTC(
  recipientEmail: string,
  amount: number,
  comment: string,
  password?: string,
  twofaToken?: string,
): Promise<{
  wallet: OsgardWallet;
  transfer: { recipientEmail: string; recipientName: string; amount: number; comment: string };
}> {
  return apiClient.post('/wallet/transfer', {
    recipientEmail,
    amount,
    comment,
    password,
    twofa_token: twofaToken,
  });
}
