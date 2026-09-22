import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { attachInstallPromptListener } from "../lib/pwa/install";
import "./index.css";

attachInstallPromptListener();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
