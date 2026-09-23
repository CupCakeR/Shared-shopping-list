import { render } from "preact";
import { HistoryView } from "./components/HistoryView";
import { HomeView } from "./components/HomeView";
import { StoreView } from "./components/StoreView";
import { Login } from "./components/Login";
import { session } from "./session";
import { route } from "./router";
import { initLocal, syncStatus } from "./state";
import { startLiveUpdates } from "./events";
import { runSync } from "./sync";
import "./style.css";

function App() {
  if (!session.value) return <Login />;
  const r = route.value;
  if (r.name === "history") return <HistoryView listId={r.listId} />;
  if (r.name === "list") return <StoreView listId={r.listId} />;
  return <HomeView />;
}

await initLocal();
render(<App />, document.getElementById("app")!);

runSync();
startLiveUpdates();
window.addEventListener("online", () => runSync());
window.addEventListener("offline", () => (syncStatus.value = "offline"));
// Phones kill background connections, so catch up whenever the app comes back.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") runSync();
});
