import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Fingerprint } from 'lucide-react-native';

import { useBiometricStore } from '@/store/biometricStore';
import { useAuthStore } from '@/store/authStore';

export default function BiometricLockScreen() {
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const authenticate = useBiometricStore((s) => s.authenticate);
  const markUnlocked = useBiometricStore((s) => s.markUnlocked);
  const logout = useAuthStore((s) => s.logout);

  const tryUnlock = useCallback(async () => {
    setChecking(true);
    setFailed(false);
    const success = await authenticate();
    setChecking(false);
    if (success) {
      markUnlocked();
      router.replace('/(tabs)');
    } else {
      setFailed(true);
    }
  }, [authenticate, markUnlocked]);

  useEffect(() => {
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUsePassword = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-6 px-8">
        <View className="h-24 w-24 items-center justify-center rounded-full bg-card">
          <Fingerprint size={40} color="#00D4FF" />
        </View>
        <Text className="text-center text-2xl font-bold text-white">Подтвердите личность</Text>
        <Text className="text-center text-muted">
          {checking ? 'Ожидаем биометрию…' : failed ? 'Не удалось подтвердить биометрию' : 'Используйте биометрию для входа'}
        </Text>

        <Pressable onPress={tryUnlock} disabled={checking} className="items-center rounded-xl bg-accent px-6 py-4">
          <Text className="text-base font-bold text-bg">Попробовать снова</Text>
        </Pressable>

        <Pressable onPress={handleUsePassword}>
          <Text className="text-center text-sm text-muted">Войти по паролю</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
