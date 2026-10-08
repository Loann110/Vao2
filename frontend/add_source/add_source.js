/*
  The "Add source" view, in four steps:

    1. Platform    News or YouTube
    2. Category    where the next source goes; categories can be created
    3. Search      results appear while typing (search.js), or a URL by hand
    4. My sources  the library, grouped by category or by platform

  The library itself (load, add, remove, move) lives in global/library.js,
  shared with the feed.
*/

import { element } from "../global/dom.js";
import { platformIcon } from "../global/icons.js";
import {
  addSource,
  createCategory,
  deleteCategory,
  GENERAL_CATEGORY,
  getCategories,
  getSources,
  hasSource,
  moveSource,
  removeSource,
} from "../global/library.js";
import { scheduleSearch } from "./search.js";


const PLATFORMS = [
  { id: "news", label: "News", placeholder: "Search for an outlet or a topic..." },
  { id: "youtube", label: "YouTube", placeholder: "Search for a channel or a topic..." },
];

const PAGE_HTML = `
  <div class="as_page">
    <section class="as_block">
      <div class="as_block_head">
        <h2><span class="as_step">1</span> Platform</h2>
        <p class="as_sub">Where to look for the next source.</p>
      </div>
      <div class="as_platforms" id="as_platforms"></div>
    </section>

    <section class="as_block">
      <div class="as_block_head">
        <h2><span class="as_step">2</span> Category</h2>
        <p class="as_sub">Sources you add land here.</p>
      </div>
      <div class="as_row">
        <label class="as_field">
          <span class="as_label">Add to</span>
          <select id="as_category" class="input"></select>
        </label>
        <label class="as_field">
          <span class="as_label">New category</span>
          <input id="as_new_category" class="input" placeholder="Enter a category name...">
        </label>
        <button type="button" class="btn_secondary" id="as_create_category">Create</button>
      </div>
      <div class="as_chips" id="as_category_chips"></div>
    </section>

    <section class="as_block">
      <div class="as_block_head">
        <h2><span class="as_step">3</span> Search</h2>
        <p class="as_sub" id="as_search_sub"></p>
      </div>
      <div class="as_row">
        <input id="as_query" class="input as_grow" autocomplete="off">
      </div>
      <div id="as_results" class="as_results"></div>

      <details class="as_manual">
        <summary>Add a URL directly</summary>
        <form class="as_row" id="as_manual_form">
          <input id="as_manual_url" class="input as_grow" type="url" placeholder="https://example.com/feed.xml" required>
          <input id="as_manual_title" class="input" placeholder="Name (optional)">
          <button type="submit" class="btn_secondary">Add</button>
        </form>
      </details>
    </section>

    <section class="as_block">
      <div class="as_block_head">
        <h2>My sources <span class="as_total" id="as_total"></span></h2>
        <div class="as_tabs">
          <button type="button" class="as_tab is_active" data-grouping="category">By category</button>
          <button type="button" class="as_tab" data-grouping="platform">By platform</button>
        </div>
      </div>
      <div id="as_sources" class="as_list"></div>
    </section>
  </div>
`;

const state = {
  platform: PLATFORMS[0].id,
  categoryId: GENERAL_CATEGORY.id,
  search: { status: "idle", results: [], error: "" },
  grouping: "category",
};

// Elements of the page, found once after it is built.
let nodes = null;


/* ---- small helpers ------------------------------------------------------ */

