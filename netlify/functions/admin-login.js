const { getBlobStore: getStore } = require("./_lib/blobStore");
const crypto = require("crypto");

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

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: "Admin login isn't configured yet" }) };
  }

  if (body.password !== adminPassword) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect password" }) };
  }

  const token = crypto.randomBytes(24).toString("hex");
  await getStore("admin-tokens").setJSON(token, { createdAt: Date.now() });

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token }) };
};
