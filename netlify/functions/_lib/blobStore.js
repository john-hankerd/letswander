const { getStore } = require("@netlify/blobs");

// Netlify's automatic Blobs context isn't being injected for this site (a
// known Netlify-side issue on some freshly-created sites), so we fall back
// to explicit manual configuration per Netlify's documented workaround.
function getBlobStore(name) {
  var siteID = process.env.BLOBS_SITE_ID;
  var token = process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: name, siteID: siteID, token: token });
  }
  return getStore(name);
}

module.exports = { getBlobStore: getBlobStore };