function hostOf(value) {
  try {
    return new URL(value, window.location.href).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function shortened(text, limit = 100) {
  return text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}...`;
}

function platformLabel(platformId) {
  const platform = PLATFORMS.find((item) => item.id === platformId);
  return platform ? platform.label : platformId;
}

function categoryOption(category) {
  const option = element("option", "", category.name);
  option.value = category.id;
  return option;
}

function countSources(predicate) {
  return getSources().filter(predicate).length;
}


/* ---- 1. platform -------------------------------------------------------- */

function choosePlatform(platformId) {
  state.platform = platformId;
  state.search = { status: "idle", results: [], error: "" };

  renderPlatforms();
  renderSearchHint();
  renderResults();
  runSearch();
  nodes.query.focus();
}

function renderPlatforms() {
  nodes.platforms.replaceChildren();

  for (const platform of PLATFORMS) {
    const isActive = platform.id === state.platform;
    const total = countSources((source) => source.platform === platform.id);

    const button = element("button", isActive ? "as_platform is_active" : "as_platform");
    button.type = "button";
    button.dataset.platform = platform.id;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");

    const icon = element("span", "icon");
    icon.append(platformIcon(platform.id));

    button.append(
      icon,
      element("span", "", platform.label),
      element("span", "as_platform_count", total ? String(total) : ""),
    );
    button.addEventListener("click", () => choosePlatform(platform.id));

    nodes.platforms.append(button);
  }
}


/* ---- 2. category -------------------------------------------------------- */

function confirmCategoryDeletion(category) {
  const moved = countSources((source) => source.categoryId === category.id);

  if (!moved) {
    return window.confirm(`Delete "${category.name}"?`);
  }

  const plural = moved > 1 ? "s" : "";
  return window.confirm(`Delete "${category.name}"? Its ${moved} source${plural} move back to General.`);
}

function categoryChip(category) {
  const total = countSources((source) => source.categoryId === category.id);
  const chip = element("span", "as_category_chip", `${category.name} · ${total}`);

  // "General" receives the sources of deleted categories, so it stays.
  if (category.id !== GENERAL_CATEGORY.id) {
    const remove = element("button", "as_chip_remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete the ${category.name} category`);
    remove.addEventListener("click", () => {
      if (confirmCategoryDeletion(category)) {
        deleteCategory(category.id);
      }
    });
    chip.append(remove);
  }

  return chip;
}

function renderCategories() {
  const categories = getCategories();

  // The chosen category may have just been deleted.
  if (!categories.some((category) => category.id === state.categoryId)) {
    state.categoryId = categories[0].id;
  }

  nodes.category.replaceChildren(...categories.map(categoryOption));
  nodes.category.value = state.categoryId;

  nodes.categoryChips.replaceChildren(...categories.map(categoryChip));
}

function createCategoryFromInput() {
  const category = createCategory(nodes.newCategory.value);
  if (!category) {
    nodes.newCategory.focus();
    return;
  }

  state.categoryId = category.id;
  nodes.newCategory.value = "";
  renderCategories();
}


/* ---- 3. search ---------------------------------------------------------- */

function renderSearchHint() {
  const platform = PLATFORMS.find((item) => item.id === state.platform);

  nodes.query.placeholder = platform.placeholder;
  nodes.searchSub.textContent = `Suggestions from /api/search for ${state.platform}.`;
}

function runSearch() {
  const query = nodes.query.value.trim();

  scheduleSearch(state.platform, query, (status, results, error) => {
    state.search = { status, results, error };
    renderResults();
  });
}

function resultRow(result) {
  const row = element("div", "as_result");

  if (result.thumbnail) {
    const image = element("img", "as_thumb");
    image.src = result.thumbnail;
    image.alt = "";
    image.loading = "lazy";
    row.append(image);
  }

  const subtitle = result.subtitle || hostOf(result.url);
  const meta = element("div", "as_result_meta", shortened(subtitle));
  meta.title = subtitle;

  const text = element("div", "as_result_text");
  text.append(element("div", "as_result_title", result.title), meta);
  row.append(text);

  const alreadyAdded = hasSource(result.url);
  const action = element("button", "card_btn btn_primary", alreadyAdded ? "Already added" : "Add");
  action.type = "button";
  action.disabled = alreadyAdded;
  action.addEventListener("click", () => {
    if (addSource(result, state.categoryId)) {
      action.textContent = "Added";
      action.disabled = true;
    }
  });
  row.append(action);

  return row;
}

function renderResults() {
  const { status, results, error } = state.search;
  nodes.results.replaceChildren();

  if (status === "loading") {
    const loading = element("div", "as_loading");
    loading.append(element("div", "ia_loader"), element("div", "", "Searching…"));
    nodes.results.append(loading);
    return;
  }

  if (status === "idle") {
    nodes.results.append(element("div", "as_hint", "Search to see sources you can add."));
    return;
  }

  if (status === "empty") {
    nodes.results.append(element("div", "as_hint", "No results. Try another term."));
    return;
  }

  if (status === "error") {
    nodes.results.append(element("div", "as_error", error));
    return;
  }

  for (const result of results) {
    nodes.results.append(resultRow(result));
  }
}

