import { useState } from "preact/hooks";
import { AuthError, fetchMe } from "../api";
import { login } from "../session";
import { runSync } from "../sync";

export function Login() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await fetchMe(key.trim());
      login({ ...me, key: key.trim() });
      runSync();
    } catch (err) {
      setError(err instanceof AuthError ? "Unbekannter Schlüssel" : "Server nicht erreichbar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={submit} class="w-full max-w-sm">
        <div class="mb-8 text-center">
          <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-2xl text-white shadow-lg shadow-accent/30">
            🛒
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Einkaufsliste</h1>
          <p class="mt-1 text-sm text-stone-500">Gib deinen Schlüssel ein</p>
        </div>

        <input
          type="password"
          placeholder="Schlüssel"
          autocomplete="current-password"
          value={key}
          onInput={(e) => setKey(e.currentTarget.value)}
          class="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 dark:border-stone-800 dark:bg-stone-900"
        />
        <button
          disabled={busy || !key.trim()}
          class="mt-3 w-full rounded-xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accent-strong active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? "Prüfe…" : "Anmelden"}
        </button>
        {error && <p class="mt-3 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </div>
  );
}
