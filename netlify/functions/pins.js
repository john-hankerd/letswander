const { getBlobStore: getStore } = require("./_lib/blobStore");

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

// The map only needs these fields to place a marker and render a popup
// header — `description` is the field driving payload size (60-90 words per
// row), so it's left out of the bulk list and fetched per-pin on demand via
// ?id=, keeping the list response well under Netlify's 6MB sync-function cap
// as the dataset grows across states.
function toLitePin(pin) {
  return {
    id: pin.id,
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    category: pin.category,
    photo_url: pin.photo_url
  };
}

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

// Fetches (and caches) the full pin records, including description — shared
// by both the bulk list (stripped down before returning) and the single-pin
// detail lookup, so a detail request never re-fetches the Google Sheet.
async function getFullPins() {
  if (warmCache && Date.now() - warmCache.fetchedAt < CACHE_TTL_MS) {
    return warmCache.pins;
  }

  const csvUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (!csvUrl) {
    return (await getLastKnownGood()) || [];
  }

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error("Sheet fetch failed with status " + res.status);
    const text = await res.text();
    const pins = rowsToPins(parseCsv(text));

    warmCache = { pins: pins, fetchedAt: Date.now() };
    await saveLastKnownGood(pins);

    return pins;
  } catch (err) {
    console.error("pins function: falling back to last-known-good —", err.message);
    return (await getLastKnownGood()) || [];
  }
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300"
  };

  const id = event && event.queryStringParameters && event.queryStringParameters.id;

  if (id) {
    const pins = await getFullPins();
    const pin = pins.find((p) => p.id === id);
    if (!pin) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "not found" }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify(pin) };
  }

  const pins = await getFullPins();
  return { statusCode: 200, headers, body: JSON.stringify(pins.map(toLitePin)) };
};
