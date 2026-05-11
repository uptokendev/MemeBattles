// Obsolete migration preload.
//
// This file used to mount app-gateway routes such as /api/campaigns and
// /api/drafts inside the realtime-indexer service. That was the wrong split:
// realtime-indexer must stay token-side only, while the frontend/app Railway
// service owns app routes.
//
// Keep this file as a no-op safety shim so stale Railway start commands that
// still import ./dist/routeParityPreload.js do not crash or register broken
// routes. The active dev start script imports tokenSidePreload instead.
export {};
