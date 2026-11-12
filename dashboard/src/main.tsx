import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { EMBED } from "./mode";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

// Lets the phone install Opus. Only works on https or localhost, and is skipped in the standalone preview file.
// (Skipped when embedded in another site: a service worker inside someone else's iframe only causes surprises.)
if (!EMBED && "serviceWorker" in navigator && window.isSecureContext && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
