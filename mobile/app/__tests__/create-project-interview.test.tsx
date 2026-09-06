import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput, View } from 'react-native';

import CreateScreen from '../(tabs)/index';
import { createProject } from '@/lib/projects-api';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));
jest.mock('@/hooks/useVoiceInput', () => ({
  useVoiceInput: () => ({ isListening: false, error: null, volume: 0, language: 'ru-RU', start: jest.fn(), stop: jest.fn(), cycleLanguage: jest.fn() }),
}));
jest.mock('@/hooks/useProjectsQuery', () => ({
  PROJECTS_QUERY_KEY: ['projects'],
  useProjectsQuery: () => ({ data: [] }),
}));
jest.mock('@/components/VoiceInputButton', () => ({ VoiceInputButton: () => null }));
jest.mock('lucide-react-native', () => ({
  CheckCircle2: () => null,
  CircleDashed: () => null,
  Layers3: () => null,
  WandSparkles: () => null,
  XCircle: () => null,
}));
jest.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/lib/projects-api', () => ({
  createProject: jest.fn(),
  fetchGenerationDepths: jest.fn(),
}));

const mockedCreateProject = createProject as jest.MockedFunction<typeof createProject>;

function primaryAction(screen: renderer.ReactTestRenderer) {
  return screen.root.findByProps({ testID: 'project-generate-button' });
}

function activeBriefInput(screen: renderer.ReactTestRenderer) {
  const input = screen.root.findAllByType(TextInput).find((candidate) => candidate.props.autoFocus);
  if (!input) throw new Error('Expected an active project brief input');
  return input;
}

describe('mobile project interview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateProject.mockResolvedValue({ id: 42 } as Awaited<ReturnType<typeof createProject>>);
  });

  it('does not generate before the required interview answers are complete', async () => {
    let screen: renderer.ReactTestRenderer;
    await act(async () => {
      screen = renderer.create(<CreateScreen />);
    });

    const ideaInput = screen!.root.findByProps({ testID: 'project-prompt-input' });
    act(() => ideaInput.props.onChangeText('Сервис бронирования столиков'));
    act(() => primaryAction(screen!).props.onPress());

    expect(mockedCreateProject).not.toHaveBeenCalled();
    expect(screen!.root.findAllByType(View).length).toBeGreaterThan(0);

    for (const answer of [
      'Владельцы небольших кафе',
      'Гость бронирует столик за минуту',
      'Календарь, бронирования, уведомления',
    ]) {
      act(() => activeBriefInput(screen!).props.onChangeText(answer));
      act(() => primaryAction(screen!).props.onPress());
      expect(mockedCreateProject).not.toHaveBeenCalled();
    }

    await act(async () => {
      await primaryAction(screen!).props.onPress();
    });

    expect(mockedCreateProject).toHaveBeenCalledTimes(1);
    expect(mockedCreateProject).toHaveBeenCalledWith({
      name: '',
      hint: [
        'Сервис бронирования столиков',
        'Аудитория: Владельцы небольших кафе',
        'Результат: Гость бронирует столик за минуту',
        'Обязательные функции: Календарь, бронирования, уведомления',
      ].join('\n'),
      depth: 'quick',
    });
  });
});
