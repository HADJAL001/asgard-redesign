const DAY_MS = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type DateGroupLabel = 'Сегодня' | 'Вчера' | 'Эта неделя' | 'Ранее';

export function dateGroupLabel(createdAt: number, now: number = Date.now()): DateGroupLabel {
  const todayStart = startOfDay(now);
  const itemStart = startOfDay(createdAt);
  const diffDays = Math.round((todayStart - itemStart) / DAY_MS);

  if (diffDays <= 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays <= 7) return 'Эта неделя';
  return 'Ранее';
}

const GROUP_ORDER: DateGroupLabel[] = ['Сегодня', 'Вчера', 'Эта неделя', 'Ранее'];

/** Groups a chronologically-mixed list into labeled date buckets, preserving each item's original order. */
export function groupByDate<T>(items: T[], getCreatedAt: (item: T) => number, now: number = Date.now()) {
  const buckets = new Map<DateGroupLabel, T[]>();
  for (const item of items) {
    const label = dateGroupLabel(getCreatedAt(item), now);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(item);
  }
  return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
    label,
    items: buckets.get(label)!,
  }));
}
