import { DEFAULT_LIST_ID } from "../../shared/types";

export type Route = { name: "home" } | { name: "list"; listId: string } | { name: "history"; listId: string };

export function parseRoute(path: string): Route {
  const m = path.match(/^\/l\/([^/]+)(\/verlauf)?\/?$/);
  if (!m) return { name: "home" };
  const listId = decodeURIComponent(m[1]!);
  if (m[2]) return { name: "history", listId };
  return listId === DEFAULT_LIST_ID ? { name: "home" } : { name: "list", listId };
}

export const listPath = (id: string) => (id === DEFAULT_LIST_ID ? "/" : `/l/${encodeURIComponent(id)}`);
export const historyPath = (id: string) => `/l/${encodeURIComponent(id)}/verlauf`;
