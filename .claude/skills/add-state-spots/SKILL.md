---
name: add-state-spots
description: Research unique, historic, and unusual real-world places for a US state and add them to Let's Wander's Google Sheet (the source of truth for the map's pins). Use this whenever John asks to "add [state] spots," "find more locations for the map," "do [state] like we did Michigan," or otherwise wants the Let's Wander map populated with more places for a state. Covers the full pipeline: web research across multiple sources, geocoding, deduplication against the live sheet, a safety checkpoint before touching live data, and a reliable (non-browser-automated) way to get the rows into the actual Sheet.
---

# Add State Spots to Let's Wander

Let's Wander's map is powered by one Google Sheet ("Let's Wander - Spots"). Its
published-to-web CSV feeds `netlify/functions/pins.js`, which the app fetches
on load. Adding spots for a new state means: research real places, turn them
into rows matching the sheet's schema, and get those rows into the sheet
safely. This skill is the playbook for that whole pipeline, refined from
actually doing it for Michigan (90 spots, one pass).

Sheet schema, in column order:
```
id, name, lat, lng, category, description, photo_url, active
```
Categories in use: Historic Landmark, Ghost Town, Lighthouse, Church, Historic
House, School, Bridge, Museum, Local Curiosity, Natural Wonder. Reuse these
rather than inventing new ones unless a spot genuinely doesn't fit any of
them.

## Step 1: Research

Cast a wide net, then curate hard. Two source types work well together:

- **"Lost In [State]"-style blogs.** Search for the state's version of
  lostinmichigan.net — most states have at least one blog like this covering
  ghost towns, old churches, roadside oddities, abandoned buildings. Pull
  their category/archive pages (churches, schools, ghost towns, lighthouses,
  etc.) to build a list of candidate article URLs.
- **Newspaper and roadside-attraction round-ups.** Search local newspaper
  sites for "[state] hidden gems / unusual historic places," and check
  `https://www.roadsideamerica.com/location/<state-abbr>/all` for well-known
  landmarks. This catches famous spots the blogs might miss and keeps the
  final list from being 100% one author's taste.

Once you have a candidate URL list (Michigan landed around 70-90 after
curation), dispatch several **general-purpose Agent subagents in parallel**,
each handling a batch of ~15-20 URLs. Give each agent this extraction job per
URL:

- **name** — a short, clean place name, not the blog post's clickbait title
- **town_or_location** — specific enough to geocode (town + county at
  minimum; add a park or street name if the location is otherwise too vague)
- **description** — 2-4 sentences, written in the agent's own words. Never
  copy the source text verbatim — paraphrase. This matters both for
  copyright and because the app's tone should be consistent across sources.
- **category** — pick the best fit from the list above

Tell each agent to skip anything that isn't a specific, visitable physical
place (general essays, privacy-redacted locations, permanently-closed
businesses) and to note what it skipped and why.

Curate the combined results before moving on: drop anything joke-y or
low-quality, merge obvious duplicates (the same site written up in two
articles), and sanity-check that the mix isn't overwhelmingly one category or
one corner of the state.

## Step 2: Geocode

Consolidate everything into one local JSON list, then geocode each entry with
Nominatim:

```
https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=<location>
```

Send a real `User-Agent` header and wait ~1.1 seconds between requests — this
respects Nominatim's usage policy and avoids getting rate-limited mid-run.
Write this as a small Node script rather than doing it by hand; see the
pattern below.

```js
async function geocode(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(query);
  const res = await fetch(url, { headers: { "User-Agent": "LetsWanderStateResearch/1.0 (contact: john.hankerd@gmail.com)" } });
  const results = await res.json();
  return results.length ? { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) } : null;
}
// then: await geocode(spot.location); await sleep(1100); between each call
```

For failures, retry once with a more specific query (add a landmark or
street name), then fall back to just the nearest town's coordinates if that
still fails — town-level precision beats no pin at all for an obscure spot
with no public address.

After geocoding, sanity-check the results:
- Any **positive longitude** in the US is wrong (should always be negative)
  — fix the sign rather than dropping the spot.
- Note any spots that landed on **identical coordinates** as another spot —
  usually means Nominatim resolved both to the same town centroid because
  neither location string was specific enough. This is an acceptable
  limitation for genuinely obscure places, but worth mentioning to John in
  the summary rather than passing off as exact.

## Step 3: Dedupe IDs against the live sheet

Fetch the sheet's published CSV (ask John for the URL if you don't already
have it saved, or check `netlify/functions/pins.js`'s env var reference /
`.env` for `GOOGLE_SHEET_CSV_URL`) and collect every existing `id` in column
A. Slugify each new spot's name the same way the app does (lowercase,
non-alphanumeric runs collapsed to a single hyphen), and if a slug collides
with an existing id, append `-2`, `-3`, etc. until it's unique.

## Step 4: Summarize for John, then proceed — don't ask permission first

