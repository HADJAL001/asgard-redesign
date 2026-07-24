import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

type ChangePasswordInput = { oldPassword: string; newPassword: string };
type ChangePasswordResponse = { success: boolean; message: string };

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: ({ oldPassword, newPassword }: ChangePasswordInput) =>
      apiClient.post<ChangePasswordResponse>('/auth/change-password', { oldPassword, newPassword }),
  });
}
