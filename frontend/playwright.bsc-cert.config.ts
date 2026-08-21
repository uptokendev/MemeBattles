import { defineConfig } from "@playwright/test";

const skipBuild = process.env.PLAYWRIGHT_SKIP_WEBSERVER_BUILD === "1";
const dashboard = String(process.env.DASHBOARD_BASE_URL || "").replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /bsc-graduation-postgrad\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: dashboard || "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "on",
  },
  webServer: dashboard
    ? undefined
    : {
        command: skipBuild ? "node e2e/preview-spa.mjs" : "npx vite build && node e2e/preview-spa.mjs",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        env: {
          ...process.env,
          VITE_ENABLE_POSTGRAD: "true",
          VITE_ENABLE_UNIFIED_MARKET_CHART: "1",
          VITE_ENABLE_TOPAZ_MARKET_API: "1",
          VITE_ENABLE_WAR_ROOM: "true",
          VITE_DEFAULT_CHAIN_ID: "97",
          VITE_FACTORY_ADDRESS_97: "0x77Af7634837643d4f93d1086b492571268b30B5F",
          VITE_TOKEN_API_BASE: process.env.TOKEN_API_BASE || "https://memebattles-production-dca0.up.railway.app",
          VITE_REALTIME_API_BASE: process.env.TOKEN_API_BASE || "https://memebattles-production-dca0.up.railway.app",
          VITE_PUBLIC_RPC_97: process.env.BSC_TESTNET_RPC || "",
          VITE_BSC_TESTNET_RPC: process.env.BSC_TESTNET_RPC || "",
        },
      },
});
