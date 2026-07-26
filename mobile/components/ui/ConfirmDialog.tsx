import { Text, View } from 'react-native';

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
  return (
    <Modal visible={visible} onClose={onCancel} title={title}>
      <View accessible accessibilityLiveRegion="polite" className="mb-4">
        <Text className="text-sm text-muted">{message}</Text>
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
