import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { transform } from "esbuild";

const sourceUrl = new URL("./injectedProviderDiscovery.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = await transform(source, {
  format: "esm",
  loader: "ts",
  target: "es2022",
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`;
const { watchInjectedProviderAvailability } = await import(moduleUrl);

class FakeWindow extends EventTarget {
  setTimeout(callback, delay) {
    return globalThis.setTimeout(callback, delay);
  }

  clearTimeout(timer) {
    globalThis.clearTimeout(timer);
  }
}

class FakeDocument extends EventTarget {
  visibilityState = "visible";
}

const wait = (duration) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, duration));

test("discovers immediately, retries, and reacts to delayed MetaMask initialization", async () => {
  const windowObject = new FakeWindow();
  const documentObject = new FakeDocument();
  let checks = 0;

  const stop = watchInjectedProviderAvailability(
    () => {
      checks += 1;
    },
    {
      windowObject,
      documentObject,
      initialDelays: [5, 10],
      wakeDelays: [0, 5],
    },
  );

  assert.equal(checks, 1);
  await wait(20);
  assert.equal(checks, 3);

  windowObject.dispatchEvent(new Event("ethereum#initialized"));
  await wait(15);
  assert.equal(checks, 5);

  stop();
  windowObject.dispatchEvent(new Event("focus"));
  await wait(10);
  assert.equal(checks, 5);
});

test("does not wake providers while the page remains hidden", async () => {
  const windowObject = new FakeWindow();
  const documentObject = new FakeDocument();
  documentObject.visibilityState = "hidden";
  let checks = 0;

  const stop = watchInjectedProviderAvailability(
    () => {
      checks += 1;
    },
    {
      windowObject,
      documentObject,
      initialDelays: [],
      wakeDelays: [0],
    },
  );

  documentObject.dispatchEvent(new Event("visibilitychange"));
  await wait(5);
  assert.equal(checks, 1);
  stop();
});
