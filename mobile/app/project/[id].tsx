import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { CheckCircle2, CircleAlert, CircleDashed, Coins, ExternalLink, FileCode2, Sparkles, Wrench } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { apiClient, ApiError } from '@/lib/api-client';
import { fetchProject, fetchProjectFiles, fetchProjectRefinements, refineProject } from '@/lib/projects-api';
import { PROJECTS_QUERY_KEY } from '@/hooks/useProjectsQuery';
import { queryClient } from '@/lib/queryClient';

type Engineering = { verdict: string | null; meter?: { aiCalls: number | null; tokensIn: number | null; tokensOut: number | null; detail?: { byProvider?: Record<string, { tokens: number; calls: number }> } | null } | null };

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const [prompt, setPrompt] = useState('');
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectQuery = useQuery({ queryKey: ['project', projectId], queryFn: () => fetchProject(projectId), enabled: Number.isInteger(projectId), refetchInterval: (query) => query.state.data?.status === 'generating' ? 2500 : false });
  const engineering = useQuery({ queryKey: ['project-engineering', projectId], queryFn: () => apiClient.get<Engineering>(`/projects/${projectId}/engineering`), enabled: Number.isInteger(projectId), refetchInterval: projectQuery.data?.status === 'generating' ? 2500 : false });
  const files = useQuery({ queryKey: ['project-files', projectId], queryFn: () => fetchProjectFiles(projectId), enabled: projectQuery.data?.status === 'ready' });
  const refinements = useQuery({ queryKey: ['project-refinements', projectId], queryFn: () => fetchProjectRefinements(projectId), enabled: Number.isInteger(projectId) });
  const project = projectQuery.data;
  const totalTokens = useMemo(() => { const meter = engineering.data?.meter; return meter?.tokensIn != null && meter.tokensOut != null ? meter.tokensIn + meter.tokensOut : null; }, [engineering.data]);

  const submitRefinement = async () => {
    if (!prompt.trim() || refining || !project) return;
    setRefining(true); setError(null);
    try {
      await refineProject(project.id, prompt);
      setPrompt('');
      await Promise.all([projectQuery.refetch(), refinements.refetch(), queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })]);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось запустить доработку'); }
    finally { setRefining(false); }
  };

  if (projectQuery.isLoading || !project) return <SafeAreaView className="flex-1 items-center justify-center bg-bg"><ActivityIndicator color="#00F0FF" /><Text className="mt-3 text-sm text-muted">Открываю рабочую область…</Text></SafeAreaView>;
  const status = project.status === 'generating' ? { label: 'Собирается', color: '#F5C451', Icon: CircleDashed } : project.status === 'failed' ? { label: 'Нужен ремонт', color: '#FB7185', Icon: CircleAlert } : { label: 'Готово', color: '#34D399', Icon: CheckCircle2 };
  const StatusIcon = status.Icon;

  return <SafeAreaView className="flex-1 bg-bg"><ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Pressable onPress={() => router.back()} className="self-start"><Text className="text-sm font-semibold text-accent">← Мои проекты</Text></Pressable>
    <View className="gap-2"><View className="flex-row items-center gap-2"><StatusIcon size={18} color={status.color} /><Text style={{ color: status.color }} className="text-sm font-semibold">{status.label}</Text></View><Text className="text-3xl font-bold text-white">{project.name}</Text><Text className="text-sm leading-5 text-muted">{project.description || 'Платформа собирает приложение по вашему запросу.'}</Text></View>

    <View className="gap-3 rounded-2xl border border-border bg-card px-4 py-4"><Text className="text-sm font-semibold text-white">Конвейер OSGARD</Text><View className="flex-row items-center justify-between"><Stage label="План" model="OSGARD 5.0 / 4.8" done={project.status !== 'generating'} /><Stage label="Код" model="OSGARD 4.0" done={project.status === 'ready'} /><Stage label="Проверка" model="Engineering" done={engineering.data?.verdict === 'passed' || engineering.data?.verdict === 'repaired'} /></View></View>

    {project.status === 'generating' && <View className="items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-5"><ActivityIndicator color="#00F0FF" /><Text className="text-sm font-semibold text-white">Приложение создаётся</Text><Text className="text-center text-xs leading-4 text-muted">Экран обновится автоматически. Не закрывайте проект, чтобы видеть результат.</Text></View>}
    {project.status === 'failed' && <View className="gap-2 rounded-xl border border-down/40 bg-down/10 px-4 py-4"><Text className="text-sm font-semibold text-down">Проверка нашла проблему</Text><Text className="text-xs leading-4 text-down">{project.generationError || 'Запустите доработку, чтобы исправить приложение.'}</Text></View>}

    <View className="flex-row gap-2"><Metric icon={FileCode2} label="Файлов" value={files.data?.length != null ? String(files.data.length) : '—'} /><Metric icon={Coins} label="Токенов" value={totalTokens != null ? totalTokens.toLocaleString('ru-RU') : '—'} /><Metric icon={Wrench} label="Доработок" value={String(refinements.data?.refinements.length ?? 0)} /></View>

    {project.status === 'ready' && <View className="gap-3 rounded-2xl border border-border bg-card px-4 py-4"><View className="flex-row items-center gap-2"><Sparkles size={17} color="#F5C451" /><Text className="text-sm font-semibold text-white">Доработать приложение</Text></View><Text className="text-xs leading-4 text-muted">Опишите новую функцию, изменение дизайна или исправление. OSGARD 4.0 внесёт изменения, OSGARD 5.0 / 4.8 проверит результат.</Text><TextInput value={prompt} onChangeText={setPrompt} placeholder="Например: добавь экран тарифов и оплату…" placeholderTextColor="#77809A" multiline maxLength={2000} className="min-h-[88px] rounded-xl border border-border bg-bg px-3 py-3 text-white" textAlignVertical="top" /><Pressable onPress={submitRefinement} disabled={!prompt.trim() || refining} className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${prompt.trim() && !refining ? 'bg-gold' : 'bg-border'}`}><Sparkles size={16} color={prompt.trim() && !refining ? '#07111F' : '#77809A'} /><Text className={`font-semibold ${prompt.trim() && !refining ? 'text-bg' : 'text-muted'}`}>{refining ? 'Доработка выполняется…' : 'Запустить доработку'}</Text></Pressable>{error && <Text className="text-sm text-down">{error}</Text>}{refinements.data?.refinementsRemaining != null && <Text className="text-xs text-muted">Бесплатных доработок осталось: {refinements.data.refinementsRemaining}</Text>}</View>}

    {project.liveUrl && <Pressable onPress={() => Linking.openURL(project.liveUrl!)} className="flex-row items-center justify-center gap-2 rounded-xl border border-accent bg-accent/10 px-4 py-3"><ExternalLink size={17} color="#00F0FF" /><Text className="font-semibold text-accent">Открыть приложение</Text></Pressable>}
    {engineering.data?.verdict && <Text className="text-center text-xs text-muted">Инженерный вердикт: {engineering.data.verdict === 'repaired' ? 'исправлено и проверено' : engineering.data.verdict === 'passed' ? 'проверено с первого раза' : engineering.data.verdict}</Text>}
  </ScrollView></SafeAreaView>;
}

function Stage({ label, model, done }: { label: string; model: string; done: boolean }) { return <View className="flex-1 items-center gap-1"><View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: done ? 'rgba(52,211,153,.16)' : 'rgba(245,196,81,.12)' }}>{done ? <CheckCircle2 size={16} color="#34D399" /> : <CircleDashed size={16} color="#F5C451" />}</View><Text className="text-[11px] font-semibold text-white">{label}</Text><Text className="text-center text-[9px] text-muted">{model}</Text></View>; }
function Metric({ icon: Icon, label, value }: { icon: typeof FileCode2; label: string; value: string }) { return <View className="flex-1 items-center gap-1 rounded-xl border border-border bg-card px-2 py-3"><Icon size={16} color="#00F0FF" /><Text className="text-base font-semibold text-white">{value}</Text><Text className="text-[10px] text-muted">{label}</Text></View>; }
