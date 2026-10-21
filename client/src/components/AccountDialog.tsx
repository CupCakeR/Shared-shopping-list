import { useState } from "preact/hooks";
import { type PushState, disablePush, enablePush, goingShopping, pushKey, pushState } from "../push";
import { logout, session } from "../session";
import { ConfirmDialog, Dialog, primaryButton, secondaryButton } from "./Dialog";

const pushHint: Record<PushState, string> = {
  loading: "",
  on: "Du bekommst Bescheid, wenn jemand etwas hinzufügt oder einkaufen geht.",
  off: "Bekomm Bescheid, wenn jemand etwas hinzufügt oder einkaufen geht.",
  denied: "Im Browser blockiert. Erlaube Benachrichtigungen für die Seite in den Einstellungen.",
  install: "Füge die App erst zum Home-Bildschirm hinzu: Teilen → Zum Home-Bildschirm.",
  unsupported: "Dieser Browser kann keine Benachrichtigungen.",
  unavailable: "Auf dem Server nicht eingerichtet.",
  dev: "Nur im Build, der Dev-Server hat keinen Service Worker.",
};

/** Opened from the avatar: notifications, "going shopping" and logout. */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const name = session.value?.user.name ?? "";
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  if (confirmingLogout) {
    return (
      <ConfirmDialog
        title="Abmelden?"
        confirmLabel="Abmelden"
        onConfirm={async () => {
          await disablePush().catch(() => {});
          logout();
        }}
        onClose={() => setConfirmingLogout(false)}
      >
        Du bist als {name} angemeldet. Danach brauchst du deinen Schlüssel wieder.
      </ConfirmDialog>
    );
  }

  return (
    <Dialog title={`Hallo ${name}`} onClose={onClose}>
      <NotificationsToggle />
      <ShoppingButton />
      <div class="mt-5 flex justify-end gap-2">
        <button onClick={() => setConfirmingLogout(true)} class={secondaryButton}>
          Abmelden
        </button>
        <button onClick={onClose} class={primaryButton}>
          Fertig
        </button>
      </div>
    </Dialog>
  );
}

function NotificationsToggle() {
  const state = pushState.value;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const on = state === "on";
  const usable = state === "on" || (state === "off" && !!pushKey.value);

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      await (on ? disablePush() : enablePush());
    } catch (err) {
      console.error(err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div id="push-label" class="font-medium">
          Benachrichtigungen
        </div>
        <p class="mt-0.5 text-sm text-stone-500">
          {failed ? "Hat nicht geklappt. Bist du online?" : state === "off" && !pushKey.value ? "Gerade nicht erreichbar, bist du online?" : pushHint[state]}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-labelledby="push-label"
        disabled={!usable || busy}
        onClick={toggle}
        class={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-accent" : "bg-stone-300 dark:bg-stone-700"}`}
      >
        <span class={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function ShoppingButton() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  // The others get the push no matter what this device can do, only the server has to be set up.
  const available = !!pushKey.value;

  async function send() {
    setStatus("sending");
    try {
      await goingShopping();
      setStatus("sent");
    } catch (err) {
      console.error(err);
      setStatus("failed");
    }
  }

  return (
    <div class="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
      <button onClick={send} disabled={!available || status === "sending" || status === "sent"} class={`${primaryButton} w-full`}>
        {status === "sent" ? "Bescheid gesagt ✓" : "Ich gehe einkaufen 🛒"}
      </button>
      <p class="mt-2 text-center text-sm text-stone-500">
        {status === "failed"
          ? "Hat nicht geklappt. Bist du online?"
          : available
            ? "Sagt den anderen Bescheid, damit sie noch schnell etwas draufschreiben."
            : pushKey.value === undefined
              ? "Gerade nicht erreichbar, bist du online?"
              : "Geht nur, wenn Benachrichtigungen auf dem Server eingerichtet sind."}
      </p>
    </div>
  );
}
