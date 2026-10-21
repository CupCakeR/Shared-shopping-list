import type { Database } from "bun:sqlite";
import webpush from "web-push";
import type { PushMessage, PushSubscriptionInput } from "../../shared/types";
import type { VapidConfig } from "./config";
import { DEFAULT_LIST_ID } from "./db";

export type { PushMessage, PushSubscriptionInput };

/** Collects a user's adds this long before telling the others, so a shopping list typed in one go is one push. */
export const ADDED_DELAY_MS = 90_000;
/** Names listed in the "added items" push before it says "and N more". */
const MAX_NAMES = 6;

export interface SendOptions {
  /** Seconds the push service keeps the message for a device that is offline. */
  TTL: number;
  urgency: "normal" | "high";
}

/** Sends one push. Rejects like web-push: with a `statusCode` when the push service said no. */
export type Sender = (sub: PushSubscriptionInput, payload: string, options: SendOptions) => Promise<unknown>;

export function webPushSender(vapid: VapidConfig): Sender {
  const vapidDetails = { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey };
  return (sub, payload, options) => webpush.sendNotification(sub, payload, { ...options, vapidDetails });
}

/**
 * Web Push to everyone but the person who did something. In-memory buffers, one process:
 * pending "added items" pushes are lost on restart, which is fine.
 */
export class Push {
  private pending = new Map<string, { ids: Set<string>; timer: ReturnType<typeof setTimeout> }>();

  private sender: Sender | null;
  /** The VAPID public key clients subscribe with. null: push isn't configured, everything here is a no-op. */
  readonly publicKey: string | null;

  constructor(
    private db: Database,
    config: { publicKey: string; sender: Sender } | null,
    private addedDelayMs = ADDED_DELAY_MS,
  ) {
    this.sender = config?.sender ?? null;
    this.publicKey = config?.publicKey ?? null;
  }

  static fromVapid(db: Database, vapid: VapidConfig | null) {
    return new Push(db, vapid && { publicKey: vapid.publicKey, sender: webPushSender(vapid) });
  }

  get enabled() {
    return this.sender !== null;
  }

  /** A device can switch users (log out, log in as someone else), so the endpoint moves along. */
  subscribe(userId: string, sub: PushSubscriptionInput) {
    this.db
      .query(
        `INSERT INTO push_subs (user_id, endpoint, p256dh, auth, created_at) VALUES ($userId, $endpoint, $p256dh, $auth, $now)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, now: Date.now() });
  }

  /** userId: only drop it if it belongs to that user. Left out when the push service says it's gone. */
  unsubscribe(endpoint: string, userId?: string) {
    this.db
      .query("DELETE FROM push_subs WHERE endpoint = $endpoint AND ($userId IS NULL OR user_id = $userId)")
      .run({ endpoint, userId: userId ?? null });
  }

  /** Items `actorId` just created. The first one starts the timer, later ones join the same push. */
  itemsAdded(actorId: string, ids: string[]) {
    if (!this.sender || ids.length === 0) return;
    const pending = this.pending.get(actorId);
    if (pending) {
      for (const id of ids) pending.ids.add(id);
      return;
    }
    const all = new Set(ids);
    const timer = setTimeout(() => {
      this.pending.delete(actorId);
      void this.sendAdded(actorId, [...all]);
    }, this.addedDelayMs);
    this.pending.set(actorId, { ids: all, timer });
  }

  goingShopping(actorId: string) {
    return this.sendToOthers(
      actorId,
      {
        title: `${this.nameOf(actorId)} geht einkaufen`,
        body: "Schreib jetzt noch schnell drauf, was fehlt.",
        tag: `shopping-${actorId}`,
        url: "/",
      },
      // Only useful right now: drop it if the phone is off for longer than a shopping trip.
      { TTL: 60 * 60, urgency: "high" },
    );
  }

  /** Drops pending pushes without sending them. For tests and shutdown. */
  stop() {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }

  private async sendAdded(actorId: string, ids: string[]) {
    // Whatever was checked off or deleted again in the meantime isn't news anymore.
    const items = this.db
      .query(
        `SELECT i.name, i.list_id, l.name AS list_name FROM items i JOIN lists l ON l.id = i.list_id
         WHERE i.id IN (SELECT value FROM json_each($ids)) AND i.checked = 0 AND i.deleted_at IS NULL AND l.deleted_at IS NULL
         ORDER BY i.created_at`,
      )
      .all({ ids: JSON.stringify(ids) }) as { name: string; list_id: string; list_name: string }[];
    if (items.length === 0) return;

    const names = items.map((i) => (i.list_id === DEFAULT_LIST_ID ? i.name : `${i.name} (${i.list_name})`));
    const shown = names.slice(0, MAX_NAMES).join(", ");
    const more = names.length - MAX_NAMES;
    const lists = new Set(items.map((i) => i.list_id));
    const onlyList = lists.size === 1 ? items[0]!.list_id : DEFAULT_LIST_ID;

    await this.sendToOthers(
      actorId,
      {
        title: `${this.nameOf(actorId)} hat ${items.length === 1 ? "etwas" : `${items.length} Sachen`} hinzugefügt`,
        body: more > 0 ? `${shown} und ${more} weitere` : shown,
        tag: `added-${actorId}`,
        url: onlyList === DEFAULT_LIST_ID ? "/" : `/l/${encodeURIComponent(onlyList)}`,
      },
      { TTL: 12 * 60 * 60, urgency: "normal" },
    );
  }

  private async sendToOthers(actorId: string, message: PushMessage, options: SendOptions) {
    const sender = this.sender;
    if (!sender) return;
    // Users removed from USERS keep their row but lose their key, and shouldn't hear from us anymore.
    const subs = this.db
      .query(
        `SELECT s.endpoint, s.p256dh, s.auth FROM push_subs s JOIN users u ON u.id = s.user_id
         WHERE s.user_id != $actorId AND u.api_key IS NOT NULL`,
      )
      .all({ actorId }) as { endpoint: string; p256dh: string; auth: string }[];

    const payload = JSON.stringify(message);
    await Promise.all(
      subs.map(async ({ endpoint, p256dh, auth }) => {
        try {
          await sender({ endpoint, keys: { p256dh, auth } }, payload, options);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The browser dropped the subscription (uninstalled, permission revoked): forget it.
          if (status === 404 || status === 410) this.unsubscribe(endpoint);
          else console.error(`push to ${new URL(endpoint).host} failed`, status ?? err);
        }
      }),
    );
  }

  private nameOf(userId: string) {
    const row = this.db.query("SELECT name FROM users WHERE id = $userId").get({ userId }) as { name: string } | null;
    return row?.name ?? userId;
  }
}
