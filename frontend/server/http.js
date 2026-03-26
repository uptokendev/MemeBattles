export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function badMethod(res) {
  json(res, 405, { error: "Method not allowed" });
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function parseJsonLikeBody(value) {
  if (value == null) return null;

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const raw = Buffer.from(value).toString("utf8");
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (typeof value === "string") {
    if (!value.trim()) return {};
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && typeof value.body === "string") {
      return parseJsonLikeBody(value.body);
    }
    if (keys.length === 0) return null;
    return value;
  }

  return null;
}

export async function readJson(req) {
  const direct = parseJsonLikeBody(req.body);
  if (direct != null) return direct;

  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getQuery(req) {
  const u = new URL(req.url, "http://localhost");
  const out = {};
  for (const [k, v] of u.searchParams.entries()) out[k] = v;
  return out;
}

export function isAddress(v) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(v ?? ""));
}
