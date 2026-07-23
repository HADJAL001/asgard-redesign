import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const ARCHIVE_KEY = 'osgard_archived_artifact_ids';

type ArchiveState = {
  isHydrated: boolean;
  archivedIds: number[];
  hydrate: () => Promise<void>;
  isArchived: (id: number) => boolean;
  archive: (id: number) => Promise<void>;
  unarchive: (id: number) => Promise<void>;
};

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  isHydrated: false,
  archivedIds: [],

  hydrate: async () => {
    const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
    set({ archivedIds: raw ? JSON.parse(raw) : [], isHydrated: true });
  },

  isArchived: (id) => get().archivedIds.includes(id),

  archive: async (id) => {
    const next = get().archivedIds.includes(id) ? get().archivedIds : [...get().archivedIds, id];
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(next));
    set({ archivedIds: next });
  },

  unarchive: async (id) => {
    const next = get().archivedIds.filter((archivedId) => archivedId !== id);
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(next));
    set({ archivedIds: next });
  },
}));
