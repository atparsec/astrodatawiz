import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initializeIcons } from "@fluentui/react";
import "./index.css";
import App from "./App.tsx";

initializeIcons();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
