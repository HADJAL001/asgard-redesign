import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { apiClient } from '@/lib/api-client';

const GUEST_GENERATIONS_KEY = 'osgard_guest_generations_used';
const GUEST_PROJECTS_KEY = 'osgard_guest_demo_projects';

export const GUEST_FREE_GENERATIONS = 3;

export type GuestDemoProject = {
  name: string;
  description: string;
  badge: string;
  artifacts: unknown[];
};

type GuestState = {
  isHydrated: boolean;
  generationsUsed: number;
  /** Демо-проекты, накопленные за гостевые генерации — переносятся в реальный аккаунт
   *  через backend/src/routes/demo.routes.ts POST /demo/convert сразу после регистрации. */
  demoProjects: GuestDemoProject[];
  hydrate: () => Promise<void>;
  canGenerate: () => boolean;
  recordGeneration: (project?: GuestDemoProject) => Promise<void>;
  /** Вызывается после успешной регистрации: лучший эффект — переносит накопленные демо-проекты
   *  на новый аккаунт, затем сбрасывает гостевой лимит. Ошибка переноса не должна прерывать
   *  сам процесс регистрации, поэтому исключения проглатываются. */
  migrateToAccount: () => Promise<void>;
  /** Сбрасывает гостевой лимит без попытки переноса демо-проектов (например, при входе в
   *  уже существующий аккаунт, куда демо-данные текущей гостевой сессии не относятся). */
  reset: () => Promise<void>;
};

export const useGuestStore = create<GuestState>((set, get) => ({
  isHydrated: false,
  generationsUsed: 0,
  demoProjects: [],

  hydrate: async () => {
    const [rawCount, rawProjects] = await Promise.all([
      AsyncStorage.getItem(GUEST_GENERATIONS_KEY),
      AsyncStorage.getItem(GUEST_PROJECTS_KEY),
    ]);
    set({
      generationsUsed: rawCount ? Number(rawCount) || 0 : 0,
      demoProjects: rawProjects ? JSON.parse(rawProjects) : [],
      isHydrated: true,
    });
  },

  canGenerate: () => get().generationsUsed < GUEST_FREE_GENERATIONS,

  recordGeneration: async (project) => {
    const next = get().generationsUsed + 1;
    const nextProjects = project ? [...get().demoProjects, project] : get().demoProjects;
    await Promise.all([
      AsyncStorage.setItem(GUEST_GENERATIONS_KEY, String(next)),
      AsyncStorage.setItem(GUEST_PROJECTS_KEY, JSON.stringify(nextProjects)),
    ]);
    set({ generationsUsed: next, demoProjects: nextProjects });
  },

  migrateToAccount: async () => {
    const { demoProjects } = get();
    if (demoProjects.length > 0) {
      try {
        await apiClient.post('/demo/convert', { projects: demoProjects });
      } catch {
        // Best-effort: перенос демо-данных не критичен для успеха регистрации/входа.
      }
    }
    await get().reset();
  },

  reset: async () => {
    await Promise.all([
      AsyncStorage.removeItem(GUEST_GENERATIONS_KEY),
      AsyncStorage.removeItem(GUEST_PROJECTS_KEY),
    ]);
    set({ generationsUsed: 0, demoProjects: [] });
  },
}));
