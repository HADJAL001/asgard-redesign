import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CheckCircle2, CircleAlert, CircleDashed, FolderKanban, Plus } from 'lucide-react-native';

import { useProjectsQuery } from '@/hooks/useProjectsQuery';
import type { OsgardProject } from '@/types/project';

function statusMeta(project: OsgardProject) {
  if (project.status === 'generating') return { label: 'Собирается', color: '#F5C451', Icon: CircleDashed };
  if (project.status === 'failed') return { label: 'Нужен ремонт', color: '#FB7185', Icon: CircleAlert };
  return { label: 'Готово', color: '#34D399', Icon: CheckCircle2 };
}

export default function ProjectsScreen() {
  const { data: projects, isLoading, isRefetching, refetch } = useProjectsQuery();
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#00F0FF" />} contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View className="flex-row items-end justify-between">
          <View className="gap-1"><Text className="text-xs font-semibold uppercase tracking-[2px] text-accent">WORKSPACE</Text><Text className="text-3xl font-bold text-white">Мои проекты</Text><Text className="text-sm text-muted">История сборок и доработок</Text></View>
          <Pressable onPress={() => router.push('/(tabs)')} accessibilityRole="button" accessibilityLabel="Создать проект" className="h-11 w-11 items-center justify-center rounded-full bg-accent"><Plus size={21} color="#07111F" /></Pressable>
        </View>
        {isLoading ? <Text className="py-10 text-center text-sm text-muted">Загружаю проекты…</Text> : projects?.length ? projects.map((project) => <ProjectCard key={project.id} project={project} />) : <View className="items-center gap-3 rounded-2xl border border-border bg-card px-5 py-12"><FolderKanban size={30} color="#77809A" /><Text className="text-base font-semibold text-white">Проектов пока нет</Text><Text className="text-center text-sm leading-5 text-muted">Создайте приложение по описанию, а затем дорабатывайте его словами.</Text><Pressable onPress={() => router.push('/(tabs)')} className="mt-2 rounded-xl bg-accent px-5 py-3"><Text className="font-semibold text-bg">Создать первый проект</Text></Pressable></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProjectCard({ project }: { project: OsgardProject }) {
  const { label, color, Icon } = statusMeta(project);
  return <Pressable onPress={() => router.push(`/project/${project.id}`)} className="gap-3 rounded-2xl border border-border bg-card px-4 py-4"><View className="flex-row items-start gap-3"><View className="h-10 w-10 items-center justify-center rounded-xl bg-accent/10"><FolderKanban size={19} color="#00F0FF" /></View><View className="flex-1"><Text className="text-base font-semibold text-white" numberOfLines={1}>{project.name}</Text><Text className="mt-1 text-xs leading-4 text-muted" numberOfLines={2}>{project.description || 'Описание появится после сборки'}</Text></View><View className="flex-row items-center gap-1"><Icon size={14} color={color} /><Text style={{ color }} className="text-xs font-semibold">{label}</Text></View></View>{project.generationError && <Text className="text-xs leading-4 text-down" numberOfLines={2}>{project.generationError}</Text>}<Text className="text-xs text-muted">Открыть рабочую область →</Text></Pressable>;
}
