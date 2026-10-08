/*
  Source search for the "Add source" view: results appear while typing.

  /api/search returns news outlets (plus a Google News feed for the query) or
  YouTube channels (backend/routes/sources.py). A short pause after the last
  keystroke avoids one request per letter.
*/

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

let pendingTimer = null;
let currentRequest = null;


function hostOf(value) {
  try {
    return new URL(value, window.location.href).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

/** A search result in the shape the view uses. */
function resultFromBackend(item, platform) {
  const url = (item.url || "").trim();
  if (!url) {
    return null;
  }

  return {
    platform,
    url,
    feedUrl: item.feed_url || "",
    title: item.title || hostOf(url),
    subtitle: item.description || "",
    thumbnail: item.thumbnail || "",
  };
}

async function requestResults(platform, query, signal) {
  const params = new URLSearchParams({ platform, q: query });

  let response;
  try {
    response = await fetch(`/api/search?${params}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    throw new Error("Search needs the Vao2 server, which isn't answering. Add the URL by hand below.");
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.detail || `Search failed (error ${response.status}).`);
  }

  const results = [];
  for (const item of payload.results || []) {
    const result = resultFromBackend(item, platform);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Search after a short pause. `onChange(status, results, error)` is called with
 * status "idle" (query too short), "loading", "ready", "empty" or "error".
 */
export function scheduleSearch(platform, query, onChange) {
  window.clearTimeout(pendingTimer);

  if (query.length < MIN_QUERY_LENGTH) {
    currentRequest?.abort();
    onChange("idle", [], "");
    return;
  }

  pendingTimer = window.setTimeout(async () => {
    // A newer search replaces the one still running.
    currentRequest?.abort();
    currentRequest = new AbortController();

    onChange("loading", [], "");

    try {
      const results = await requestResults(platform, query, currentRequest.signal);
      onChange(results.length ? "ready" : "empty", results, "");
    } catch (error) {
      if (error.name !== "AbortError") {
        onChange("error", [], error.message);
      }
    }
  }, DEBOUNCE_MS);
}
