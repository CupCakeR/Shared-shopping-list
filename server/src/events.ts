/** Fans "the data changed, now at rev N" out to every open /api/events stream. In-memory, one process. */
export class Events {
  private listeners = new Set<(rev: number) => void>();

  subscribe(listener: (rev: number) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  publish(rev: number) {
    for (const listener of this.listeners) listener(rev);
  }

  get size() {
    return this.listeners.size;
  }
}
