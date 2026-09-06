import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Pressable, TextInput } from 'react-native';

import GuestHomeScreen from '../guest-home';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('lucide-react-native', () => ({ ArrowRight: () => null, Sparkles: () => null }));
jest.mock('@/store/authStore', () => ({ useAuthStore: jest.fn() }));

const mockedUseAuthStore = useAuthStore as unknown as jest.Mock;

describe('mobile guest project start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the entered project context into the mandatory interview', async () => {
    const startGuest = jest.fn().mockResolvedValue({ ok: true });
    mockedUseAuthStore.mockImplementation((selector: (state: { startGuest: typeof startGuest }) => unknown) =>
      selector({ startGuest }),
    );
    const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };

    let screen: renderer.ReactTestRenderer;
    await act(async () => {
      screen = renderer.create(<GuestHomeScreen />);
    });

    const inputs = screen!.root.findAllByType(TextInput);
    act(() => inputs[0].props.onChangeText('FocusFlow'));
    act(() => inputs[1].props.onChangeText('Помогает командам планировать день'));
    const action = screen!.root.findAllByType(Pressable).find((node) => node.props.accessibilityRole === 'button');

    await act(async () => {
      await action!.props.onPress();
    });

    expect(startGuest).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/(tabs)',
      params: { name: 'FocusFlow', hint: 'Помогает командам планировать день' },
    });
  });
});
