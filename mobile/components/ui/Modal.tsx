import { Modal as RNModal, Pressable, Text, View, type ModalProps as RNModalProps } from 'react-native';
import { X } from 'lucide-react-native';

type ModalProps = Pick<RNModalProps, 'animationType'> & {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function Modal({ visible, onClose, title, children, animationType = 'fade' }: ModalProps) {
  return (
    <RNModal visible={visible} transparent animationType={animationType} onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable className="rounded-2xl border border-border bg-card p-5" onPress={(e) => e.stopPropagation()}>
          {title ? (
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-white">{title}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={20} color="#8A8A9A" />
              </Pressable>
            </View>
          ) : null}
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
