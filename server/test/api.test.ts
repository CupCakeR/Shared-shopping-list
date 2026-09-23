import { beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { parseUsers } from "../src/config";
import { DEFAULT_LIST_ID, openDb, syncUsers } from "../src/db";
import type { Item, List, SyncResponse } from "../src/sync";

const TOM = "tom-key";
const SAM = "sam-key";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const db = openDb(":memory:");
  syncUsers(db, parseUsers(`Tom:${TOM},Sam:${SAM}`));
  app = createApp(db);
});

async function sync(key: string, body: unknown) {
  const res = await app.request("/api/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as SyncResponse & { error?: string } };
}

function item(overrides: Partial<Item> = {}) {
  return {
    id: crypto.randomUUID(),
    list_id: DEFAULT_LIST_ID,
    name: "Milch",
    checked: false,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

describe("auth", () => {
  test("rejects missing and wrong keys", async () => {
    expect((await app.request("/api/me")).status).toBe(401);
    expect((await app.request("/api/me", { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
  });

  test("/me returns the user and everyone else", async () => {
    const res = await app.request("/api/me", { headers: { Authorization: `Bearer ${TOM}` } });
    expect(await res.json()).toEqual({
      user: { id: "tom", name: "Tom" },
      users: [
        { id: "sam", name: "Sam" },
        { id: "tom", name: "Tom" },
      ],
    });
  });

  test("health needs no auth", async () => {
    expect((await app.request("/api/health")).status).toBe(200);
  });
});

describe("sync", () => {
  test("initial pull contains the default list", async () => {
    const { json } = await sync(TOM, { since: 0, ops: [] });
    expect(json.changes.lists).toHaveLength(1);
    expect(json.changes.lists[0]).toMatchObject({ id: DEFAULT_LIST_ID, is_default: true, deleted_at: null });
    expect(json.rev).toBeGreaterThan(0);
  });

  test("items pushed by one user reach the other, with added_by set by the server", async () => {
    const first = await sync(TOM, { since: 0, ops: [] });
    const milk = item();
    await sync(TOM, { since: first.json.rev, ops: [{ table: "items", row: { ...milk, added_by: "sam" } }] });

    const { json } = await sync(SAM, { since: first.json.rev, ops: [] });
    expect(json.changes.items).toHaveLength(1);
    expect(json.changes.items[0]).toMatchObject({ id: milk.id, name: "Milch", added_by: "tom", checked: false });
    expect(json.changes.lists).toHaveLength(0);
  });

  test("last write wins on updated_at, and the loser gets the winning version back", async () => {
    const milk = item();
    const { json: afterCreate } = await sync(TOM, { since: 0, ops: [{ table: "items", row: milk }] });

    await sync(SAM, { since: afterCreate.rev, ops: [{ table: "items", row: { ...milk, checked: true, updated_at: 3000 } }] });
    // Tom was offline and renamed it earlier than Sam's check: his edit loses.
    const { json } = await sync(TOM, {
      since: afterCreate.rev,
      ops: [{ table: "items", row: { ...milk, name: "Hafermilch", updated_at: 2000 } }],
    });

    expect(json.changes.items).toHaveLength(1);
    expect(json.changes.items[0]).toMatchObject({ name: "Milch", checked: true, updated_at: 3000 });
  });

  test("a stale op is corrected even when the client cursor is already past it", async () => {
    const milk = item();
    await sync(TOM, { since: 0, ops: [{ table: "items", row: milk }] });
    await sync(SAM, { since: 0, ops: [{ table: "items", row: { ...milk, name: "Brot", updated_at: 5000 } }] });
    const { json: tomPull } = await sync(TOM, { since: 0, ops: [] });

    const { json } = await sync(TOM, {
      since: tomPull.rev,
      ops: [{ table: "items", row: { ...milk, name: "Käse", updated_at: 4000 } }],
    });
    expect(json.changes.items.map((i) => i.name)).toEqual(["Brot"]);
  });

  test("deletes are tombstones and still sync", async () => {
    const milk = item();
    await sync(TOM, { since: 0, ops: [{ table: "items", row: milk }] });
    await sync(TOM, { since: 0, ops: [{ table: "items", row: { ...milk, deleted_at: 2000, updated_at: 2000 } }] });
    const { json } = await sync(SAM, { since: 0, ops: [] });
    expect(json.changes.items[0]).toMatchObject({ id: milk.id, deleted_at: 2000 });
  });

  test("the default list cannot be deleted but can be renamed", async () => {
    const { json } = await sync(TOM, {
      since: 0,
      ops: [{ table: "lists", row: { id: DEFAULT_LIST_ID, name: "Einkauf", created_at: 0, updated_at: Date.now(), deleted_at: 123 } }],
    });
    const list = json.changes.lists.find((l: List) => l.id === DEFAULT_LIST_ID);
    expect(list).toMatchObject({ name: "Einkauf", deleted_at: null, is_default: true });
  });

  test("a list and its items created offline sync in one request", async () => {
    const list = { id: crypto.randomUUID(), name: "Baumarkt", created_at: 1000, updated_at: 1000 };
    const screws = item({ list_id: list.id, name: "Schrauben" });
    const { json } = await sync(TOM, {
      since: 0,
      ops: [
        { table: "lists", row: list },
        { table: "items", row: screws },
      ],
    });
    expect(json.rejected).toEqual([]);
    expect(json.changes.lists.map((l: List) => l.id)).toContain(list.id);
    expect(json.changes.items[0]).toMatchObject({ list_id: list.id, name: "Schrauben" });
  });

  test("items for unknown lists are rejected, not retried forever", async () => {
    const orphan = item({ list_id: "nope" });
    const { status, json } = await sync(TOM, { since: 0, ops: [{ table: "items", row: orphan }] });
    expect(status).toBe(200);
    expect(json.rejected).toEqual([{ table: "items", id: orphan.id, reason: "unknown list nope" }]);
  });

  test("replaying the same op is harmless", async () => {
    const milk = item();
    await sync(TOM, { since: 0, ops: [{ table: "items", row: milk }] });
    const { json } = await sync(TOM, { since: 0, ops: [{ table: "items", row: milk }] });
    expect(json.changes.items).toHaveLength(1);
  });

  test("far-future timestamps are clamped", async () => {
    const milk = item({ updated_at: Date.now() + 365 * 24 * 3600_000 });
    const { json } = await sync(TOM, { since: 0, ops: [{ table: "items", row: milk }] });
    expect(json.changes.items[0]!.updated_at).toBeLessThan(Date.now() + 10 * 60_000);
  });

  test("a cursor ahead of the server returns everything", async () => {
    const { json } = await sync(TOM, { since: 999_999, ops: [] });
    expect(json.changes.lists).toHaveLength(1);
  });

  test("malformed requests get a 400 with a useful message", async () => {
    const bad = await sync(TOM, { since: 0, ops: [{ table: "items", row: { id: "x" } }] });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toContain("ops[0].row.list_id");

    const res = await app.request("/api/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOM}` },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("config", () => {
  test("parses USERS", () => {
    expect(parseUsers(" Tom:abc , Sam:d:ef ")).toEqual([
      { id: "tom", name: "Tom", key: "abc" },
      { id: "sam", name: "Sam", key: "d:ef" },
    ]);
  });

  test("rejects bad USERS", () => {
    expect(() => parseUsers("")).toThrow();
    expect(() => parseUsers("Tom")).toThrow();
    expect(() => parseUsers("Tom:a,tom:b")).toThrow("duplicate name");
    expect(() => parseUsers("Tom:a,Sam:a")).toThrow("duplicate key");
  });
});
