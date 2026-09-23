// API types shared by server and client. Keep this file dependency-free.

/** Fixed id so clients can use the default list before their first sync. */
export const DEFAULT_LIST_ID = "default";

export interface User {
  id: string;
  name: string;
}

export interface List {
  id: string;
  name: string;
  is_default: boolean;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  rev: number;
}

export interface Item {
  id: string;
  list_id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  category: string | null;
  checked: boolean;
  checked_at: number | null;
  /** Set by the server to whoever checked it off. */
  checked_by: string | null;
  added_by: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  rev: number;
}

/** Fields the client may set. is_default, added_by, checked_by and rev are server-controlled. */
export type ListInput = Pick<List, "id" | "name" | "created_at" | "updated_at" | "deleted_at">;
export type ItemInput = Omit<Item, "added_by" | "checked_by" | "rev">;

export type Op = { table: "lists"; row: ListInput } | { table: "items"; row: ItemInput };

export interface SyncRequest {
  since: number;
  ops: Op[];
}

export interface Rejected {
  table: Op["table"];
  id: string;
  reason: string;
}

export interface SyncResponse {
  rev: number;
  changes: { lists: List[]; items: Item[] };
  /** Ops that can never succeed. The client should drop them from its outbox instead of retrying. */
  rejected: Rejected[];
}

export interface MeResponse {
  user: User;
  users: User[];
}
