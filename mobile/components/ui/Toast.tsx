/* ================================================================
   OSGARD · Toast — глобальные всплывающие уведомления.
   ----------------------------------------------------------------
   Использование: обернуть корень приложения в <ToastProvider> (см.
   app/_layout.tsx), затем вызывать `useToast().show(message, variant)`
   из любого компонента внутри провайдера.
   ================================================================ */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error';

type ToastAction = { label: string; onPress: () => void };

type ToastState = { id: number; message: string; variant: ToastVariant; action?: ToastAction };

type ToastContextValue = {
  show: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLE: Record<ToastVariant, string> = {
  default: 'border-border bg-card',
  success: 'border-up bg-card',
  error: 'border-down bg-card',
};

const DURATION_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const idRef = useRef(0);

  const show = useCallback((message: string, variant: ToastVariant = 'default', action?: ToastAction) => {
    idRef.current += 1;
    const id = idRef.current;
    setToast({ id, message, variant, action });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, DURATION_MS);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <SafeAreaView className="absolute inset-x-0 bottom-0 items-center px-6 pb-4" pointerEvents="box-none">
          <View
            className={cn(
              'w-full flex-row items-center justify-between gap-3 rounded-xl border px-4 py-3',
              VARIANT_STYLE[toast.variant]
            )}
          >
            <Text className="flex-1 text-sm font-semibold text-white">{toast.message}</Text>
            {toast.action ? (
              <Text
                onPress={() => {
                  toast.action?.onPress();
                  setToast(null);
                }}
                className="text-sm font-bold text-accent"
              >
                {toast.action.label}
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast должен вызываться внутри <ToastProvider>');
  return ctx;
}
