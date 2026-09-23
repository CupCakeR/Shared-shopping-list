import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { parseUsers } from "../src/config";
import { DEFAULT_LIST_ID, openDb, syncUsers } from "../src/db";
import { Events } from "../src/events";
import type { Item, List, SyncResponse } from "../src/sync";

const TOM = "tom-key";
const SAM = "sam-key";

let app: ReturnType<typeof createApp>;
let events: Events;

beforeEach(() => {
  const db = openDb(":memory:");
  syncUsers(db, parseUsers(`Tom:${TOM},Sam:${SAM}`));
  events = new Events();
  app = createApp(db, { events });
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

  test("checked_by is whoever checked it, survives later edits and clears on uncheck", async () => {
    const milk = item();
    await sync(TOM, { since: 0, ops: [{ table: "items", row: milk }] });
    const checked = { ...milk, checked: true, checked_at: 2000, updated_at: 2000 };

    let { json } = await sync(SAM, { since: 0, ops: [{ table: "items", row: checked }] });
    expect(json.changes.items[0]).toMatchObject({ checked_by: "sam", added_by: "tom" });

    ({ json } = await sync(TOM, { since: 0, ops: [{ table: "items", row: { ...checked, name: "Hafermilch", updated_at: 3000 } }] }));
    expect(json.changes.items[0]).toMatchObject({ checked_by: "sam", name: "Hafermilch" });

    ({ json } = await sync(TOM, { since: 0, ops: [{ table: "items", row: { ...checked, checked: false, checked_at: null, updated_at: 4000 } }] }));
    expect(json.changes.items[0]).toMatchObject({ checked_by: null });
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

  test("a list's icon syncs and can be reset to automatic", async () => {
    const list = { id: crypto.randomUUID(), name: "Supermarkt", icon: "rewe", created_at: 1000, updated_at: 1000 };
    let { json } = await sync(TOM, { since: 0, ops: [{ table: "lists", row: list }] });
    expect(json.changes.lists.find((l: List) => l.id === list.id)).toMatchObject({ icon: "rewe" });

    ({ json } = await sync(SAM, { since: 0, ops: [{ table: "lists", row: { ...list, icon: null, updated_at: 2000 } }] }));
    expect(json.changes.lists.find((l: List) => l.id === list.id)).toMatchObject({ icon: null });
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

describe("events", () => {
  /** Opens the stream and returns a reader for its SSE messages. */
  async function connect(key: string) {
    const res = await app.request("/api/events", { headers: { Cookie: `key=${key}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    return { next: async () => (await reader.read()).value, close: () => reader.cancel() };
  }

  test("needs a key, from the cookie", async () => {
    expect((await app.request("/api/events")).status).toBe(401);
    expect((await app.request("/api/events", { headers: { Cookie: "key=nope" } })).status).toBe(401);
    expect((await app.request(`/api/events?key=${TOM}`)).status).toBe(401);
    // Only the event stream takes the key from the cookie.
    expect((await app.request("/api/me", { headers: { Cookie: `key=${TOM}` } })).status).toBe(401);
  });

  test("sends the current rev on connect and after changes", async () => {
    const { json } = await sync(TOM, { since: 0, ops: [] });
    const stream = await connect(SAM);
    expect(await stream.next()).toBe(`event: changed\ndata: ${json.rev}\n\n`);

    const res = await sync(TOM, { since: json.rev, ops: [{ table: "items", row: item() }] });
    expect(await stream.next()).toBe(`event: changed\ndata: ${res.json.rev}\n\n`);
    await stream.close();
  });

  test("stays quiet when a sync changes nothing", async () => {
    const stream = await connect(SAM);
    await stream.next();
    const published: number[] = [];
    events.subscribe((rev) => published.push(rev));
    await sync(TOM, { since: 0, ops: [] });
    expect(published).toEqual([]);
    await stream.close();
  });

  test("unsubscribes when the client disconnects", async () => {
    const stream = await connect(TOM);
    await stream.next();
    expect(events.size).toBe(1);
    await stream.close();
    await Bun.sleep(0);
    expect(events.size).toBe(0);
  });
});

describe("client files", () => {
  let client: ReturnType<typeof createApp>;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "client-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html>app");
    writeFileSync(join(dir, "sw.js"), "// sw");
    writeFileSync(join(dir, "assets", "index-abc.js"), "// js");
    const db = openDb(":memory:");
    syncUsers(db, parseUsers(`Tom:${TOM}`));
    client = createApp(db, { clientDir: dir });
  });

  test("serves files, hashed assets cached for good, the rest revalidated", async () => {
    const asset = await client.request("/assets/index-abc.js");
    expect(await asset.text()).toBe("// js");
    expect(asset.headers.get("Cache-Control")).toContain("immutable");

    const sw = await client.request("/sw.js");
    expect(await sw.text()).toBe("// sw");
    expect(sw.headers.get("Cache-Control")).toBe("no-cache");
  });

  test("answers app routes with index.html", async () => {
    for (const path of ["/", "/l/some-list", "/l/some-list/verlauf"]) {
      const res = await client.request(path);
      expect(await res.text()).toBe("<!doctype html>app");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
    }
  });

  test("leaves /api alone", async () => {
    expect((await client.request("/api/nope")).status).toBe(401);
    expect((await client.request("/api/health")).status).toBe(200);
    expect(await (await client.request("/api/me", { headers: { Authorization: `Bearer ${TOM}` } })).json()).toMatchObject({
      user: { id: "tom" },
    });
  });

  test("doesn't serve files outside the directory", async () => {
    const res = await client.request("/../../etc/passwd");
    expect(await res.text()).not.toContain("root:");
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
