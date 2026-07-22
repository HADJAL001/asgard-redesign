import {
  LayoutDashboard,
  Hammer,
  ShoppingBag,
  TrendingUp,
  Lock,
  FolderKanban,
  Beer,
  Sparkle,
  BarChart3,
  Users,
  UserRound,
  Wallet,
  Trophy,
  Medal,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

export type PlatformHotspot = {
  key: string
  href: string
  label: string
  description: string
  lat: number
  lon: number
  color: string
  Icon: LucideIcon
}

/** Равномерное распределение точек по сфере (golden-angle), см. holographic-globe.tsx. */
function fibonacciSpherePoint(index: number, total: number) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const y = 1 - (index / (total - 1)) * 1.6 - 0.2 // сжимаем к экватору, не прячем точки у полюсов
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = golden * index
  const x = Math.cos(theta) * r
  const z = Math.sin(theta) * r
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI)
  const lon = Math.atan2(z, x) * (180 / Math.PI)
  return { lat, lon }
}

type HotspotDef = Omit<PlatformHotspot, "lat" | "lon">

const BASE_SECTIONS: HotspotDef[] = [
  { key: "map.dashboard", href: "/dashboard", label: "Панель", description: "Общая сводка аккаунта", color: "#00D4FF", Icon: LayoutDashboard },
  { key: "map.forge", href: "/forge", label: "Кузница", description: "Создание проектов с ИИ", color: "#E74C3C", Icon: Hammer },
  { key: "map.marketplace", href: "/marketplace", label: "Маркет", description: "Магазин артефактов", color: "#F5A623", Icon: ShoppingBag },
  { key: "map.exchange", href: "/exchange", label: "Биржа", description: "Обмен и торговля", color: "#2ECC71", Icon: TrendingUp },
  { key: "map.stake", href: "/stake", label: "Стейкинг", description: "Заморозка активов", color: "#7B2FBE", Icon: Lock },
  { key: "map.projects", href: "/projects", label: "Проекты", description: "Ваши созданные проекты", color: "#00D4FF", Icon: FolderKanban },
  { key: "map.community", href: "/community", label: "Таверна", description: "Сообщество архитекторов", color: "#F5A623", Icon: Beer },
  { key: "map.twin", href: "/twin", label: "Близнец", description: "Ваш ИИ-двойник", color: "#7B2FBE", Icon: Sparkle },
  { key: "map.economy", href: "/economy", label: "Экономика", description: "Статистика платформы", color: "#2ECC71", Icon: BarChart3 },
  { key: "map.referral", href: "/referral", label: "Рефералы", description: "Приглашай друзей", color: "#00D4FF", Icon: Users },
  { key: "map.profile", href: "/profile", label: "Профиль", description: "Настройки аккаунта", color: "#6A6A8A", Icon: UserRound },
  { key: "map.wallet", href: "/wallet", label: "Кошелёк", description: "Баланс и переводы", color: "#F5A623", Icon: Wallet },
  { key: "map.hall-of-fame", href: "/hall-of-fame", label: "Зал славы", description: "Лучшие творения", color: "#FFD700", Icon: Trophy },
  { key: "map.leaderboard", href: "/leaderboard", label: "Рейтинг", description: "Рейтинг архитекторов", color: "#E74C3C", Icon: Medal },
]

const ADMIN_SECTION: HotspotDef = {
  key: "map.admin",
  href: "/admin",
  label: "Админ",
  description: "Панель администратора",
  color: "#E74C3C",
  Icon: ShieldCheck,
}

export function getPlatformSections(isAdmin: boolean): PlatformHotspot[] {
  const defs = isAdmin ? [...BASE_SECTIONS, ADMIN_SECTION] : BASE_SECTIONS
  return defs.map((def, i) => ({ ...def, ...fibonacciSpherePoint(i, defs.length) }))
}
