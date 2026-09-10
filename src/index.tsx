import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && new URLSearchParams(location.search).has("replay")) {
  void import("./ReplayLab").then(({ ReplayLab }) => root.render(<ReplayLab />));
} else {
  root.render(<App />);
}

// Production only: avoid caching the Vite development server or replay tooling.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => {
      console.warn('Offline installation unavailable', error);
    });
  });
}
