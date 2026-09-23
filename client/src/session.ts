import { signal } from "@preact/signals";
import type { MeResponse } from "../../shared/types";

export interface Session extends MeResponse {
  key: string;
}

const STORAGE_KEY = "session";

function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export const session = signal<Session | null>(load());

export function login(s: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  session.value = s;
}

/** Forgets the key only. Local data stays, it's shared between both users anyway. */
export function logout() {
  localStorage.removeItem(STORAGE_KEY);
  session.value = null;
}
