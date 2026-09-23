import type { Item } from "../../shared/types";

/** How fast old usage stops counting: an item added 30 days ago counts half as much as one added today. */
const HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 3600_000;

export const normalize = (name: string) => name.trim().toLocaleLowerCase("de");

export interface Suggestion {
  /** Spelling of the most recent use. */
  name: string;
  score: number;
}

/**
 * Item names from history (every list, including checked and deleted items), ranked by
 * recency-weighted frequency. Uses on `listId` count double. Names currently open on
 * `listId` are left out, since they're already on the list.
 */
export function rankHistory(items: Item[], listId: string, now = Date.now()): Suggestion[] {
  const open = new Set(items.filter((i) => i.list_id === listId && !i.checked && !i.deleted_at).map((i) => normalize(i.name)));
  const byName = new Map<string, Suggestion & { last: number }>();

  for (const item of items) {
    const key = normalize(item.name);
    if (!key || open.has(key)) continue;
    const ageDays = Math.max(0, now - item.created_at) / DAY_MS;
    const weight = 0.5 ** (ageDays / HALF_LIFE_DAYS) * (item.list_id === listId ? 2 : 1);
    const entry = byName.get(key);
    if (!entry) {
      byName.set(key, { name: item.name.trim(), score: weight, last: item.created_at });
    } else {
      entry.score += weight;
      if (item.created_at > entry.last) {
        entry.last = item.created_at;
        entry.name = item.name.trim();
      }
    }
  }

  return [...byName.values()].sort((a, b) => b.score - a.score).map(({ name, score }) => ({ name, score }));
}

/**
 * Filters ranked history by what's typed. Name prefix matches come first, then matches at the
 * start of a later word ("milch" → "Hafermilch" doesn't match, "milch" → "Frische Milch" does),
 * then any substring. An exact match is left out, the user already typed it.
 */
export function suggest(ranked: Suggestion[], query: string, limit = 6): Suggestion[] {
  const q = normalize(query);
  if (!q) return ranked.slice(0, limit);

  const tiers: Suggestion[][] = [[], [], []];
  for (const s of ranked) {
    const name = normalize(s.name);
    if (name === q) continue;
    if (name.startsWith(q)) tiers[0]!.push(s);
    else if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) tiers[1]!.push(s);
    else if (name.includes(q)) tiers[2]!.push(s);
  }
  return tiers.flat().slice(0, limit);
}
