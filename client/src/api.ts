import type { MeResponse, PushInfo, PushSubscriptionInput, SyncRequest, SyncResponse } from "../../shared/types";

/** The server rejected the key. */
export class AuthError extends Error {}

async function request<T>(path: string, key: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (res.status === 401) throw new AuthError("invalid key");
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const fetchMe = (key: string) => request<MeResponse>("/me", key);

export const postSync = (key: string, body: SyncRequest) =>
  request<SyncResponse>("/sync", key, { method: "POST", body: JSON.stringify(body) });

export const fetchPushInfo = (key: string) => request<PushInfo>("/push", key);

export const postPushSubscribe = (key: string, sub: PushSubscriptionInput) =>
  request<void>("/push/subscribe", key, { method: "POST", body: JSON.stringify(sub) });

export const postPushUnsubscribe = (key: string, endpoint: string) =>
  request<void>("/push/unsubscribe", key, { method: "POST", body: JSON.stringify({ endpoint }) });

export const postShopping = (key: string) => request<void>("/shopping", key, { method: "POST" });
