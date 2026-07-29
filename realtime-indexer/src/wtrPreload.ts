import express from "express";
import { startGraduationReconcilerLoop } from "./graduationReconciler.js";
import { registerMarketContinuityRoutes } from "./marketApi.js";
import { startTopazPoolIndexerLoop } from "./topazPoolIndexer.js";

const WTR_ROUTES_SYMBOL = Symbol.for("memewarzone.wtrMarketRoutesRegistered");
const originalListen = express.application.listen as unknown as (
  this: typeof express.application,
  ...args: any[]
) => any;

express.application.listen = function wtrPatchedListen(this: any, ...args: any[]) {
  if (!this[WTR_ROUTES_SYMBOL]) {
    this[WTR_ROUTES_SYMBOL] = true;
    registerMarketContinuityRoutes(this);
  }
  return originalListen.apply(this, args);
} as any;

startGraduationReconcilerLoop();
startTopazPoolIndexerLoop();
