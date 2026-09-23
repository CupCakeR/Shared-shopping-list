import type { Item } from "../../shared/types";

export interface HistoryDay {
  /** "Heute", "Gestern" or e.g. "Montag, 21. September". */
  label: string;
  items: Item[];
}

const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);

function dayLabel(day: number, today: number): string {
  if (day === today) return "Heute";
  if (day === new Date(today).setDate(new Date(today).getDate() - 1)) return "Gestern";
  const sameYear = new Date(day).getFullYear() === new Date(today).getFullYear();
  return new Date(day).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  });
}

/** Items checked off on `listId` (cleared ones included), newest first, grouped by local day. */
export function groupHistory(items: Item[], listId: string, now = Date.now(), limit = 300): HistoryDay[] {
  const bought = items
    .filter((i) => i.list_id === listId && i.checked && i.checked_at !== null)
    .sort((a, b) => b.checked_at! - a.checked_at!)
    .slice(0, limit);

  const today = startOfDay(now);
  const days: HistoryDay[] = [];
  let currentDay: number | undefined;
  for (const item of bought) {
    const day = startOfDay(item.checked_at!);
    if (day !== currentDay) {
      days.push({ label: dayLabel(day, today), items: [] });
      currentDay = day;
    }
    days.at(-1)!.items.push(item);
  }
  return days;
}
