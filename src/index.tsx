import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && new URLSearchParams(location.search).has("replay")) {
  void import("./ReplayLab").then(({ ReplayLab }) => root.render(<ReplayLab />));
} else {
  root.render(<App />);
}
