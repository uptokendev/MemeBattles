import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function spaFallback404() {
  return {
    name: "spa-fallback-404",
    closeBundle() {
      const indexFile = path.resolve(__dirname, "dist/index.html");
      const notFoundFile = path.resolve(__dirname, "dist/404.html");
      if (!fs.existsSync(indexFile)) return;
      fs.copyFileSync(indexFile, notFoundFile);
    },
  };
}

const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function explicitlyFalse(value: string | undefined) {
  return FALSE_VALUES.has(String(value || "").trim().toLowerCase());
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.VITE_DEV_API_PORT || env.API_PORT || env.PORT || "3001";
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;
  const hmrEnabled = !explicitlyFalse(env.VITE_HMR);

  if (mode === "production") {
    const leaked = Object.entries(env)
      .filter(([key, value]) => key.startsWith("VITE_") && /\{\{/.test(String(value || "")))
      .map(([key, value]) => `${key}=${String(value).slice(0, 80)}`);
    if (leaked.length) {
      throw new Error(
        `Coolify template vars were not interpolated before the Vite build:\n${leaked.join("\n")}\nPaste real https:// URLs into these VITE_* keys and rebuild.`,
      );
    }
  }

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
    plugins: [
      react(),
      spaFallback404(),
      // @solana/web3.js + wallet serialize need Node Buffer in the browser.
      nodePolyfills({
        include: ["buffer", "process"],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
        {
          find: "buffer",
          replacement: path.resolve(__dirname, "./node_modules/buffer/"),
        },
        {
          find: /^rpc-websockets$/,
          replacement: path.resolve(__dirname, "./src/shims/rpc-websockets.ts"),
        },
        {
          find: /^rpc-websockets\/dist\/lib\/client$/,
          replacement: path.resolve(__dirname, "./src/shims/rpc-websockets-client.ts"),
        },
        {
          find: /^rpc-websockets\/dist\/lib\/client\/websocket(?:\.browser)?$/,
          replacement: path.resolve(__dirname, "./src/shims/rpc-websockets-websocket-browser.ts"),
        },
        {
          find: /^jayson\/lib\/client\/browser(?:\/index(?:\.js)?)?$/,
          replacement: path.resolve(__dirname, "./src/shims/jayson-browser-client.ts"),
        },
      ],
    },
    optimizeDeps: {
      include: [
        "buffer",
        "bn.js",
        "bs58",
        "borsh",
        "bigint-buffer",
        "eventemitter3",
        "@solana/buffer-layout",
      ],
      exclude: [
        "@solana/web3.js",
        "@solana/spl-token",
        "rpc-websockets",
        "rpc-websockets/dist/lib/client",
        "rpc-websockets/dist/lib/client/websocket",
        "rpc-websockets/dist/lib/client/websocket.browser",
        "jayson",
        "jayson/lib/client/browser",
      ],
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    define: {
      global: "globalThis",
    },
  };
});