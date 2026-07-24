import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';

import { useAuthStore } from '@/store/authStore';
import { useGuestStore } from '@/store/guestStore';
import { useBiometricStore } from '@/store/biometricStore';
import { signInWithProvider } from '@/lib/oauth';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);
  const loginWithToken = useAuthStore((s) => s.loginWithToken);
  const migrateGuest = useGuestStore((s) => s.migrateToAccount);
  const biometric = useBiometricStore();

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !loading;

  const afterAuthSuccess = async () => {
    await migrateGuest();
    if (biometric.isAvailable && !biometric.isEnabled) {
      const enabled = await biometric.authenticate();
      if (enabled) {
        await biometric.enable();
      }
    }
    router.replace('/(tabs)');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const result = await login(identifier.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? 'Не удалось войти');
      return;
    }
    await afterAuthSuccess();
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(true);
    setError(null);
    const result = await signInWithProvider(provider);
    if (!result.ok) {
      setLoading(false);
      setError(result.message);
      return;
    }
    const stored = await loginWithToken(result.token, result.refreshToken);
    setLoading(false);
    if (!stored.ok) {
      setError(stored.message ?? 'Не удалось войти');
      return;
    }
    await afterAuthSuccess();
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-white">С возвращением</Text>
          <Text className="text-muted">Войдите в OSGARD NEW WORLD</Text>
        </View>

        <View className="gap-3">
          <TextInput
            testID="login-username-input"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="Email или логин"
            placeholderTextColor="#8A8A9A"
            autoCapitalize="none"
            autoCorrect={false}
            className="rounded-xl border border-border bg-card px-4 py-3 text-white"
          />
          <TextInput
            testID="login-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="Пароль"
            placeholderTextColor="#8A8A9A"
            secureTextEntry
            className="rounded-xl border border-border bg-card px-4 py-3 text-white"
          />
        </View>

        {error && <Text className="text-sm text-down">{error}</Text>}

        <Pressable
          testID="login-submit-button"
          onPress={handleSubmit}
          disabled={!canSubmit}
          className={`items-center rounded-xl px-4 py-4 ${canSubmit ? 'bg-accent' : 'bg-border'}`}
        >
          <Text className={`text-base font-bold ${canSubmit ? 'text-bg' : 'text-muted'}`}>
            {loading ? 'Входим…' : 'Войти'}
          </Text>
        </Pressable>

        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-xs text-muted">или</Text>
          <View className="h-px flex-1 bg-border" />
        </View>

        <View className="gap-3">
          <Pressable
            onPress={() => handleOAuth('google')}
            disabled={loading}
            className="items-center rounded-xl border border-border bg-card px-4 py-3"
          >
            <Text className="text-base font-semibold text-white">Продолжить с Google</Text>
          </Pressable>
          <Pressable
            onPress={() => handleOAuth('github')}
            disabled={loading}
            className="items-center rounded-xl border border-border bg-card px-4 py-3"
          >
            <Text className="text-base font-semibold text-white">Продолжить с GitHub</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace('/guest-home')} disabled={loading}>
          <Text className="text-center text-sm text-muted">Продолжить без регистрации</Text>
        </Pressable>

        <View className="flex-row justify-center gap-1">
          <Text className="text-muted">Нет аккаунта?</Text>
          <Link href="/(auth)/register">
            <Text className="font-semibold text-accent">Зарегистрироваться</Text>
          </Link>
        </View>
        <Link href="/(auth)/forgot-password">
          <Text className="text-center text-sm text-muted">Забыли пароль?</Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}
