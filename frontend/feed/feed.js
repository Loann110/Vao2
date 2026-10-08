/*
  The feed: "For you", and the same list filtered on "YouTube" or "News".

  Articles are loaded once from /api/articles; "Refresh" asks the backend to
  download every source again. Filtering (platform, category, search) happens
  here, in the browser, without asking the backend.
*/

import { fetchJson } from "../global/api.js";
import { element } from "../global/dom.js";
import { getCategories } from "../global/library.js";
import { currentView } from "../global/navigation.js";
import { createFeedCard } from "./feed_card.js";
import { connectPlayers, resetPlayers } from "./video_player.js";


const ARTICLE_LIMIT = 200;

// Views that do not show the feed.
const OTHER_VIEWS = ["add-source", "weather"];

let articles = [];
let articlesLoaded = false;


/* ---- filtering ---------------------------------------------------------- */

function matchesFilters(article, view, categoryId, searchText) {
  const matchesPlatform = view === "all" || article.platform === view;
  const matchesCategory = categoryId === "all" || article.category_id === categoryId;

  const searchable = `${article.title || ""} ${article.summary || ""} ${article.source_title || ""}`;
  const matchesSearch = !searchText || searchable.toLowerCase().includes(searchText);

  return matchesPlatform && matchesCategory && matchesSearch;
}

function visibleArticles() {
  const categoryId = document.getElementById("feed_category_filter").value || "all";
  const searchText = document.getElementById("feed_search").value.trim().toLowerCase();
  const view = currentView();

  return articles.filter((article) => {
    return matchesFilters(article, view, categoryId, searchText);
  });
}

/** Rebuild the category filter's options, keeping the current choice if it still exists. */
function updateCategoryFilter() {
  const filter = document.getElementById("feed_category_filter");
  const selected = filter.value;
  const categories = getCategories();

  filter.replaceChildren();

  const allOption = element("option", "", "All categories");
  allOption.value = "all";
  filter.append(allOption);

  for (const category of categories) {
    const option = element("option", "", category.name);
    option.value = category.id;
    filter.append(option);
  }

  const stillExists = categories.some((category) => category.id === selected);
  filter.value = stillExists ? selected : "all";
}


/* ---- drawing ------------------------------------------------------------ */

function showNotice(text) {
  const notice = document.getElementById("notice");
  notice.textContent = text;
  notice.hidden = !text;
}

function renderFeed() {
  if (OTHER_VIEWS.includes(document.body.dataset.view)) {
    return;
  }

  const content = document.getElementById("content");
  const version = resetPlayers();

  updateCategoryFilter();
  const shownArticles = visibleArticles();

  if (!shownArticles.length) {
    content.replaceChildren();
    content.className = "empty";

    showNotice(articlesLoaded
      ? "No articles yet. Click Refresh to fetch the latest updates."
      : "Loading articles...");
    return;
  }

  showNotice("");

  const list = element("div", "feed_list");
  for (const article of shownArticles) {
    list.append(createFeedCard(article));
  }

  content.className = "";
  content.replaceChildren(list);

  if (list.querySelector(".feed_card_player")) {
    void connectPlayers(version);
  }
}


/* ---- loading ------------------------------------------------------------ */

async function loadArticles() {
  try {
    const payload = await fetchJson(`/api/articles?limit=${ARTICLE_LIMIT}`);
    articles = payload.articles;
  } catch {
    articles = [];
  }

  articlesLoaded = true;
  renderFeed();
}

async function refreshFeed() {
  const button = document.getElementById("refresh_button");

  button.disabled = true;
  showNotice("Fetching latest updates...");

  try {
    await fetchJson("/api/refresh", { method: "POST" });

    const payload = await fetchJson(`/api/articles?limit=${ARTICLE_LIMIT}`);
    articles = payload.articles;
    renderFeed();
  } catch (error) {
    showNotice(error.message || "Refresh failed");
  } finally {
    button.disabled = false;
  }
}


/* ---- startup ------------------------------------------------------------ */

export function startFeed() {
  document.getElementById("refresh_button").addEventListener("click", refreshFeed);
  document.getElementById("feed_category_filter").addEventListener("change", renderFeed);
  document.getElementById("feed_search").addEventListener("input", renderFeed);

  window.addEventListener("navigationchange", renderFeed);
  window.addEventListener("librarychange", renderFeed);

  renderFeed();
  void loadArticles();
}