function addManualSource(event) {
  event.preventDefault();

  const url = nodes.manualUrl.value.trim();
  if (!url) {
    return;
  }

  // A URL typed by hand is the feed itself (see the field's placeholder).
  const added = addSource({
    platform: state.platform,
    url,
    feedUrl: url,
    title: nodes.manualTitle.value.trim() || hostOf(url),
    subtitle: "",
    thumbnail: "",
  }, state.categoryId);

  if (added) {
    nodes.manualUrl.value = "";
    nodes.manualTitle.value = "";
  }

  renderResults();
}


/* ---- 4. my sources ------------------------------------------------------ */

function sourceRow(source) {
  const meta = element("div", "as_result_meta");
  meta.append(
    element("span", "as_badge", platformLabel(source.platform)),
    document.createTextNode(` ${hostOf(source.url)}`),
  );

  const text = element("div", "as_result_text");
  text.append(element("div", "as_result_title", source.title), meta);

  const categorySelect = element("select", "input as_move");
  categorySelect.setAttribute("aria-label", `Category for ${source.title}`);
  categorySelect.append(...getCategories().map(categoryOption));
  categorySelect.value = source.categoryId;
  categorySelect.addEventListener("change", () => {
    moveSource(source.id, categorySelect.value);
  });

  const remove = element("button", "card_btn danger", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => {
    removeSource(source.id);
    // Its search result can be added again.
    renderResults();
  });

  const row = element("div", "as_source");
  row.append(text, categorySelect, remove);
  return row;
}

function sourceGroups() {
  const sources = getSources();

  if (state.grouping === "category") {
    return getCategories().map((category) => ({
      label: category.name,
      items: sources.filter((source) => source.categoryId === category.id),
    }));
  }

  return PLATFORMS.map((platform) => ({
    label: platform.label,
    items: sources.filter((source) => source.platform === platform.id),
  }));
}

function renderSources() {
  const total = getSources().length;

  // The platform buttons show how many sources each one has.
  renderPlatforms();

  nodes.total.textContent = total ? String(total) : "";
  nodes.sources.replaceChildren();

  if (!total) {
    nodes.sources.append(element("div", "empty", "No sources yet. Pick a platform and search."));
    return;
  }

  for (const group of sourceGroups()) {
    if (!group.items.length) {
      continue;
    }

    const block = element("section", "as_group");
    block.append(element("div", "as_group_title", `${group.label} · ${group.items.length}`));

    for (const source of group.items) {
      block.append(sourceRow(source));
    }

    nodes.sources.append(block);
  }
}

function chooseGrouping(selectedTab) {
  state.grouping = selectedTab.dataset.grouping;

  for (const tab of nodes.tabs) {
    tab.classList.toggle("is_active", tab === selectedTab);
  }

  renderSources();
}


/* ---- startup ------------------------------------------------------------ */

function buildPage(root) {
  root.innerHTML = PAGE_HTML;

  nodes = {
    platforms: root.querySelector("#as_platforms"),
    category: root.querySelector("#as_category"),
    newCategory: root.querySelector("#as_new_category"),
    createCategory: root.querySelector("#as_create_category"),
    categoryChips: root.querySelector("#as_category_chips"),
    searchSub: root.querySelector("#as_search_sub"),
    query: root.querySelector("#as_query"),
    results: root.querySelector("#as_results"),
    manualForm: root.querySelector("#as_manual_form"),
    manualUrl: root.querySelector("#as_manual_url"),
    manualTitle: root.querySelector("#as_manual_title"),
    total: root.querySelector("#as_total"),
    sources: root.querySelector("#as_sources"),
    tabs: [...root.querySelectorAll(".as_tab")],
  };
}

function bindEvents() {
  nodes.category.addEventListener("change", () => {
    state.categoryId = nodes.category.value;
  });

  nodes.createCategory.addEventListener("click", createCategoryFromInput);
  nodes.newCategory.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createCategoryFromInput();
    }
  });

  nodes.query.addEventListener("input", runSearch);
  nodes.manualForm.addEventListener("submit", addManualSource);

  for (const tab of nodes.tabs) {
    tab.addEventListener("click", () => chooseGrouping(tab));
  }

  window.addEventListener("librarychange", () => {
    renderCategories();
    renderSources();
  });

  window.addEventListener("navigationchange", (event) => {
    if (event.detail.view === "add-source") {
      nodes.query.focus();
    }
  });
}

export function startAddSource() {
  buildPage(document.getElementById("add_source_view"));
  bindEvents();

  renderPlatforms();
  renderSearchHint();
  renderCategories();
  renderResults();
  renderSources();
}
