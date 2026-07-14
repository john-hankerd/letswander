const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return { statusCode: 400, body: "Missing id" };
  }

  const result = await getStore("suggestion-photos")
    .getWithMetadata(id, { type: "arrayBuffer" })
    .catch(() => null);

  if (!result || !result.data) {
    return { statusCode: 404, body: "Not found" };
  }

  const contentType = (result.metadata && result.metadata.contentType) || "image/jpeg";
  const buffer = Buffer.from(result.data);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable"
    },
    body: buffer.toString("base64"),
    isBase64Encoded: true
  };
};
