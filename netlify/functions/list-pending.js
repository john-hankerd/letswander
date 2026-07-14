const { getStore } = require("@netlify/blobs");
const { verifyAdmin } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (!(await verifyAdmin(event))) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const store = getStore("pending-suggestions");
  const { blobs } = await store.list();

  const records = await Promise.all(
    blobs.map((b) => store.get(b.key, { type: "json" }).catch(() => null))
  );

  const pending = records
    .filter((r) => r && r.status === "pending")
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      lat: r.lat,
      lng: r.lng,
      submittedAt: r.submittedAt,
      photoUrl: r.hasPhoto ? "/.netlify/functions/get-photo?id=" + r.id : null
    }));

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending) };
};
