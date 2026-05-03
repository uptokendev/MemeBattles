/**
 * Application Entry Point
 * Initializes and mounts the React application to the DOM
 */

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/mwz-hud.css";
import "./styles/tactical-command-ui.css";
import "./styles/tactical-hero.css";
import "./styles/tactical-command-refine.css";
import "./styles/tactical-card-backgrounds.css";
import "./styles/tactical-hero-overlay-fix.css";

createRoot(document.getElementById("root")!).render(<App />);