John has said not to hold up on deploying/adding updated data — proceed
straight to Step 5 by default, no "should I go ahead?" question. Still give
him a clear summary as you go (not a request for a decision, just visibility
into what's happening):

- Total count, broken down by category
- Which sources contributed (e.g. "~60 from lostinmichigan.net, ~20 from
  roadside-attraction research")
- Any data-quality caveats from Step 2 (town-level-only precision, duplicate
  coordinates, anything you're less confident about)

The one exception: if something in the batch looks genuinely off — a spot
you're unsure is real, a description that came out wrong, a cluster of
low-quality results — flag that specific thing rather than silently
including it. That's a judgment call about quality, not a permission gate.

## Step 5: Get the rows into the sheet — do NOT browser-automate the live paste

This is the part that went wrong the first time, so read this carefully.
Note this step isn't about asking John's permission (Step 4 already covered
that) — John doing the final paste himself is purely a technical
workaround for browser automation being unreliable against Google Sheets,
not a trust checkpoint. If a more reliable write path becomes available
later, this step should change; until then, treat it as a hard requirement.

**Do not try to paste directly into the live, already-published Google
Sheet via browser automation.** In practice this failed repeatedly and once
briefly corrupted a header cell before being caught and fixed. The specific
failure modes:

- Google Sheets is a heavy enough web app that screenshot and
  script-injection calls routinely time out or silently return stale state.
- Real OS-level clipboard copy/paste (Ctrl+C / Ctrl+V) only works when the
  actual browser window has real OS-level foreground focus — and that focus
  can silently stop being true mid-session (e.g. the user's screen locks, or
  they switch to another window) with no clear signal that it happened.
- A blind paste with no reliable way to visually confirm the target cell
  risks overwriting the header row or existing data before you notice.

One specific recipe *did* work once — Name Box click, type the target cell
(e.g. `A415`) via a real keypress, Enter, then Ctrl+V — but don't trust it
blindly even if you use it. Always verify the Name Box's actual value via a
DOM query before pasting (`document.querySelector('.waffle-name-box,
[aria-label="Name box"]').value`), and always verify the result afterward by
re-fetching the published CSV and checking the row count — a screenshot
alone is not enough, since screenshot capture can itself silently fail.

**The reliable approach — use this by default:**

1. Build the new rows as a CSV file locally (header row + all new spots,
   properly quoted).
2. Upload it with the Google Drive connector's `create_file` tool, setting
   `contentMimeType: "text/csv"` — this auto-converts to a real Google
   Sheet. Title it something like `Let's Wander - <State> Spots to Review`.
   This tool doesn't touch the browser at all and has been completely
   reliable, unlike anything routed through browser automation.
3. Give John this exact two-step, under-30-seconds instruction:
   - Open the review sheet, click cell **A2**, then **Ctrl+Shift+End**
     followed by **Ctrl+C** to select and copy every data row.
   - Open the live "Let's Wander - Spots" sheet, click the first empty
     cell in column A, and press **Ctrl+V**.

This puts the one truly irreversible-if-botched action (writing to the live,
published sheet) in John's own hands, where a mistake is trivially
undoable by him, instead of in a browser-automation path that has repeatedly
proven unreliable for this specific app.

## Step 6: Verify

Once John confirms he's pasted the rows:

1. Re-fetch the published CSV and confirm the row count is exactly
   `old count + new count`.
2. Hit the live pins function and confirm the pin count matches and there's
   no error: `curl https://letswanderusa.com/.netlify/functions/pins`
3. If the app is also mirrored under a subpath proxy (e.g.
   `40thfloor.com/letswander`), check that URL too — it's a separate
   deployment path and can fail independently of the main domain (see the
   gotcha below).

## Gotchas worth knowing (not part of the main flow, but bit us once)

These are two real bugs that were found and fixed while building this
pipeline. They're not part of adding spots, but if a future "can't load
spots" report comes in, check these first before assuming it's a data
problem:

- **Service worker over-matching.** `sw.js` used to strip `"./"` from each
  shell-file path and check `url.endsWith(strippedPath)` — but
  `"./".replace("./", "")` is `""`, and every string `.endsWith("")`. That
  made the service worker intercept *every* request, including the live
  pins fetch. Fixed by comparing resolved pathnames instead. If pins ever
  seem to load a stale/cached version, check `sw.js`'s matching logic first.
- **Root-absolute API paths break under a subpath proxy.** Client code used
  to fetch `/.netlify/functions/pins` (leading slash = resolves from the
  domain root). That's fine on `letswanderusa.com`, but under
  `40thfloor.com/letswander/`, a leading-slash path resolves to
  `40thfloor.com/.netlify/...`, which 404s. Fixed by using relative paths
  (`./.netlify/...` from the app root, `../.netlify/...` from one level
  deep like `/admin/`). Any new client-side fetch call added to this app
  should use a relative path for the same reason.
