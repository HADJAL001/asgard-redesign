import { Text, View } from 'react-native';
import { AlertTriangle, Coins } from 'lucide-react-native';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

type ConfirmDialogProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  danger?: boolean;
};

/**
 * danger=false — трата остаётся внутри платформы и обратима (ковка, ИИ-генерация,
 * покупка на маркетплейсе, конвертация, пополнение): золотая монета.
 * danger=true — ценность покидает контроль пользователя безвозвратно (перевод,
 * вывод во внешний кошелёк): красный треугольник.
 */
export function ConfirmDialog({
  visible,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  loading = false,
  danger = false,
}: ConfirmDialogProps) {
  const Icon = danger ? AlertTriangle : Coins;

  return (
    <Modal visible={visible} onClose={onCancel} title={title}>
      <View accessible accessibilityLiveRegion="polite" className="mb-4 flex-row items-start gap-3">
        <View
          className={`mt-0.5 size-8 shrink-0 items-center justify-center rounded-full border ${danger ? 'border-down' : 'border-gold'}`}
        >
          <Icon size={16} color={danger ? '#EF4444' : '#D4AF37'} strokeWidth={1.75} />
        </View>
        <Text className="flex-1 text-sm text-muted">{message}</Text>
      </View>
      <View className="flex-row gap-3">
        <Button variant="secondary" className="flex-1" onPress={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onPress={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </View>
    </Modal>
  );
}
