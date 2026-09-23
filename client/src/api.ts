import type { MeResponse, SyncRequest, SyncResponse } from "../../shared/types";

/** The server rejected the key. */
export class AuthError extends Error {}

async function request<T>(path: string, key: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (res.status === 401) throw new AuthError("invalid key");
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchMe = (key: string) => request<MeResponse>("/me", key);

export const postSync = (key: string, body: SyncRequest) =>
  request<SyncResponse>("/sync", key, { method: "POST", body: JSON.stringify(body) });
