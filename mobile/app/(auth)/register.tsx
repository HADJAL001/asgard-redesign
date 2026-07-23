import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';

import { useAuthStore } from '@/store/authStore';
import { useGuestStore } from '@/store/guestStore';

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useAuthStore((s) => s.register);
  const migrateGuest = useGuestStore((s) => s.migrateToAccount);

  const canSubmit =
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    password === confirmPassword &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await register(username.trim(), email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? 'Не удалось зарегистрироваться');
      return;
    }
    await migrateGuest();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-white">Создать аккаунт</Text>
          <Text className="text-muted">Присоединяйтесь к OSGARD NEW WORLD</Text>
        </View>

        <View className="gap-3">
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Логин"
            placeholderTextColor="#8A8A9A"
            autoCapitalize="none"
            autoCorrect={false}
            className="rounded-xl border border-border bg-card px-4 py-3 text-white"
          />
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
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Пароль"
            placeholderTextColor="#8A8A9A"
            secureTextEntry
            className="rounded-xl border border-border bg-card px-4 py-3 text-white"
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Повторите пароль"
            placeholderTextColor="#8A8A9A"
            secureTextEntry
            className="rounded-xl border border-border bg-card px-4 py-3 text-white"
          />
        </View>

        {error && <Text className="text-sm text-down">{error}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className={`items-center rounded-xl px-4 py-4 ${canSubmit ? 'bg-accent' : 'bg-border'}`}
        >
          <Text className={`text-base font-bold ${canSubmit ? 'text-bg' : 'text-muted'}`}>
            {loading ? 'Создаём…' : 'Зарегистрироваться'}
          </Text>
        </Pressable>

        <View className="flex-row justify-center gap-1">
          <Text className="text-muted">Уже есть аккаунт?</Text>
          <Link href="/(auth)/login">
            <Text className="font-semibold text-accent">Войти</Text>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
