import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

import { useLookupRecipientMutation } from '@/hooks/useLookupRecipientMutation';
import { useTransferMutation } from '@/hooks/useTransferMutation';
import { ApiError } from '@/lib/api-client';
import { fmtTC } from '@/lib/tc-market';

export default function TransferScreen() {
  const [email, setEmail] = useState('');
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [password, setPassword] = useState('');
  const [twofaToken, setTwofaToken] = useState('');

  const lookup = useLookupRecipientMutation();
  const transfer = useTransferMutation();
  const toast = useToast();

  const parsedAmount = Number(amount.replace(',', '.'));
  const canLookup = email.trim().length > 0 && !lookup.isPending;
  const canSubmit = !!recipientName && parsedAmount > 0 && password.length > 0 && !transfer.isPending;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setRecipientName(null);
  };

  const handleLookup = async () => {
    try {
      const res = await lookup.mutateAsync(email.trim());
      if (res.found) {
        setRecipientName(res.displayName ?? email.trim());
      } else {
        setRecipientName(null);
        toast.show(res.error ?? 'Получатель не найден', 'error');
      }
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось найти получателя', 'error');
    }
  };

  const handleTransfer = async () => {
    if (!canSubmit) return;
    try {
      await transfer.mutateAsync({
        recipientEmail: email.trim(),
        amount: parsedAmount,
        comment: comment.trim(),
        password,
        twofaToken: twofaToken.trim() || undefined,
      });
      toast.show(`Отправлено ${fmtTC(parsedAmount)}`, 'success');
      router.back();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось выполнить перевод', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card className="gap-3">
          <Text className="text-sm font-medium text-muted">Получатель</Text>
          <Input
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={handleEmailChange}
            placeholder="user@example.com"
          />
          <Button variant="secondary" disabled={!canLookup} loading={lookup.isPending} onPress={handleLookup}>
            Найти
          </Button>
          {recipientName ? <Text className="text-sm text-up">Получатель: {recipientName}</Text> : null}
        </Card>

        {recipientName ? (
          <Card className="gap-3">
            <Input
              label="Сумма TimeCoin"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />
            <Input
              label="Комментарий (необязательно)"
              value={comment}
              onChangeText={setComment}
              placeholder="Перевод TC"
            />
            <Input
              label="Пароль аккаунта"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Подтвердите паролем"
            />
            <Input
              label="Код 2FA (если включена)"
              keyboardType="number-pad"
              value={twofaToken}
              onChangeText={setTwofaToken}
              placeholder="000000"
            />
            <Button disabled={!canSubmit} loading={transfer.isPending} onPress={handleTransfer}>
              Перевести
            </Button>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
