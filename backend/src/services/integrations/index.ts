/* ================================================================
   OSGARD · Интеграционные адаптеры — единая точка входа
   ----------------------------------------------------------------
   Используется агентами (Аналитик/Архитектор/Дизайнер/Фронтенд/Бэкенд/
   Тестировщик/Оптимизатор/Безопасник) для деплоя, публикации в GitHub
   и встраивания Stripe/Supabase/Docker в сгенерированные приложения.
   ================================================================ */

export { deployToVercel, isVercelConfigured } from "./vercel"
export type { DeployToVercelOptions } from "./vercel"
export { createGitHubRepo, isGitHubConfigured } from "./github"
export { generateDockerfile, generateDockerCompose } from "./docker"
export type { ProjectInfo } from "./docker"
export { createStripeIntegration } from "./stripe-codegen"
export type { StripeIntegrationOptions } from "./stripe-codegen"
export { setupSupabase } from "./supabase-codegen"
export type { SupabaseSetupOptions, SupabaseTable, SupabaseColumn } from "./supabase-codegen"
export { validateProjectFiles } from "./validator"
export type { ProjectStack } from "./validator"
export { logIntegrationEvent } from "./logger"
export type { IntegrationPlatform } from "./logger"
export type { FileTree, FileTreeEntry } from "../../types/file-tree"
