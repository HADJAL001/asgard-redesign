import { useMutation, useQueryClient } from '@tanstack/react-query';
import { transferTC } from '@/lib/wallet-api';
import type { OsgardWallet } from '@/types/artifact';
import { WALLET_QUERY_KEY } from '@/hooks/useWalletQuery';

export function useTransferMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      recipientEmail,
      amount,
      comment,
      password,
      twofaToken,
    }: {
      recipientEmail: string;
      amount: number;
      comment: string;
      password?: string;
      twofaToken?: string;
    }) => transferTC(recipientEmail, amount, comment, password, twofaToken),
    onSuccess: (data) => {
      queryClient.setQueryData<OsgardWallet>(WALLET_QUERY_KEY, data.wallet);
    },
  });
}
