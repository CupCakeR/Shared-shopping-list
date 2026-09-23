import { render } from "preact";
import { ListView } from "./components/ListView";
import { Login } from "./components/Login";
import { session } from "./session";
import { initLocal, syncStatus } from "./state";
import { runSync } from "./sync";
import "./style.css";

function App() {
  return session.value ? <ListView /> : <Login />;
}

await initLocal();
render(<App />, document.getElementById("app")!);

runSync();
window.addEventListener("online", () => runSync());
window.addEventListener("offline", () => (syncStatus.value = "offline"));
// Phones kill background connections, so catch up whenever the app comes back.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") runSync();
});
