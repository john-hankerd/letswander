const { getBlobStore: getStore } = require("./_lib/blobStore");
const { verifyAdmin } = require("./_lib/auth");

function tsvEscape(value) {
  return String(value == null ? "" : value).replace(/[\t\n\r]/g, " ");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (!(await verifyAdmin(event))) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const id = body.id;
  const action = body.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing id or action" }) };
  }

  const suggestionsStore = getStore("pending-suggestions");
  const record = await suggestionsStore.get(id, { type: "json" });
  if (!record) {
    return { statusCode: 404, body: JSON.stringify({ error: "Suggestion not found" }) };
  }

  if (action === "reject") {
    await suggestionsStore.delete(id);
    if (record.hasPhoto) {
      await getStore("suggestion-photos").delete(id).catch(() => {});
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }

  // approve
  record.status = "approved";
  await suggestionsStore.setJSON(id, record);

  const photoUrl = record.hasPhoto
    ? "https://" + event.headers.host + "/.netlify/functions/get-photo?id=" + id
    : "";

  const copyRow = [
    id,
    tsvEscape(record.name),
    record.lat,
    record.lng,
    tsvEscape(record.category),
    tsvEscape(record.description),
    photoUrl,
    "yes"
  ].join("\t");

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, copyRow: copyRow })
  };
};
