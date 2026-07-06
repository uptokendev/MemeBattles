import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function truthy(value: string | undefined) {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function explicitlyFalse(value: string | undefined) {
  return FALSE_VALUES.has(String(value || "").trim().toLowerCase());
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.VITE_DEV_API_PORT || env.API_PORT || env.PORT || "3001";
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;
  const hmrEnabled = !explicitlyFalse(env.VITE_HMR);
  const taggerEnabled = mode === "development" && truthy(env.VITE_ENABLE_LOVABLE_TAGGER);

  console.log(`[vite] proxy /api -> ${apiProxyTarget}`);
  console.log(`[vite] hmr ${hmrEnabled ? "enabled" : "disabled"}`);

  return {
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      hmr: hmrEnabled,
      watch: {
        ignored: [
          "**/.git/**",
          "**/.netlify/**",
          "**/node_modules/**",
          "**/dist/**",
          "**/build/**",
          "**/coverage/**",
          "**/api/**",
          "**/server/**",
          "**/scripts/**",
          "**/*.log",
        ],
      },
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react(), taggerEnabled && componentTagger()].filter(Boolean),
    resolve: {
      alias: [
        {
          find: "@/assets/promotion/warzonehud.png",
          replacement: path.resolve(__dirname, "./src/lib/warzoneHudAsset.ts"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
  };
});
