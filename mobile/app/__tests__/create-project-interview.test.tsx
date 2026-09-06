import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput, View } from 'react-native';

import CreateScreen from '../(tabs)/index';
import { createProject } from '@/lib/projects-api';
import { ApiError } from '@/lib/api-client';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(() => ({ data: [], refetch: jest.fn(), isFetching: false })) }));
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
  RefreshCw: () => null,
  WandSparkles: () => null,
  XCircle: () => null,
}));
jest.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/lib/projects-api', () => ({
  createProject: jest.fn(),
  fetchGenerationDepths: jest.fn(),
}));

const mockedCreateProject = createProject as jest.MockedFunction<typeof createProject>;
const mockedUseQuery = (jest.requireMock('@tanstack/react-query') as { useQuery: jest.Mock }).useQuery;

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
    mockedUseQuery.mockReturnValue({ data: [], refetch: jest.fn(), isFetching: false });
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
  it('explains that no project was started when AI generation is unavailable', async () => {
    mockedCreateProject.mockRejectedValueOnce(new ApiError(503, 'Generation unavailable', {
      code: 'GENERATION_PROVIDERS_UNAVAILABLE',
    }));
    let screen: renderer.ReactTestRenderer;
    await act(async () => {
      screen = renderer.create(<CreateScreen />);
    });

    const ideaInput = screen!.root.findByProps({ testID: 'project-prompt-input' });
    act(() => ideaInput.props.onChangeText('Сервис бронирования столиков'));
    act(() => primaryAction(screen!).props.onPress());

    for (const answer of [
      'Владельцы небольших кафе',
      'Гость бронирует столик за минуту',
      'Календарь, бронирования, уведомления',
    ]) {
      act(() => activeBriefInput(screen!).props.onChangeText(answer));
      act(() => primaryAction(screen!).props.onPress());
    }

    await act(async () => {
      await primaryAction(screen!).props.onPress();
    });

    expect(screen!.root.findAllByType(Text).map((node) => node.props.children).flat()).toContain(
      'AI-команда временно недоступна. Проект не был начат, списаний нет. Попробуйте позже.',
    );
  });

  it('blocks the interview before it starts when the verified AI pipeline is unavailable', async () => {
    const refetch = jest.fn();
    mockedUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
      data: queryKey[0] === 'project-generation-readiness'
        ? { ready: false, roles: { planner: true, coder: false, reviewer: true }, missing: ['coder'] }
        : [],
      refetch,
      isFetching: false,
    }));
    let screen: renderer.ReactTestRenderer;
    await act(async () => {
      screen = renderer.create(<CreateScreen />);
    });

    const ideaInput = screen!.root.findByProps({ testID: 'project-prompt-input' });
    act(() => ideaInput.props.onChangeText('Сервис бронирования столиков'));

    expect(primaryAction(screen!).props.disabled).toBe(true);
    expect(screen!.root.findAllByType(Text).map((node) => node.props.children).flat()).toContain(
      'AI-команда временно недоступна. Создание проекта будет доступно после восстановления конвейера.',
    );
    act(() => screen!.root.findByProps({ testID: 'refresh-generation-readiness' }).props.onPress());
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mockedCreateProject).not.toHaveBeenCalled();
  });
});
