import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/main.scss";
const root = document.getElementById("root");
if (!root) throw new Error("Application root not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
