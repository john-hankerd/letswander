const { getStore } = require("@netlify/blobs");

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function verifyAdmin(event) {
  var authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
  var match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return false;

  try {
    var record = await getStore("admin-tokens").get(match[1], { type: "json" });
    if (!record) return false;
    return Date.now() - record.createdAt < TOKEN_TTL_MS;
  } catch (e) {
    return false;
  }
}

module.exports = { verifyAdmin: verifyAdmin, TOKEN_TTL_MS: TOKEN_TTL_MS };
