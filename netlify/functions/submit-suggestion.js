const { getBlobStore: getStore } = require("./_lib/blobStore");
const crypto = require("crypto");

const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB, matches client-side compression target
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const name = (body.name || "").trim().slice(0, 80);
  const description = (body.description || "").trim().slice(0, 1200);
  const category = (body.category || "").trim().slice(0, 40);
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);

  if (!name || !description || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid coordinates" }) };
  }

  const id = crypto.randomUUID();
  let hasPhoto = false;

  if (body.photoBase64 && body.photoType) {
    if (ALLOWED_PHOTO_TYPES.indexOf(body.photoType) === -1) {
      return { statusCode: 400, body: JSON.stringify({ error: "Unsupported photo type" }) };
    }
    const buffer = Buffer.from(body.photoBase64, "base64");
    if (buffer.length > MAX_PHOTO_BYTES) {
      return { statusCode: 400, body: JSON.stringify({ error: "Photo too large" }) };
    }
    try {
      await getStore("suggestion-photos").set(id, buffer, {
        metadata: { contentType: body.photoType }
      });
      hasPhoto = true;
    } catch (e) {
      console.error("submit-suggestion: failed to store photo —", e.message);
    }
  }

  const record = {
    id: id,
    name: name,
    description: description,
    category: category,
    lat: lat,
    lng: lng,
    hasPhoto: hasPhoto,
    status: "pending",
    submittedAt: new Date().toISOString()
  };

  try {
    await getStore("pending-suggestions").setJSON(id, record);
  } catch (e) {
    console.error("submit-suggestion: failed to store suggestion —", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Couldn't save your suggestion. Try again." }) };
  }

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, id: id }) };
};
