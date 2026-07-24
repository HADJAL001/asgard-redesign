import { Component, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sentry } from '@/lib/sentry';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView className="flex-1 bg-bg">
          <View className="flex-1 items-center justify-center p-6">
            <Card className="w-full gap-3">
              <Text className="text-lg font-bold text-white">Что-то пошло не так</Text>
              <Text className="text-muted">
                Приложение столкнулось с неожиданной ошибкой. Попробуйте продолжить — если это
                повторится, перезапустите приложение.
              </Text>
              <Button onPress={this.handleReset}>Попробовать снова</Button>
            </Card>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}
