# Shared Shopping List — Plan

A shared shopping list for two people. Browser-based PWA (iOS + Android, desktop works too),
real-time, works offline in the store, self-hosted on Unraid via Docker.

## Stack

| Layer    | Choice                                  |
|----------|-----------------------------------------|
| Runtime  | Bun                                     |
| Server   | Hono (routing, auth middleware, `streamSSE`) |
| DB       | SQLite via `bun:sqlite`, WAL mode       |
| Realtime | Server-Sent Events                      |
| Push     | Web Push (`web-push` lib, VAPID)        |
| Client   | Preact + Vite, PWA (service worker, IndexedDB) |
| Deploy   | Single Docker container behind existing nginx reverse proxy |

The Bun server serves the built static client and the API from one process.

## Architecture

```
phone (PWA)                                   server (Bun + Hono)
┌──────────────────────────┐                  ┌──────────────────────────┐
│ UI (Preact)              │                  │ /api/sync   (POST)       │
│ IndexedDB: lists, items  │ ── POST /sync ─▶ │ /api/events (SSE)        │
│ outbox: pending ops      │ ◀─ changes ───── │ /api/push/subscribe      │
│ EventSource /events      │ ◀─ "changed" ─── │ /api/shopping (notify)   │
│ service worker (cache,   │ ◀─ web push ──── │ push debouncer           │
│   push handler)          │                  │ SQLite (WAL)             │
└──────────────────────────┘                  └──────────────────────────┘
```

- The client always reads/writes **local state first** (IndexedDB), then syncs. The UI never waits on the network.
- SSE only carries "something changed" nudges; the client then pulls via `/sync`.
- When the app is backgrounded the SSE connection dies. On `visibilitychange` → visible, the client runs a full sync.
  Push notifications cover the gap while the app is closed.

## Auth

- Users are defined via env, e.g. `USERS="tom:<key>,other:<key>"`, and seeded into `users` on startup.
- Client stores the key in `localStorage` and sends `Authorization: Bearer <key>` on every request.
  SSE: `EventSource` can't set headers, so the client puts the key in a cookie scoped to `/api/events`.
- Simple key-entry screen **inside the installed PWA** (iOS keeps Safari and home-screen storage separate).

## Data model

```sql
CREATE TABLE users (
  id        TEXT PRIMARY KEY,         -- e.g. "tom"
  name      TEXT NOT NULL,
  api_key   TEXT NOT NULL UNIQUE
);

CREATE TABLE lists (
  id          TEXT PRIMARY KEY,       -- uuid, client-generated
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,       -- client timestamp, used for LWW
  deleted_at  INTEGER,                -- tombstone
  rev         INTEGER NOT NULL        -- server-assigned change counter
);

CREATE TABLE items (
  id          TEXT PRIMARY KEY,       -- uuid, client-generated
  list_id     TEXT NOT NULL REFERENCES lists(id),
  name        TEXT NOT NULL,
  quantity    TEXT,
  note        TEXT,
  category    TEXT,
  checked     INTEGER NOT NULL DEFAULT 0,
  checked_at  INTEGER,
  added_by    TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  rev         INTEGER NOT NULL
);
CREATE INDEX items_rev  ON items(rev);
CREATE INDEX items_list ON items(list_id);

CREATE TABLE push_subs (
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);  -- global rev counter, schema version
```

- **Default list**: created on first start with `is_default = 1`. It cannot be deleted. The app always opens into it,
  and other lists are optional and tucked away.
- **Autocomplete**: distinct item names from history (including checked/deleted), ranked by frequency.
  Computed client-side from the local cache so it works offline.

## Sync protocol

Single endpoint, push + pull in one round trip:

```
POST /api/sync
{
  "since": 1234,                 // last server rev this client has seen
  "ops": [                       // outbox, in order
    { "table": "items", "row": { "id": "…", "name": "Milch", "checked": 1, "updated_at": 1737…, … } },
    …
  ]
}
→
{
  "rev": 1250,                   // new cursor
  "changes": { "lists": [ … ], "items": [ … ] }   // all rows with rev > since
}
```

