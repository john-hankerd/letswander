const { getStore } = require("@netlify/blobs");

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let warmCache = null; // { pins, fetchedAt } — survives across invocations on a warm function instance

// Small RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// embedded newlines, and doubled "" as an escaped quote.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function rowsToPins(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  const pins = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = (cells[idx] || "").trim();
    });

    if (!record.id || !record.lat || !record.lng) continue;
    const active = (record.active || "").toLowerCase();
    if (active !== "yes" && active !== "true") continue;

    const lat = parseFloat(record.lat);
    const lng = parseFloat(record.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    pins.push({
      id: record.id,
      name: record.name || "",
      lat: lat,
      lng: lng,
      category: record.category || "",
      description: record.description || "",
      photo_url: record.photo_url || ""
    });
  }
  return pins;
}

exports.handler = async () => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300"
  };

  if (warmCache && Date.now() - warmCache.fetchedAt < CACHE_TTL_MS) {
    return { statusCode: 200, headers, body: JSON.stringify(warmCache.pins) };
  }

  const csvUrl = process.env.GOOGLE_SHEET_CSV_URL;

  // Blobs isn't reliably emulated in every local-dev setup — never let a
  // store problem take down the whole endpoint, just skip the fallback cache.
  function getLastKnownGood() {
    try {
      return getStore("pins-cache").get("latest.json", { type: "json" }).catch(() => null);
    } catch (e) {
      return Promise.resolve(null);
    }
  }
  function saveLastKnownGood(pins) {
    try {
      return getStore("pins-cache").setJSON("latest.json", pins).catch(() => {});
    } catch (e) {
      return Promise.resolve();
    }
  }

  if (!csvUrl) {
    const fallback = await getLastKnownGood();
    return { statusCode: 200, headers, body: JSON.stringify(fallback || []) };
  }

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error("Sheet fetch failed with status " + res.status);
    const text = await res.text();
    const pins = rowsToPins(parseCsv(text));

    warmCache = { pins: pins, fetchedAt: Date.now() };
    await saveLastKnownGood(pins);

    return { statusCode: 200, headers, body: JSON.stringify(pins) };
  } catch (err) {
    console.error("pins function: falling back to last-known-good —", err.message);
    const fallback = await getLastKnownGood();
    return { statusCode: 200, headers, body: JSON.stringify(fallback || []) };
  }
};
