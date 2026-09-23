import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { currentRev } from "../db";
import type { Env } from "../env";

/** Comment line every so often, so proxies and Bun's idle timeout don't drop a quiet stream. */
export const HEARTBEAT_MS = 25_000;

/**
 * SSE nudges: `event: changed` with the current rev as data, once on connect and after every write.
 * The client pulls the rows itself via /sync, and skips the nudge if it is already at that rev.
 */
export const events = (c: Context<Env>) => {
  // nginx buffers responses by default, which would hold the events back.
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    const send = (rev: number) => void stream.writeSSE({ event: "changed", data: String(rev) });
    const unsubscribe = c.get("events").subscribe(send);
    const heartbeat = setInterval(() => void stream.write(": ping\n\n"), HEARTBEAT_MS);
    const closed = new Promise<void>((resolve) => stream.onAbort(resolve));

    send(currentRev(c.get("db")));
    await closed;
    clearInterval(heartbeat);
    unsubscribe();
  });
};
