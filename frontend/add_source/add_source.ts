declare function platformLogo(kind: string, extraClass?: string): SVGSVGElement;

interface Window {
  setNavCounts?(counts: Record<string, number>): void;
  Vao2Sources?: Readonly<SourcesApi>;
}

interface SourcesApi {
  all(): StoredSource[];
  categories(): Category[];
  byPlatform(platform: string): StoredSource[];
  byCategory(categoryId: string): StoredSource[];
}

type PlatformId = "news" | "youtube" | "github" | "reddit" | "rss" | "podcast";
type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";
type Grouping = "category" | "platform";

interface Platform {
  id: PlatformId;
  label: string;
  placeholder: string;
}

interface Category {
  id: string;
  name: string;
}

interface SourceCandidate {
  platform: PlatformId;
  url: string;
  title: string;
  subtitle: string;
  thumbnail: string;
}

interface StoredSource extends SourceCandidate {
  id: string;
  categoryId: string;
  addedAt: string;
}

interface Store {
  categories: Category[];
  sources: StoredSource[];
}

interface State {
  platform: PlatformId;
  categoryId: string;
  status: SearchStatus;
  results: SourceCandidate[];
  error: string;
  grouping: Grouping;
}

interface Nodes {
  platforms: HTMLElement;
  category: HTMLSelectElement;
  newCategory: HTMLInputElement;
  createCategory: HTMLButtonElement;
  categoryChips: HTMLElement;
  searchSub: HTMLElement;
  searchForm: HTMLFormElement;
  query: HTMLInputElement;
  results: HTMLElement;
  manualForm: HTMLFormElement;
  manualUrl: HTMLInputElement;
  manualTitle: HTMLInputElement;
  total: HTMLElement;
  sources: HTMLElement;
  tabs: HTMLButtonElement[];
}

