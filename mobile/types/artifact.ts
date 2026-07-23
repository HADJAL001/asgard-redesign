/** 1:1 с backend/src/routes/artifacts.routes.ts и lib/store/osgard-store.tsx (веб) */
export type ArtifactRarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export interface OsgardArtifact {
  id: number;
  projectId: number | null;
  name: string;
  type: string;
  rarity: ArtifactRarity | string;
  level: number;
  power: number;
  defense: number;
  magic: number;
  speed: number;
  status: "kept" | "listed" | "sold";
  views24h: number;
  supply: number;
  price: number;
  listCurrency: string;
  visualEffect?: string | null;
  /** Поля AI-генерации (POST /artifacts/generate-ai) — null/undefined для вручную скованных артефактов. */
  description?: string | null;
  lore?: string | null;
  aiVisual?: string | null;
  source?: string | null;
  createdAt: number;
}

export interface OsgardWallet {
  timecoin: number;
  credits?: number;
  shards?: number;
  crystals?: number;
  /** USD-баланс для маркет-покупки/продажи TimeCoin (POST /tc-market/buy, /sell). */
  cash_usd?: number;
}

export const ARTIFACT_THEMES = [
  { key: "scifi", label: "Sci-Fi", hint: "Тема: научная фантастика, технологии будущего." },
  { key: "fantasy", label: "Fantasy", hint: "Тема: фэнтези, магия и мифические существа." },
  { key: "cyberpunk", label: "Cyberpunk", hint: "Тема: киберпанк, неон и мегаполисы будущего." },
  { key: "steampunk", label: "Steampunk", hint: "Тема: стимпанк, механизмы на паровой тяге." },
] as const;

export type ArtifactThemeKey = (typeof ARTIFACT_THEMES)[number]["key"];

/** Информационный клиентский счётчик "N/3 сегодня" — сервер дневной лимит на артефакты не применяет. */
export const DAILY_AI_GENERATION_SOFT_LIMIT = 3;
