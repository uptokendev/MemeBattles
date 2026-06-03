/**
 * Application Entry Point
 * Initializes and mounts the React application to the DOM
 */

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/mwz-hud.css";
import "./styles/tactical-command-ui.css";
import "./styles/page-density-fixes.css";
import "./styles/card-cleanup.css";
import "./styles/prepare-title-fix.css";

createRoot(document.getElementById("root")!).render(<App />);
