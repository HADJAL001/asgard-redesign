import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

import { useAuthStore } from '@/store/authStore';
import { useBiometricStore } from '@/store/biometricStore';
import { usePrefsStore, type ReduceMotionOverride } from '@/store/prefsStore';
import { useChangePasswordMutation } from '@/hooks/useChangePasswordMutation';
import { ApiError } from '@/lib/api-client';

const REDUCE_MOTION_OPTIONS: { id: ReduceMotionOverride; label: string }[] = [
  { id: 'system', label: 'Как в системе' },
  { id: 'on', label: 'Включено' },
  { id: 'off', label: 'Выключено' },
];

export default function SettingsScreen() {
  const toast = useToast();
  const logout = useAuthStore((s) => s.logout);
  const [loggingOut, setLoggingOut] = useState(false);

  const pushEnabled = usePrefsStore((s) => s.pushEnabled);
  const setPushEnabled = usePrefsStore((s) => s.setPushEnabled);
  const reduceMotionOverride = usePrefsStore((s) => s.reduceMotionOverride);
  const setReduceMotionOverride = usePrefsStore((s) => s.setReduceMotionOverride);

  const biometricEnabled = useBiometricStore((s) => s.isEnabled);
  const biometricAvailable = useBiometricStore((s) => s.isAvailable);
  const enableBiometric = useBiometricStore((s) => s.enable);
  const disableBiometric = useBiometricStore((s) => s.disable);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const changePassword = useChangePasswordMutation();

  const canSubmitPassword = oldPassword.length > 0 && newPassword.length >= 6 && !changePassword.isPending;

  const handleToggleBiometric = async () => {
    if (biometricEnabled) {
      await disableBiometric();
    } else {
      await enableBiometric();
    }
  };

  const handleChangePassword = async () => {
    if (!canSubmitPassword) return;
    try {
      const res = await changePassword.mutateAsync({ oldPassword, newPassword });
      toast.show(res.message || 'Пароль изменён', 'success');
      setOldPassword('');
      setNewPassword('');
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось сменить пароль', 'error');
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Push-уведомления</Text>
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              size="sm"
              variant={pushEnabled ? 'primary' : 'secondary'}
              onPress={() => setPushEnabled(true)}
            >
              Включены
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant={!pushEnabled ? 'primary' : 'secondary'}
              onPress={() => setPushEnabled(false)}
            >
              Выключены
            </Button>
          </View>
        </Card>

        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Уменьшить анимации</Text>
          <View className="flex-row flex-wrap gap-2">
            {REDUCE_MOTION_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                size="sm"
                variant={reduceMotionOverride === opt.id ? 'primary' : 'secondary'}
                onPress={() => setReduceMotionOverride(opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </View>
        </Card>

        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Биометрический вход</Text>
          {biometricAvailable ? (
            <Button variant={biometricEnabled ? 'primary' : 'secondary'} onPress={handleToggleBiometric}>
              {biometricEnabled ? 'Включён — нажмите, чтобы выключить' : 'Выключен — нажмите, чтобы включить'}
            </Button>
          ) : (
            <Text className="text-muted">На этом устройстве биометрия недоступна</Text>
          )}
        </Card>

        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Смена пароля</Text>
          <Input
            label="Текущий пароль"
            secureTextEntry
            value={oldPassword}
            onChangeText={setOldPassword}
            placeholder="••••••••"
          />
          <Input
            label="Новый пароль (минимум 6 символов)"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="••••••••"
          />
          <Button disabled={!canSubmitPassword} loading={changePassword.isPending} onPress={handleChangePassword}>
            Сменить пароль
          </Button>
        </Card>

        <Button variant="danger" loading={loggingOut} onPress={handleLogout}>
          Выйти
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
