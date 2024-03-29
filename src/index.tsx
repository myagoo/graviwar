import { createRoot } from "react-dom/client";
import { GameDemo } from "./GameDemo";
import "./index.css";
import reportWebVitals from "./reportWebVitals";

const root = document.createElement("div");
root.id = "root";
document.body.appendChild(root);

createRoot(root).render(<GameDemo />);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
