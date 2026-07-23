import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { apiClient, ApiError } from '@/lib/api-client';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() }, { auth: false });
      setSent(true);
    } catch (e) {
      // Не раскрываем, существует ли email — показываем тот же успех, что и при реальной отправке.
      setSent(e instanceof ApiError && e.status === 404 ? true : true);
      if (!(e instanceof ApiError)) {
        setError('Не удалось отправить запрос, попробуйте позже');
        setSent(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-white">Восстановление пароля</Text>
          <Text className="text-muted">Укажите email — мы отправим инструкцию для сброса пароля</Text>
        </View>

        {sent ? (
          <Text className="text-base text-white">
            Если аккаунт с таким email существует, письмо с инструкцией уже отправлено.
          </Text>
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#8A8A9A"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              className="rounded-xl border border-border bg-card px-4 py-3 text-white"
            />
            {error && <Text className="text-sm text-down">{error}</Text>}
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              className={`items-center rounded-xl px-4 py-4 ${canSubmit ? 'bg-accent' : 'bg-border'}`}
            >
              <Text className={`text-base font-bold ${canSubmit ? 'text-bg' : 'text-muted'}`}>
                {loading ? 'Отправляем…' : 'Отправить'}
              </Text>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()}>
          <Text className="text-center text-sm text-muted">Назад ко входу</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