(() => {
  "use strict";

  const STORE_KEY = "vao2-sources";
  const SEARCH_ENDPOINT = "/api/search";
  const GENERAL_CATEGORY: Category = { id: "general", name: "General" };

  const PLATFORMS: readonly Platform[] = [
    { id: "news", label: "News", placeholder: "Search for an outlet or a topic..." },
    { id: "youtube", label: "YouTube", placeholder: "Search for a channel or a topic..." },
    { id: "github", label: "GitHub", placeholder: "Search for a repository, organization or account..." },
    { id: "reddit", label: "Reddit", placeholder: "Search for a community or a topic..." },
    { id: "rss", label: "RSS feed", placeholder: "Enter a feed or website URL..." },
    { id: "podcast", label: "Podcast", placeholder: "Search for a podcast or a topic..." },
  ];

  const platformById = new Map<PlatformId, Platform>(
    PLATFORMS.map((platform) => [platform.id, platform]),
  );

  function isPlatformId(value: unknown): value is PlatformId {
    return typeof value === "string" && platformById.has(value as PlatformId);
  }

  function platformLabel(id: PlatformId): string {
    return platformById.get(id)?.label ?? id;
  }

  /* ------------------------------------------------------------------ store */

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function toCategory(value: unknown): Category | null {
    if (!isRecord(value)) return null;
    const { id, name } = value;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name) return null;
    return { id, name };
  }

  function toSource(value: unknown): StoredSource | null {
    if (!isRecord(value)) return null;
    const url = value.url;
    if (typeof url !== "string" || !url.trim()) return null;

    return {
      id: typeof value.id === "string" ? value.id : newId("src"),
      platform: isPlatformId(value.platform) ? value.platform : "rss",
      categoryId: typeof value.categoryId === "string" ? value.categoryId : GENERAL_CATEGORY.id,
      title: typeof value.title === "string" ? value.title : hostOf(url),
      subtitle: typeof value.subtitle === "string" ? value.subtitle : "",
      url: url.trim(),
      thumbnail: typeof value.thumbnail === "string" ? value.thumbnail : "",
      addedAt: typeof value.addedAt === "string" ? value.addedAt : new Date().toISOString(),
    };
  }

  function readStore(): Store {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch {
      parsed = null;
    }
    if (!isRecord(parsed)) return { categories: [{ ...GENERAL_CATEGORY }], sources: [] };

    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.map(toCategory).filter((item): item is Category => item !== null)
      : [];
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.map(toSource).filter((item): item is StoredSource => item !== null)
      : [];

    return {
      categories: categories.length ? categories : [{ ...GENERAL_CATEGORY }],
      sources,
    };
  }

  const store: Store = readStore();

  function writeStore(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* Quota full or private mode: the UI still works for this session. */
    }
    /* Backend seam: POST /api/sources here once the API exists. */
  }

  function normalizeUrl(value: string): string {
    try {
      const url = new URL(value, window.location.href);
      return `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    } catch {
      return value.trim().toLowerCase();
    }
  }

  function hasSource(url: string): boolean {
    const key = normalizeUrl(url);
    return store.sources.some((source) => normalizeUrl(source.url) === key);
  }

  function newId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function hostOf(value: string): string {
    try {
      return new URL(value, window.location.href).host.replace(/^www\./, "");
    } catch {
      return value;
    }
  }

  /* ------------------------------------------------------------------ state */

  const state: State = {
    platform: PLATFORMS[0].id,
    categoryId: store.categories[0].id,
    status: "idle",
    results: [],
    error: "",
    grouping: "category",
  };

  let searchController: AbortController | null = null;
  let nodes!: Nodes;

  /* ----------------------------------------------------------------- search */

  function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
  }

  function normalizeResult(item: unknown, platform: PlatformId): SourceCandidate | null {
    if (!isRecord(item)) return null;
    const raw = typeof item.url === "string" ? item.url : item.link;
    if (typeof raw !== "string" || !raw.trim()) return null;
    const url = raw.trim();

    const title = [item.title, item.name, item.source_name].find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    const subtitle = [item.description, item.subtitle, item.summary].find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    const thumbnail = [item.thumbnail, item.image_url].find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

    return {
      platform,
      url,
      title: title ?? hostOf(url),
      subtitle: subtitle ?? "",
      thumbnail: thumbnail ?? "",
    };
  }

  async function searchBackend(
    platform: PlatformId,
    query: string,
    signal: AbortSignal,
  ): Promise<SourceCandidate[] | null> {
    const endpoint = `${SEARCH_ENDPOINT}?platform=${encodeURIComponent(platform)}&q=${encodeURIComponent(query)}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      return null; // No backend reachable (file://, server down)
    }

    if (!response.ok) return null;
    if (!(response.headers.get("content-type") || "").includes("application/json")) return null;

    const payload: unknown = await response.json();
    const raw = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.results)
        ? payload.results
        : isRecord(payload) && Array.isArray(payload.items)
          ? payload.items
          : [];

    return raw
      .map((item: unknown) => normalizeResult(item, platform))
      .filter((item): item is SourceCandidate => item !== null);
  }

  /* GitHub allows CORS, so this one works with no backend at all. */
  async function searchGithub(query: string, signal: AbortSignal): Promise<SourceCandidate[]> {
    const endpoint = `https://api.github.com/search/repositories?per_page=10&q=${encodeURIComponent(query)}`;
    const response = await fetch(endpoint, {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);

    const payload: unknown = await response.json();
    const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];

    return items
      .map((item: unknown): SourceCandidate | null => {
        if (!isRecord(item)) return null;
        const url = item.html_url;
        const name = item.full_name;
        if (typeof url !== "string" || typeof name !== "string") return null;

        const owner = isRecord(item.owner) ? item.owner : null;
        const stars = typeof item.stargazers_count === "number" ? item.stargazers_count : 0;

        return {
          platform: "github",
          url,
          title: name,
          subtitle: typeof item.description === "string" ? item.description : `${stars} stars`,
          thumbnail: owner && typeof owner.avatar_url === "string" ? owner.avatar_url : "",
        };
      })
      .filter((item): item is SourceCandidate => item !== null);
  }

  async function searchSources(
    platform: PlatformId,
    query: string,
    signal: AbortSignal,
  ): Promise<SourceCandidate[]> {
    const fromBackend = await searchBackend(platform, query, signal);
    if (fromBackend) return fromBackend;
    if (platform === "github") return searchGithub(query, signal);

    throw new Error(
      `${platformLabel(platform)} search needs the backend at ${SEARCH_ENDPOINT}, which isn't answering. Add the URL by hand below.`,
    );
  }

  async function runSearch(query: string): Promise<void> {
    searchController?.abort();
    searchController = new AbortController();

    state.status = "loading";
    state.error = "";
    renderResults();

    try {
      state.results = await searchSources(state.platform, query, searchController.signal);
      state.status = state.results.length ? "ready" : "empty";
    } catch (error: unknown) {
      if (isAbortError(error)) return;
      state.results = [];
      state.error = error instanceof Error ? error.message : "Unknown error";
      state.status = "error";
    }
    renderResults();
  }

  /* -------------------------------------------------------------- mutations */

  function createCategory(name: string): Category | null {
    const label = name.trim();
    if (!label) return null;

    const existing = store.categories.find(
      (category) => category.name.toLowerCase() === label.toLowerCase(),
    );
    if (existing) return existing;

    const category: Category = { id: newId("cat"), name: label };
    store.categories.push(category);
    writeStore();
    return category;
  }

  function ensureGeneralCategory(): void {
    if (!store.categories.some((category) => category.id === GENERAL_CATEGORY.id)) {
      store.categories.unshift({ ...GENERAL_CATEGORY });
    }
  }

  function deleteCategory(categoryId: string): void {
    if (categoryId === GENERAL_CATEGORY.id) return;

    const category = store.categories.find((item) => item.id === categoryId);
    if (!category) return;

    const moved = store.sources.filter((source) => source.categoryId === categoryId).length;
    const message = moved
      ? `Delete "${category.name}"? Its ${moved} source${moved > 1 ? "s" : ""} move back to General.`
      : `Delete "${category.name}"?`;
    if (!window.confirm(message)) return;

    ensureGeneralCategory();
    store.sources.forEach((source) => {
      if (source.categoryId === categoryId) source.categoryId = GENERAL_CATEGORY.id;
    });
    store.categories = store.categories.filter((item) => item.id !== categoryId);
    if (state.categoryId === categoryId) state.categoryId = store.categories[0].id;

    writeStore();
    renderCategories();
    renderSources();
  }

  function addSource(candidate: SourceCandidate): boolean {
    if (hasSource(candidate.url)) return false;

    store.sources.push({
      ...candidate,
      id: newId("src"),
      categoryId: state.categoryId,
      addedAt: new Date().toISOString(),
    });
    writeStore();
    renderSources();
    return true;
  }

  function removeSource(sourceId: string): void {
    store.sources = store.sources.filter((source) => source.id !== sourceId);
    writeStore();
    renderSources();
    renderResults();
  }

  function moveSource(sourceId: string, categoryId: string): void {
    const source = store.sources.find((item) => item.id === sourceId);
    if (!source) return;
    source.categoryId = categoryId;
    writeStore();
    renderSources();
  }

  /* ------------------------------------------------------------------- view */

  function createNode<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = "",
    text: unknown = "",
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = String(text);
    return element;
  }

  function requireNode<E extends Element>(root: ParentNode, selector: string): E {
    const node = root.querySelector(selector);
    if (!node) throw new Error(`Add-source view: missing ${selector}`);
    return node as unknown as E;
  }

  function buildSkeleton(root: HTMLElement): void {
    root.innerHTML = `
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
          <form class="as_row" id="as_search_form">
            <input id="as_query" class="input as_grow" autocomplete="off">
            <button type="submit" class="btn_primary">Search</button>
          </form>
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

    nodes = {
      platforms: requireNode<HTMLElement>(root, "#as_platforms"),
      category: requireNode<HTMLSelectElement>(root, "#as_category"),
      newCategory: requireNode<HTMLInputElement>(root, "#as_new_category"),
      createCategory: requireNode<HTMLButtonElement>(root, "#as_create_category"),
      categoryChips: requireNode<HTMLElement>(root, "#as_category_chips"),
      searchSub: requireNode<HTMLElement>(root, "#as_search_sub"),
      searchForm: requireNode<HTMLFormElement>(root, "#as_search_form"),
      query: requireNode<HTMLInputElement>(root, "#as_query"),
      results: requireNode<HTMLElement>(root, "#as_results"),
      manualForm: requireNode<HTMLFormElement>(root, "#as_manual_form"),
      manualUrl: requireNode<HTMLInputElement>(root, "#as_manual_url"),
      manualTitle: requireNode<HTMLInputElement>(root, "#as_manual_title"),
      total: requireNode<HTMLElement>(root, "#as_total"),
      sources: requireNode<HTMLElement>(root, "#as_sources"),
      tabs: Array.from(root.querySelectorAll<HTMLButtonElement>(".as_tab")),
    };

    bindEvents();
  }

  function bindEvents(): void {
    nodes.category.addEventListener("change", () => {
      state.categoryId = nodes.category.value;
    });

    nodes.createCategory.addEventListener("click", () => {
      const category = createCategory(nodes.newCategory.value);
      if (!category) {
        nodes.newCategory.focus();
        return;
      }
      state.categoryId = category.id;
      nodes.newCategory.value = "";
      renderCategories();
      renderSources();
    });

    nodes.newCategory.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        nodes.createCategory.click();
      }
    });

    nodes.searchForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      const query = nodes.query.value.trim();
      if (query.length < 2) {
        nodes.query.focus();
        return;
      }
      void runSearch(query);
    });

    nodes.manualForm.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      const url = nodes.manualUrl.value.trim();
      if (!url) return;

      const added = addSource({
        platform: state.platform,
        url,
        title: nodes.manualTitle.value.trim() || hostOf(url),
        subtitle: "",
        thumbnail: "",
      });
      if (added) {
        nodes.manualUrl.value = "";
        nodes.manualTitle.value = "";
      }
      renderResults();
    });

    nodes.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.grouping = tab.dataset.grouping === "platform" ? "platform" : "category";
        nodes.tabs.forEach((item) => item.classList.toggle("is_active", item === tab));
        renderSources();
      });
    });
  }

  function renderPlatforms(): void {
    nodes.platforms.replaceChildren();

    PLATFORMS.forEach((platform) => {
      const isActive = platform.id === state.platform;
      const button = createNode("button", `as_platform${isActive ? " is_active" : ""}`);
      button.type = "button";
      button.dataset.platform = platform.id;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");

      const icon = createNode("span", "icon");
      if (typeof platformLogo === "function") icon.append(platformLogo(platform.id));

      const total = store.sources.filter((source) => source.platform === platform.id).length;

      button.append(
        icon,
        createNode("span", "", platform.label),
        createNode("span", "as_platform_count", total ? String(total) : ""),
      );

      button.addEventListener("click", () => {
        state.platform = platform.id;
        state.status = "idle";
        state.results = [];
        renderPlatforms();
        renderSearchHint();
        renderResults();
        nodes.query.focus();
      });

      nodes.platforms.append(button);
    });
  }

  function renderSearchHint(): void {
    nodes.query.placeholder = platformById.get(state.platform)?.placeholder ?? "";
    nodes.searchSub.textContent =
      state.platform === "github"
        ? "Hits the GitHub API directly, no backend needed."
        : `Queries ${SEARCH_ENDPOINT}?platform=${state.platform}&q=…`;
  }

  function renderCategories(): void {
    ensureGeneralCategory();
    if (!store.categories.some((category) => category.id === state.categoryId)) {
      state.categoryId = store.categories[0].id;
    }

    nodes.category.replaceChildren();
    store.categories.forEach((category) => {
      const option = createNode("option", "", category.name);
      option.value = category.id;
      nodes.category.append(option);
    });
    nodes.category.value = state.categoryId;

    nodes.categoryChips.replaceChildren();
    store.categories.forEach((category) => {
      const total = store.sources.filter((source) => source.categoryId === category.id).length;
      const chip = createNode("span", "as_category_chip", `${category.name} · ${total}`);

      if (category.id !== GENERAL_CATEGORY.id) {
        const remove = createNode("button", "as_chip_remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", `Delete the ${category.name} category`);
        remove.addEventListener("click", () => deleteCategory(category.id));
        chip.append(remove);
      }
      nodes.categoryChips.append(chip);
    });
  }

  function renderResults(): void {
    nodes.results.replaceChildren();

    if (state.status === "idle") {
      nodes.results.append(createNode("div", "as_hint", "Search to see sources you can add."));
      return;
    }
    if (state.status === "loading") {
      const loading = createNode("div", "as_loading");
      loading.append(createNode("div", "ia_loader"), createNode("div", "", "Searching…"));
      nodes.results.append(loading);
      return;
    }
    if (state.status === "empty") {
      nodes.results.append(createNode("div", "as_hint", "No results. Try another term."));
      return;
    }
    if (state.status === "error") {
      nodes.results.append(createNode("div", "as_error", state.error));
      return;
    }

    state.results.forEach((result) => {
      const row = createNode("div", "as_result");

      if (result.thumbnail) {
        const image = createNode("img", "as_thumb");
        image.src = result.thumbnail;
        image.alt = "";
        image.loading = "lazy";
        row.append(image);
      }

      const text = createNode("div", "as_result_text");
      text.append(
        createNode("div", "as_result_title", result.title),
        createNode("div", "as_result_meta", result.subtitle || hostOf(result.url)),
      );
      row.append(text);

      const already = hasSource(result.url);
      const action = createNode("button", "card_btn btn_primary", already ? "Already added" : "Add");
      action.type = "button";
      action.disabled = already;
      action.addEventListener("click", () => {
        if (!addSource(result)) return;
        action.textContent = "Added";
        action.disabled = true;
      });

      row.append(action);
      nodes.results.append(row);
    });
  }

  function renderSources(): void {
    renderPlatforms();
    nodes.total.textContent = store.sources.length ? String(store.sources.length) : "";
    nodes.sources.replaceChildren();
    updateNavCounts();

    if (!store.sources.length) {
      nodes.sources.append(
        createNode("div", "empty", "No sources yet. Pick a platform and search."),
      );
      return;
    }

    const groups =
      state.grouping === "category"
        ? store.categories.map((category) => ({
            label: category.name,
            items: store.sources.filter((source) => source.categoryId === category.id),
          }))
        : PLATFORMS.map((platform) => ({
            label: platform.label,
            items: store.sources.filter((source) => source.platform === platform.id),
          }));

    groups
      .filter((group) => group.items.length)
      .forEach((group) => {
        const block = createNode("section", "as_group");
        block.append(
          createNode("div", "as_group_title", `${group.label} · ${group.items.length}`),
        );
        group.items.forEach((source) => block.append(sourceRow(source)));
        nodes.sources.append(block);
      });
  }

  function sourceRow(source: StoredSource): HTMLElement {
    const row = createNode("div", "as_source");

    const text = createNode("div", "as_result_text");
    text.append(createNode("div", "as_result_title", source.title));

    const meta = createNode("div", "as_result_meta");
    meta.append(
      createNode("span", "as_badge", platformLabel(source.platform)),
      document.createTextNode(` ${hostOf(source.url)}`),
    );
    text.append(meta);
    row.append(text);

    const select = createNode("select", "input as_move");
    select.setAttribute("aria-label", `Category for ${source.title}`);
    store.categories.forEach((category) => {
      const option = createNode("option", "", category.name);
      option.value = category.id;
      select.append(option);
    });
    select.value = source.categoryId;
    select.addEventListener("change", () => moveSource(source.id, select.value));

    const remove = createNode("button", "card_btn danger", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => removeSource(source.id));

    row.append(select, remove);
    return row;
  }

  function updateNavCounts(): void {
    const counts: Record<string, number> = {};
    store.sources.forEach((source) => {
      counts[source.platform] = (counts[source.platform] || 0) + 1;
    });
    counts.all = store.sources.length;
    window.setNavCounts?.(counts);
  }

  /* ------------------------------------------------------------------- init */

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("add_source_view");
    if (!(root instanceof HTMLElement)) return;

    buildSkeleton(root);
    renderPlatforms();
    renderSearchHint();
    renderCategories();
    renderResults();
    renderSources();

    window.addEventListener("navigationchange", (event: Event) => {
      const detail = (event as CustomEvent<{ view?: string }>).detail;
      if (detail?.view === "add-source") nodes.query.focus();
    });

    /* Read-only access for the feed. */
    window.Vao2Sources = Object.freeze<SourcesApi>({
      all: () => store.sources.map((source) => ({ ...source })),
      categories: () => store.categories.map((category) => ({ ...category })),
      byPlatform: (platform) => store.sources.filter((source) => source.platform === platform),
      byCategory: (categoryId) =>
        store.sources.filter((source) => source.categoryId === categoryId),
    });
  });
})();
