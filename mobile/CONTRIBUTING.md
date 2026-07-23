# Contributing

## Стек

Expo SDK 52, Expo Router v4 (файловая маршрутизация), TypeScript, NativeWind v4 (Tailwind для RN), Zustand (стейт), React Query v5 (серверный кэш, персист через AsyncStorage).

Перед правками — прочитайте `AGENTS.md`: Expo API мог измениться со времени обучения модели, сверяйтесь с https://docs.expo.dev/versions/v52.0.0/.

## Структура

- `app/` — экраны (файловая маршрутизация Expo Router). Группы `(auth)` и `(tabs)`.
- `components/ui/` — переиспользуемый UI-кит (`Button`, `Input`, `Card`, `Spinner`, `Modal`, `Toast`). Новый переиспользуемый визуальный примитив — сюда, а не в `components/`.
- `components/` — компоненты конкретных экранов.
- `store/` — Zustand-сторы (auth, biometric, guest, onboarding).
- `lib/*-api.ts` — один файл на бэкенд-домен, тонкая обёртка над `apiClient` (разворачивает ответ до нужной формы, без бизнес-логики).
- `hooks/use*Query.ts` / `use*Mutation.ts` — один файл на хук. Каждый query-хук экспортирует именованную константу `*_QUERY_KEY`; мутации ссылаются на чужие ключи через импорт constants, а не через дублирование строк.
- `types/` — общие типы, зеркалирующие контракты бэкенда (`../backend`) и веб-приложения (`../lib/store/osgard-store.tsx`).

## Конвенции

- Стили — только через `className` (NativeWind), кроме случаев, требующих динамических значений (например, цвет по редкости) — там `style` поверх `className`, как в `Card`.
- Токены — `expo-secure-store`, всё остальное (не секретное) — `AsyncStorage`.
- Новый API-эндпоинт: сначала сверьте контракт с веб-реализацией в `../lib/store/osgard-store.tsx`, чтобы типы запроса/ответа совпадали 1:1.
- Не дублируйте уже существующий query-key — импортируйте константу из соответствующего хука.

## Проверка перед PR

```bash
npm install
npx tsc --noEmit
npx expo start
```
