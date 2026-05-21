const STORAGE_KEY = "mwz:postgrad:mock-activity";
const UPDATE_EVENT = "mwz:postgrad-mock-activity-updated";
const MAX_ENTRIES = 12;

export type MockActivityScope = "arena" | "battle" | "war_room" | "war_pool" | "events" | "league" | "system";

export type MockActivityEntry = {
  id: string;
  scope: MockActivityScope;
  label: string;
  detail?: string;
  createdAt: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function dispatchActivityUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function readActivityLog(): MockActivityEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeActivityLog(next: MockActivityEntry[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ENTRIES)));
  dispatchActivityUpdate();
}

export function getMockActivityLog() {
  return readActivityLog();
}

export function subscribeToMockActivityRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function pushMockActivity(scope: MockActivityScope, label: string, detail?: string) {
  if (!isBrowser()) return;
  const entry: MockActivityEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    scope,
    label,
    detail,
    createdAt: new Date().toISOString(),
  };
  writeActivityLog([entry, ...readActivityLog()]);
}

export function resetMockActivityRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  dispatchActivityUpdate();
}
