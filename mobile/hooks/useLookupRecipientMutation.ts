import { useMutation } from '@tanstack/react-query';
import { lookupRecipient } from '@/lib/wallet-api';

export function useLookupRecipientMutation() {
  return useMutation({
    mutationFn: (email: string) => lookupRecipient(email),
  });
}
