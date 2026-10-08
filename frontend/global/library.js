/*
  The user's source library: categories and sources, as stored in the database.

  Loaded once on startup from /api/sources, then shared by:
  - the "Add source" view, which changes it;
  - the feed, which shows each article's category and filters by category.

  A change is shown immediately and sent to the backend in the background.
  After every change a "librarychange" event is fired on window.
*/

import { fetchJson } from "./api.js";


export const GENERAL_CATEGORY = { id: "general", name: "General" };

let categories = [{ ...GENERAL_CATEGORY }];
let sources = [];


/* ---- reading ------------------------------------------------------------ */

export function getCategories() {
  return categories;
}

export function getSources() {
  return sources;
}

export function categoryName(categoryId) {
  const category = categories.find((item) => item.id === categoryId);
  return category ? category.name : GENERAL_CATEGORY.name;
}

function sameAddress(first, second) {
  return normalizedUrl(first) === normalizedUrl(second);
}

function normalizedUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

export function hasSource(url) {
  return sources.some((source) => sameAddress(source.url, url));
}


/* ---- loading ------------------------------------------------------------ */

/** The backend's source, in the shape the interface uses. */
function sourceFromBackend(row) {
  return {
    id: row.id,
    platform: row.platform,
    categoryId: row.category_id || GENERAL_CATEGORY.id,
    title: row.title,
    subtitle: row.subtitle || "",
    url: row.url,
    feedUrl: row.feed_url || "",
    thumbnail: row.thumbnail || "",
    addedAt: row.added_at,
  };
}

export async function loadLibrary() {
  const payload = await fetchJson("/api/sources");

  if (payload.categories.length) {
    categories = payload.categories;
  }

  // Oldest first: the order in which the user added them.
  const loadedSources = payload.sources.map(sourceFromBackend);
  loadedSources.sort((first, second) => first.addedAt.localeCompare(second.addedAt));
  sources = loadedSources;

  announceChange();
}


/* ---- changes ------------------------------------------------------------ */

function announceChange() {
  window.dispatchEvent(new CustomEvent("librarychange"));
}

/** Send a change to the backend; the interface has already been updated. */
async function saveToBackend(path, method, body) {
  try {
    await fetchJson(`/api${path}`, { method, body });
  } catch (error) {
    console.warn("[Library] The backend did not save this change.", error);
  }
}

function newId(prefix) {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${time}${random}`;
}

/** Create a category, or return the existing one with that name. */
export function createCategory(name) {
  const label = name.trim();
  if (!label) {
    return null;
  }

  const existing = categories.find((category) => {
    return category.name.toLowerCase() === label.toLowerCase();
  });
  if (existing) {
    return existing;
  }

  const category = { id: newId("cat"), name: label };
  categories.push(category);

  void saveToBackend("/categories", "POST", { id: category.id, name: category.name });
  announceChange();

  return category;
}

/** Delete a category; its sources move back to "General". */
export function deleteCategory(categoryId) {
  if (categoryId === GENERAL_CATEGORY.id) {
    return;
  }

  for (const source of sources) {
    if (source.categoryId === categoryId) {
      source.categoryId = GENERAL_CATEGORY.id;
    }
  }

  categories = categories.filter((category) => category.id !== categoryId);

  void saveToBackend(`/categories/${encodeURIComponent(categoryId)}`, "DELETE");
  announceChange();
}

/** Add a source to a category. Returns false when it is already in the library. */
export function addSource(candidate, categoryId) {
  if (hasSource(candidate.url)) {
    return false;
  }

  const source = {
    ...candidate,
    id: newId("src"),
    categoryId,
    addedAt: new Date().toISOString(),
  };
  sources.push(source);

  void saveToBackend("/sources", "POST", {
    id: source.id,
    platform: source.platform,
    url: source.url,
    feed_url: source.feedUrl,
    title: source.title,
    subtitle: source.subtitle,
    thumbnail: source.thumbnail,
    category_id: source.categoryId,
  });
  announceChange();

  return true;
}

export function removeSource(sourceId) {
  sources = sources.filter((source) => source.id !== sourceId);

  void saveToBackend(`/sources/${encodeURIComponent(sourceId)}`, "DELETE");
  announceChange();
}

export function moveSource(sourceId, categoryId) {
  const source = sources.find((item) => item.id === sourceId);
  if (!source) {
    return;
  }

  source.categoryId = categoryId;

  void saveToBackend(`/sources/${encodeURIComponent(sourceId)}`, "PATCH", {
    category_id: categoryId,
  });
  announceChange();
}
