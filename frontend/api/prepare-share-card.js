import { Resvg } from "@resvg/resvg-js";
import { getQuery, json } from "../server/http.js";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampText(value, max) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function splitName(name) {
  const clean = String(name || "CAMPAIGN NAME").trim().toUpperCase();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [clean, ""];
  if (parts.length === 2) return [parts[0], parts[1]];
  return [parts.slice(0, Math.ceil(parts.length / 2)).join(" "), parts.slice(Math.ceil(parts.length / 2)).join(" ")];
}

function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  try {
    return new URL(raw).toString();
  } catch {
    return "";
  }
}

async function imageToDataUrl(url) {
  const clean = safeUrl(url);
  if (!clean) return "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(clean, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "image/png";
    if (!/^image\//i.test(contentType)) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 2_500_000) return "";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.warn("[prepare-share-card] failed to embed logo", err?.message || err);
    return "";
  }
}

function svgCard(data, logoDataUrl = "") {
  const name = String(data.name || "CAMPAIGN NAME").trim().toUpperCase();
  const ticker = String(data.ticker || "TICKER").replace(/^\$+/, "").toUpperCase().slice(0, 12);
  const chain = String(data.chain || "BNB CHAIN").toUpperCase();
  const status = String(data.status || "DRAFT").toUpperCase();
  const deploys = String(data.deploys || "PREPARE MODE").toUpperCase();
  const recruits = String(data.recruits || "0");
  const heat = String(data.heat || "0%");
  const creator = String(data.creator || "@MEMEWARZONE").toUpperCase();
  const link = String(data.link || `memewar.zone/d/${ticker.toLowerCase()}`);
  const description = clampText(data.description || "Short description here", 86);
  const [line1, line2] = splitName(name);

  const titleSize = line1.length > 14 || line2.length > 14 ? 64 : 78;
  const titleY1 = line2 ? 224 : 252;
  const titleY2 = line2 ? 294 : 0;
  const descY = line2 ? 340 : 296;
  const logoBlock = logoDataUrl
    ? `<image href="${logoDataUrl}" x="55" y="176" width="148" height="148" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid slice"/>
       <circle cx="129" cy="250" r="74" stroke="#28ff93" stroke-opacity="0.55" stroke-width="2" fill="none"/>`
    : `<circle cx="129" cy="250" r="74" fill="url(#orb)"/>
       <circle cx="129" cy="250" r="74" stroke="#28ff93" stroke-opacity="0.35"/>
       <text x="129" y="264" text-anchor="middle" fill="white" font-size="45" font-weight="900" font-family="Arial Black, Arial">${esc(ticker)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1002" height="531" viewBox="0 0 1002 531" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1002" y2="531" gradientUnits="userSpaceOnUse">
      <stop stop-color="#06170d"/>
      <stop offset="0.48" stop-color="#030907"/>
      <stop offset="1" stop-color="#130804"/>
    </linearGradient>
    <radialGradient id="orb" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(126 248) rotate(90) scale(76)">
      <stop stop-color="#20ff90"/>
      <stop offset="0.55" stop-color="#04954d"/>
      <stop offset="1" stop-color="#012913"/>
    </radialGradient>
    <linearGradient id="title" x1="235" y1="170" x2="470" y2="305" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#eaffef"/>
      <stop offset="1" stop-color="#10f58a"/>
    </linearGradient>
    <pattern id="grid" width="33" height="33" patternUnits="userSpaceOnUse">
      <path d="M33 0H0V33" stroke="#13ff82" stroke-opacity="0.055"/>
    </pattern>
    <filter id="greenGlow" x="0" y="0" width="300" height="430" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="0" stdDeviation="18" flood-color="#00ff88" flood-opacity="0.35"/>
    </filter>
    <clipPath id="logoClip"><circle cx="129" cy="250" r="74"/></clipPath>
  </defs>
  <rect width="1002" height="531" fill="url(#bg)"/>
  <rect width="1002" height="531" fill="url(#grid)"/>
  <rect x="0" y="0" width="1002" height="10" fill="#070707"/>
  ${Array.from({ length: 44 }).map((_, i) => `<path d="M${i * 24} 0H${i * 24 + 12}L${i * 24 + 2} 10H${i * 24 - 10}L${i * 24} 0Z" fill="#7b421c" fill-opacity="0.52"/>`).join("")}
  <rect x="0" y="521" width="1002" height="10" fill="#070707"/>
  ${Array.from({ length: 44 }).map((_, i) => `<path d="M${i * 24} 521H${i * 24 + 12}L${i * 24 + 2} 531H${i * 24 - 10}L${i * 24} 521Z" fill="#7b421c" fill-opacity="0.52"/>`).join("")}
  <rect x="53" y="57" width="895" height="355" stroke="#1cff8f" stroke-opacity="0.08"/>
  <line x1="53" y1="412" x2="949" y2="412" stroke="#13ff82" stroke-opacity="0.32"/>
  <g transform="translate(55 53)">
    <path d="M13 0L25 7V21L13 28L1 21V7L13 0Z" stroke="#10f58a" stroke-width="2"/>
    <text x="36" y="18" fill="#dfffee" font-size="11" font-weight="900" font-family="Arial Black, Arial" letter-spacing="1">MEMEWARZONE</text>
  </g>
  <g transform="translate(780 55)">
    <rect width="168" height="28" rx="14" fill="#2b1508" stroke="#f68b2b" stroke-opacity="0.65"/>
    <circle cx="15" cy="14" r="3" fill="#10f58a"/>
    <text x="25" y="18" fill="#f39b3d" font-size="10" font-weight="900" font-family="Arial" letter-spacing="1.6">${esc(status)} · ${esc(deploys)}</text>
  </g>
  <g filter="url(#greenGlow)">${logoBlock}</g>
  <text x="235" y="158" fill="#10f58a" font-size="13" font-weight="900" font-family="Courier New, monospace" letter-spacing="3">// $${esc(ticker)} · ${esc(chain)}</text>
  <text x="235" y="${titleY1}" fill="url(#title)" font-size="${titleSize}" font-weight="900" font-family="Arial Black, Arial" letter-spacing="-3">${esc(line1)}</text>
  ${line2 ? `<text x="235" y="${titleY2}" fill="url(#title)" font-size="${titleSize}" font-weight="900" font-family="Arial Black, Arial" letter-spacing="-3">${esc(line2)}</text>` : ""}
  <text x="235" y="${descY}" fill="#d9d2ca" font-size="20" font-weight="600" font-family="Arial">${esc(description)}</text>
  <text x="54" y="442" fill="#4d8066" font-size="9" font-weight="900" font-family="Courier New" letter-spacing="2">RECRUITS ARMED</text>
  <text x="54" y="471" fill="#10f58a" font-size="29" font-weight="900" font-family="Arial Black, Arial">${esc(recruits)}</text>
  <text x="183" y="442" fill="#4d8066" font-size="9" font-weight="900" font-family="Courier New" letter-spacing="2">HEAT</text>
  <text x="183" y="471" fill="#10f58a" font-size="29" font-weight="900" font-family="Arial Black, Arial">${esc(heat)}</text>
  <text x="265" y="442" fill="#4d8066" font-size="9" font-weight="900" font-family="Courier New" letter-spacing="2">BUILT BY</text>
  <text x="265" y="469" fill="#e9e3db" font-size="20" font-weight="900" font-family="Arial Black, Arial">${esc(creator)}</text>
  <text x="846" y="445" fill="#4d8066" font-size="9" font-weight="900" font-family="Courier New" letter-spacing="2">ARM NOTIFICATION</text>
  <text x="742" y="471" fill="#10f58a" font-size="20" font-weight="900" font-family="Arial Black, Arial">${esc(link)}</text>
</svg>`;
}

