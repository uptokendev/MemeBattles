export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function badMethod(res) {
  json(res, 405, { error: "Method not allowed" });
}

export async function readJson(req) {
  if (req.body != null) return req.body;

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
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