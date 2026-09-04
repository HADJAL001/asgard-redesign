jest.mock('@/lib/api-client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { apiClient } from '@/lib/api-client';
import { createProject, fetchGenerationDepths } from '../projects-api';

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('projects-api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApiClient.post.mockResolvedValue({ project: { id: 1, name: 'FocusFlow', status: 'generating' } });
  });

  it('uses the free quick depth when the user did not choose a paid depth', async () => {
    await createProject({ hint: 'Приложение для планирования задач' });

    expect(mockedApiClient.post).toHaveBeenCalledWith('/projects/generate', {
      name: undefined,
      hint: 'Приложение для планирования задач',
      depth: 'quick',
      profile: 'static',
    });
  });

  it('preserves an explicitly selected generation depth', async () => {
    await createProject({ name: 'FocusFlow', hint: 'Задачи команды', depth: 'deep' });

    expect(mockedApiClient.post).toHaveBeenCalledWith('/projects/generate', {
      name: 'FocusFlow',
      hint: 'Задачи команды',
      depth: 'deep',
      profile: 'static',
    });
  });

  it('loads the public generation depth catalogue from the backend', async () => {
    const depths = [{ id: 'quick', label: 'Быстрая', description: 'В квоте', credits: 0, countsAgainstQuota: true }];
    mockedApiClient.get.mockResolvedValue({ depths });

    await expect(fetchGenerationDepths()).resolves.toBe(depths);
    expect(mockedApiClient.get).toHaveBeenCalledWith('/projects/generation-depths');
  });
});