async function sendPng(req, res, svg, ticker) {
  const renderer = new Resvg(svg, { fitTo: { mode: "width", value: 1002 }, background: "rgba(0,0,0,0)" });
  const png = Buffer.from(renderer.render().asPng());
  const q = getQuery(req);
  const filename = `memewarzone-${String(ticker || "draft").toLowerCase()}-share-card.png`;
  res.statusCode = 200;
  res.setHeader("content-type", "image/png");
  res.setHeader("content-length", String(png.length));
  res.setHeader("cache-control", "public, max-age=300, s-maxage=300");
  if (String(q.download || "") === "1") {
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  } else {
    res.setHeader("content-disposition", `inline; filename="${filename}"`);
  }
  res.end(png);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const q = getQuery(req);
    const logoDataUrl = await imageToDataUrl(q.logoUrl || q.logo || "");
    const svg = svgCard(q, logoDataUrl);
    if (String(q.format || "png") === "svg") {
      res.statusCode = 200;
      res.setHeader("content-type", "image/svg+xml; charset=utf-8");
      res.setHeader("cache-control", "public, max-age=300, s-maxage=300");
      res.end(svg);
      return;
    }
    return sendPng(req, res, svg, q.ticker || "draft");
  } catch (err) {
    console.error("[prepare-share-card]", err);
    return json(res, 500, { error: "Failed to render share card" });
  }
}