- Ops are **full-row upserts**. Server applies each op only if `op.updated_at >= stored.updated_at`
  (last-write-wins per row; per-field LWW only if it turns out to matter).
- Every accepted write bumps the global `rev` and stamps the row → pull cursor is server-ordered,
  immune to phone clock skew.
- Deletes are upserts with `deleted_at` set (tombstones). Checked+deleted items remain for autocomplete.
- Client removes ops from the outbox only after a successful response. Ops are idempotent, so retries are safe.
- After a sync that changed anything, the server broadcasts `event: changed` over SSE to all other connections.

## Notifications

- **VAPID** keypair generated once and provided via env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
  Never regenerate — it invalidates all subscriptions.
- Client subscribes via `PushManager.subscribe()` using the public key → `POST /api/push/subscribe` stores a row.
- Server sends to each of the recipient's subscriptions. On 404/410 it deletes the subscription.
- **Debounce**: in-memory buffer per (actor → recipient). The first new item starts a ~90 s timer, and later adds within
  the window are collected. When the timer fires, one push goes out: "Tom added 5 items: Milch, Brot, …".
  Losing the buffer on restart is acceptable.
- **"Going shopping"**: `POST /api/shopping` → immediate push to the other person ("Tom is going shopping, add stuff now").
- Pushes never go to the actor themselves.
- iOS: push only works when installed to the home screen (iOS 16.4+).

## Offline / PWA

- `manifest.webmanifest` (standalone display, icons) + service worker (e.g. `vite-plugin-pwa` / Workbox).
- App shell is precached, so the app opens with no signal.
- IndexedDB holds lists, items, the outbox and the sync cursor.
- Sync triggers: app start, `online` event, `visibilitychange` → visible, SSE `changed` event, after a local write (debounced ~500 ms).

## Deployment

- Multi-stage Dockerfile: build the client with Vite → `oven/bun` runtime image serving `dist/` + API.
- Volume: mount a **directory** (e.g. `/mnt/user/appdata/shopping-list` → `/data`). SQLite creates
  `-wal`/`-shm` files next to the DB.
- Env: `USERS`, `VAPID_*`, `DB_PATH=/data/db.sqlite`, `PORT`, `CLIENT_DIR` (built client, default `./dist`).
- nginx location for SSE:
  ```nginx
  location /api/events {
      proxy_pass http://unraid-host:PORT;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_buffering off;
      proxy_cache off;
      proxy_read_timeout 1h;
  }
  ```
- Server sends an SSE comment heartbeat every ~25 s to keep the connection alive through proxies.

### Image and Unraid

- `.github/workflows/image.yml`: every push to `master` runs typecheck + tests, then pushes
  `ghcr.io/cupcaker/shared-shopping-list:latest` (plus a `sha-…` tag per commit to roll back to).
- Unraid → Docker → Add Container:
  - Repository: `ghcr.io/cupcaker/shared-shopping-list:latest`
  - Port: container `3000` → a free host port
  - Path: container `/data` → `/mnt/user/appdata/shopping-list`
  - Variable: `USERS` (the `VAPID_*` ones once push exists)
- Updating: "Check for Updates" on the Docker tab, then apply the update.
- Phones need HTTPS for the service worker (and later push), so use the app through the nginx proxy, not the bare port.

## Milestones

1. **Core**: server, schema, auth, default list, item CRUD on the client with IndexedDB, `/sync`.
2. **Realtime + offline**: SSE nudges, outbox/retry, service worker, installable PWA.
3. **Docker**: Dockerfile, env config, nginx snippet, deploy to Unraid.
4. **Push**: VAPID, subscriptions, debounced "added items" push, "going shopping" button.
5. **Extras**: multiple lists UI, categories, autocomplete ranking, undo.

## Out of scope

Backups, real security (key auth only), more than a handful of users, UI/UX polish (for now).
