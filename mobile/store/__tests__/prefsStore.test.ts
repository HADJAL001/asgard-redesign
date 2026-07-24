jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockIsReduceMotionEnabled = jest.fn();
const mockAddEventListener = jest.fn();
jest.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => mockIsReduceMotionEnabled(),
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePrefsStore } from '../prefsStore';

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function resetStore() {
  usePrefsStore.setState({
    isHydrated: false,
    pushEnabled: true,
    reduceMotionOverride: 'system',
    osReduceMotion: false,
    effectiveReduceMotion: false,
  });
}

describe('prefsStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockIsReduceMotionEnabled.mockResolvedValue(false);
  });

  it('hydrate defaults push notifications to enabled when nothing was ever stored', async () => {
    await usePrefsStore.getState().hydrate();

    expect(usePrefsStore.getState().pushEnabled).toBe(true);
    expect(usePrefsStore.getState().isHydrated).toBe(true);
  });

  it('hydrate restores a previously stored push preference', async () => {
    mockedAsyncStorage.getItem.mockImplementation((key: string) =>
      Promise.resolve(key === 'osgard_push_enabled' ? '0' : null),
    );

    await usePrefsStore.getState().hydrate();

    expect(usePrefsStore.getState().pushEnabled).toBe(false);
  });

  it('hydrate defaults reduceMotionOverride to "system" and mirrors the OS value', async () => {
    mockIsReduceMotionEnabled.mockResolvedValue(true);

    await usePrefsStore.getState().hydrate();

    expect(usePrefsStore.getState().reduceMotionOverride).toBe('system');
    expect(usePrefsStore.getState().osReduceMotion).toBe(true);
    expect(usePrefsStore.getState().effectiveReduceMotion).toBe(true);
  });

  it('an explicit "off" override ignores the OS reduce-motion value', async () => {
    mockedAsyncStorage.getItem.mockImplementation((key: string) =>
      Promise.resolve(key === 'osgard_reduce_motion_override' ? 'off' : null),
    );
    mockIsReduceMotionEnabled.mockResolvedValue(true);

    await usePrefsStore.getState().hydrate();

    expect(usePrefsStore.getState().reduceMotionOverride).toBe('off');
    expect(usePrefsStore.getState().effectiveReduceMotion).toBe(false);
  });

  it('setPushEnabled persists the value and updates state', async () => {
    await usePrefsStore.getState().setPushEnabled(false);

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith('osgard_push_enabled', '0');
    expect(usePrefsStore.getState().pushEnabled).toBe(false);
  });

  it('setReduceMotionOverride persists the override and recomputes effectiveReduceMotion', async () => {
    usePrefsStore.setState({ osReduceMotion: false });

    await usePrefsStore.getState().setReduceMotionOverride('on');

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith('osgard_reduce_motion_override', 'on');
    expect(usePrefsStore.getState().reduceMotionOverride).toBe('on');
    expect(usePrefsStore.getState().effectiveReduceMotion).toBe(true);
  });
});
