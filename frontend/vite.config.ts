import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function explicitlyFalse(value: string | undefined) {
  return FALSE_VALUES.has(String(value || "").trim().toLowerCase());
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.VITE_DEV_API_PORT || env.API_PORT || env.PORT || "3001";
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;
  const hmrEnabled = !explicitlyFalse(env.VITE_HMR);

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
          find: "rpc-websockets/dist/lib/client",
          replacement: path.resolve(__dirname, "./src/shims/rpc-websockets-client.ts"),
        },
        {
          find: "rpc-websockets/dist/lib/client/websocket.browser",
          replacement: path.resolve(__dirname, "./src/shims/rpc-websockets-websocket-browser.ts"),
        },
      ],
    },
    optimizeDeps: {
      include: ["buffer"],
      exclude: [
        "@solana/web3.js",
        "@solana/spl-token",
        "rpc-websockets/dist/lib/client",
        "rpc-websockets/dist/lib/client/websocket.browser",
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