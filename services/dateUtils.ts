const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_WEEK_START = 0;

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return new Date('');
  return new Date(year, month - 1, day);
}

export function toLocalDayKey(value: Date | string): string {
  if (value instanceof Date) {
    return formatLocalDate(value);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatLocalDate(parsed);
}

export function getWeekStart(date: Date, weekStartsOn: number = DEFAULT_WEEK_START): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const dayOfWeek = start.getDay();
  const diffToStart = (dayOfWeek - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - diffToStart);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getWeekRange(weeksAgo: number = 0, weekStartsOn: number = DEFAULT_WEEK_START) {
  const today = new Date();
  const start = getWeekStart(today, weekStartsOn);
  start.setDate(start.getDate() - weeksAgo * 7);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getDayKeysForWeek(start: Date): string[] {
  const weekStart = new Date(start);
  weekStart.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return toLocalDayKey(date);
  });
}

export function getDayKeysForRange(start: Date, end: Date): string[] {
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(0, 0, 0, 0);
  if (rangeStart > rangeEnd) return [];
  const keys: string[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    keys.push(toLocalDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function getWeekdayLabels(weekStartsOn: number = DEFAULT_WEEK_START): string[] {
  return [...WEEKDAY_LABELS.slice(weekStartsOn), ...WEEKDAY_LABELS.slice(0, weekStartsOn)];
}

export function bucketByLocalDay<T extends { date: string; total: number }>(
  items: T[],
  dayKeys?: Set<string>
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = toLocalDayKey(item.date);
    if (!key) continue;
    if (dayKeys && !dayKeys.has(key)) continue;
    totals.set(key, (totals.get(key) || 0) + Number(item.total || 0));
  }
  return totals;
}
