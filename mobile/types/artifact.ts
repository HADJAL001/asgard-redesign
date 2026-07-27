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
  /** Метка времени надевания в снаряжение Кузницы, null если артефакт не надет (см. ForgeLoadout ниже). */
  equippedAt?: number | null;
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

/* ---------------- Снаряжение Кузницы (Forge loadout) ----------------
   1:1 с backend/src/lib/forge-loadout.ts и lib/store/osgard-store.tsx (веб).
   Надетые артефакты дают бонус к статам/шансу редкости будущих артефактов
   (см. GET /artifacts/loadout, POST /artifacts/:id/equip|unequip) — эффект
   платформонезависим, поэтому мобилка использует тот же снапшот, что и веб.
------------------------------------------------------------------------ */

export interface EquippedArtifact {
  id: number;
  name: string;
  type: string;
  rarity: string;
  level: number;
  power: number;
}

export interface ForgeBonus {
  equippedCount: number;
  statBonus: number;
  rarityUpChance: number;
}

export interface ForgeDiscount {
  equippedCount: number;
  discountRate: number;
}

export interface ForgeLoadout {
  equipped: EquippedArtifact[];
  bonus: ForgeBonus;
  discount: ForgeDiscount;
  maxSlots: number;
}

export const EMPTY_FORGE_LOADOUT: ForgeLoadout = {
  equipped: [],
  bonus: { equippedCount: 0, statBonus: 0, rarityUpChance: 0 },
  discount: { equippedCount: 0, discountRate: 0 },
  maxSlots: 3,
};
