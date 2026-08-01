"use strict";
(() => {
    "use strict";
    const STORE_KEY = "vao2-sources";
    const API_BASE_URL = "/api";
    const SEARCH_DEBOUNCE_MS = 300;
    const GENERAL_CATEGORY = { id: "general", name: "General" };
    const PLATFORMS = [
        { id: "news", label: "News", placeholder: "Search for an outlet or a topic..." },
        { id: "youtube", label: "YouTube", placeholder: "Search for a channel or a topic..." },
        { id: "github", label: "GitHub", placeholder: "Search for a repository, organization or account..." },
        { id: "rss", label: "RSS feed", placeholder: "Enter a feed or website URL..." },
        { id: "podcast", label: "Podcast", placeholder: "Search for a podcast or a topic..." },
    ];
    const platformById = new Map(PLATFORMS.map((platform) => [platform.id, platform]));
    function isPlatformId(value) {
        return typeof value === "string" && platformById.has(value);
    }
    function platformLabel(id) {
        return platformById.get(id)?.label ?? id;
    }
    /* ============================ 1. LOCAL STORAGE ============================
     *
     * localStorage remains active while the backend is being prepared.
     * The HTTP layer, grouped in section 6, can later become the source of
     * truth without mixing fetch calls with the rendering code.
     */
    function isRecord(value) {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    function firstString(value, ...keys) {
        return keys.map((key) => value[key]).find((item) => typeof item === "string" && item.length > 0);
    }
    function toCategory(value) {
        if (!isRecord(value))
            return null;
        const { id, name } = value;
        if (typeof id !== "string" || !id || typeof name !== "string" || !name)
            return null;
        return { id, name };
    }
    function parseList(value, parse) {
        return Array.isArray(value)
            ? value.map(parse).filter((item) => item !== null)
            : [];
    }
    function toSource(value) {
        if (!isRecord(value))
            return null;
        const url = value.url;
        if (typeof url !== "string" || !url.trim())
            return null;
        return {
            id: typeof value.id === "string" ? value.id : newId("src"),
            platform: isPlatformId(value.platform) ? value.platform : "rss",
            categoryId: firstString(value, "categoryId", "category_id") ?? GENERAL_CATEGORY.id,
            title: firstString(value, "title") ?? hostOf(url),
            subtitle: firstString(value, "subtitle") ?? "",
            url: url.trim(),
            feedUrl: firstString(value, "feedUrl", "feed_url"),
            thumbnail: firstString(value, "thumbnail") ?? "",
            addedAt: firstString(value, "addedAt", "added_at") ?? new Date().toISOString(),
        };
    }
    function readStore() {
        let parsed = null;
        try {
            parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        }
        catch {
            parsed = null;
        }
        if (!isRecord(parsed))
            return { categories: [{ ...GENERAL_CATEGORY }], sources: [] };
        const categories = parseList(parsed.categories, toCategory);
        const sources = parseList(parsed.sources, toSource);
        return {
            categories: categories.length ? categories : [{ ...GENERAL_CATEGORY }],
            sources,
        };
    }
    const store = readStore();
    function writeStore() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
        }
        catch {
            /* Quota full or private mode: the UI still works for this session. */
        }
    }
    function normalizeUrl(value) {
        try {
            const url = new URL(value, window.location.href);
            return `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`;
        }
        catch {
            return value.trim().toLowerCase();
        }
    }
    function hasSource(url) {
        const key = normalizeUrl(url);
        return store.sources.some((source) => normalizeUrl(source.url) === key);
    }
    function newId(prefix) {
        return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    }
    function hostOf(value) {
        try {
            return new URL(value, window.location.href).host.replace(/^www\./, "");
        }
        catch {
            return value;
        }
    }
    /* ============================== 2. VIEW STATE ============================== */
    const state = {
        platform: PLATFORMS[0].id,
        categoryId: store.categories[0].id,
        status: "idle",
        results: [],
        error: "",
        grouping: "category",
    };
    let searchController = null;
    let searchTimer = null;
    let nodes;
    /* =================== 3. SEARCH AND AUTOMATIC SUGGESTIONS =================== */
    function isAbortError(error) {
        return error instanceof DOMException && error.name === "AbortError";
    }
    function normalizeResult(item, platform) {
        if (!isRecord(item))
            return null;
        const raw = typeof item.url === "string" ? item.url : item.link;
        if (typeof raw !== "string" || !raw.trim())
            return null;
        const url = raw.trim();
        return {
            platform,
            url,
            feedUrl: firstString(item, "feed_url"),
            title: firstString(item, "title", "name", "source_name") ?? hostOf(url),
            subtitle: firstString(item, "description", "subtitle", "summary") ?? "",
            thumbnail: firstString(item, "thumbnail", "image_url") ?? "",
            alreadyAdded: item.already_added === true,
        };
    }
    async function searchBackend(platform, query, signal) {
        const endpoint = `${API_BASE_URL}/search?platform=${encodeURIComponent(platform)}&q=${encodeURIComponent(query)}`;
        let response;
        try {
            response = await fetch(endpoint, {
                credentials: "same-origin",
                headers: { Accept: "application/json" },
                signal,
            });
        }
        catch (error) {
            if (isAbortError(error))
                throw error;
            return null; // No backend reachable (file://, server down)
        }
        if (!response.ok) {
            const payload = (response.headers.get("content-type") || "").includes("application/json")
                ? await response.json()
                : null;
            if (isRecord(payload) && typeof payload.detail === "string") {
                throw new Error(payload.detail);
            }
            return null;
        }
        if (!(response.headers.get("content-type") || "").includes("application/json"))
            return null;
        const payload = await response.json();
        const raw = Array.isArray(payload)
            ? payload
            : isRecord(payload) && Array.isArray(payload.results)
                ? payload.results
                : isRecord(payload) && Array.isArray(payload.items)
                    ? payload.items
                    : [];
        return raw
            .map((item) => normalizeResult(item, platform))
            .filter((item) => item !== null);
    }
    /* GitHub allows CORS, so this one works with no backend at all. */
    async function searchGithub(query, signal) {
        const endpoint = `https://api.github.com/search/repositories?per_page=10&q=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, {
            headers: { Accept: "application/vnd.github+json" },
            signal,
        });
        if (!response.ok)
            throw new Error(`GitHub answered ${response.status}`);
        const payload = await response.json();
        const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
        return items
            .map((item) => {
            if (!isRecord(item))
                return null;
            const url = item.html_url;
            const name = item.full_name;
            if (typeof url !== "string" || typeof name !== "string")
                return null;
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
            .filter((item) => item !== null);
    }
    async function searchSources(platform, query, signal) {
        if (platform === "github")
            return searchGithub(query, signal);
        const fromBackend = await searchBackend(platform, query, signal);
        if (fromBackend)
            return fromBackend;
        throw new Error(`${platformLabel(platform)} search needs the backend at ${API_BASE_URL}/search, which isn't answering. Add the URL by hand below.`);
    }
    async function runSearch(query) {
        searchController?.abort();
        searchController = new AbortController();
        state.status = "loading";
        state.error = "";
        renderResults();
        try {
            state.results = await searchSources(state.platform, query, searchController.signal);
            state.status = state.results.length ? "ready" : "empty";
        }
        catch (error) {
            if (isAbortError(error))
                return;
            state.results = [];
            state.error = error instanceof Error ? error.message : "Unknown error";
            state.status = "error";
        }
        renderResults();
    }
    /**
     * Waits briefly before searching to avoid sending an HTTP request for every
     * keystroke. New input replaces the previously scheduled search.
     */
    function scheduleSearch() {
        if (searchTimer !== null)
            window.clearTimeout(searchTimer);
        const query = nodes.query.value.trim();
        if (query.length < 2) {
            searchController?.abort();
            state.status = "idle";
            state.results = [];
            state.error = "";
            renderResults();
            return;
        }
        searchTimer = window.setTimeout(() => {
            searchTimer = null;
            void runSearch(query);
        }, SEARCH_DEBOUNCE_MS);
    }
    /* ================= 4. LOCAL CHANGES + BACKEND SYNC ================= */
    function createCategory(name) {
        const label = name.trim();
        if (!label)
            return null;
        const existing = store.categories.find((category) => category.name.toLowerCase() === label.toLowerCase());
        if (existing)
            return existing;
        const category = { id: newId("cat"), name: label };
        store.categories.push(category);
        writeStore();
        void syncBackend("/categories", "POST", { id: category.id, name: category.name });
        return category;
    }
    function ensureGeneralCategory() {
        if (!store.categories.some((category) => category.id === GENERAL_CATEGORY.id)) {
            store.categories.unshift({ ...GENERAL_CATEGORY });
        }
    }
    function deleteCategory(categoryId) {
        if (categoryId === GENERAL_CATEGORY.id)
            return;
        const category = store.categories.find((item) => item.id === categoryId);
        if (!category)
            return;
        const moved = store.sources.filter((source) => source.categoryId === categoryId).length;
        const message = moved
            ? `Delete "${category.name}"? Its ${moved} source${moved > 1 ? "s" : ""} move back to General.`
            : `Delete "${category.name}"?`;
        if (!window.confirm(message))
            return;
        ensureGeneralCategory();
        store.sources.forEach((source) => {
            if (source.categoryId === categoryId)
                source.categoryId = GENERAL_CATEGORY.id;
        });
        store.categories = store.categories.filter((item) => item.id !== categoryId);
        if (state.categoryId === categoryId)
            state.categoryId = store.categories[0].id;
        writeStore();
        void syncBackend(`/categories/${encodeURIComponent(categoryId)}`, "DELETE");
        renderCategories();
        renderSources();
    }
    function addSource(candidate, isManual = false) {
        if (hasSource(candidate.url))
            return false;
        const source = {
            ...candidate,
            id: newId("src"),
            categoryId: state.categoryId,
            addedAt: new Date().toISOString(),
        };
        store.sources.push(source);
        writeStore();
        void syncBackend(isManual ? "/sources/manual" : "/sources", "POST", {
            id: source.id,
            platform: source.platform,
            url: source.url,
            feed_url: source.feedUrl,
            title: source.title,
            subtitle: source.subtitle,
            thumbnail: source.thumbnail,
            category_id: source.categoryId,
        });
        renderSources();
        return true;
    }
    function removeSource(sourceId) {
        store.sources = store.sources.filter((source) => source.id !== sourceId);
        writeStore();
        void syncBackend(`/sources/${encodeURIComponent(sourceId)}`, "DELETE");
        renderSources();
        renderResults();
    }
    function moveSource(sourceId, categoryId) {
        const source = store.sources.find((item) => item.id === sourceId);
        if (!source)
            return;
        source.categoryId = categoryId;
        writeStore();
        void syncBackend(`/sources/${encodeURIComponent(sourceId)}`, "PATCH", {
            category_id: categoryId,
        });
        renderSources();
    }
    /* ========================== 5. VIEW CONSTRUCTION ========================== */
    function createNode(tag, className = "", text = "") {
        const element = document.createElement(tag);
        if (className)
            element.className = className;
        if (text !== "")
            element.textContent = String(text);
        return element;
    }
    function requireNode(root, selector) {
        const node = root.querySelector(selector);
        if (!node)
            throw new Error(`Add-source view: missing ${selector}`);
        return node;
    }
    function createOption(category) {
        const option = createNode("option", "", category.name);
        option.value = category.id;
        return option;
    }
    function buildSkeleton(root) {
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
        nodes = {
            platforms: requireNode(root, "#as_platforms"),
            category: requireNode(root, "#as_category"),
            newCategory: requireNode(root, "#as_new_category"),
            createCategory: requireNode(root, "#as_create_category"),
            categoryChips: requireNode(root, "#as_category_chips"),
            searchSub: requireNode(root, "#as_search_sub"),
            query: requireNode(root, "#as_query"),
            results: requireNode(root, "#as_results"),
            manualForm: requireNode(root, "#as_manual_form"),
            manualUrl: requireNode(root, "#as_manual_url"),
            manualTitle: requireNode(root, "#as_manual_title"),
            total: requireNode(root, "#as_total"),
            sources: requireNode(root, "#as_sources"),
            tabs: Array.from(root.querySelectorAll(".as_tab")),
        };
        bindEvents();
    }
    function bindEvents() {
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
        nodes.newCategory.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                nodes.createCategory.click();
            }
        });
        /* Show suggestions while typing: no search button is needed. */
        nodes.query.addEventListener("input", scheduleSearch);
        nodes.manualForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const url = nodes.manualUrl.value.trim();
            if (!url)
                return;
            const added = addSource({
                platform: state.platform,
                url,
                title: nodes.manualTitle.value.trim() || hostOf(url),
                subtitle: "",
                thumbnail: "",
            }, true);
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
    function renderPlatforms() {
        nodes.platforms.replaceChildren();
        PLATFORMS.forEach((platform) => {
            const isActive = platform.id === state.platform;
            const button = createNode("button", `as_platform${isActive ? " is_active" : ""}`);
            button.type = "button";
            button.dataset.platform = platform.id;
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
            const icon = createNode("span", "icon");
            if (typeof platformLogo === "function")
                icon.append(platformLogo(platform.id));
            const total = store.sources.filter((source) => source.platform === platform.id).length;
            button.append(icon, createNode("span", "", platform.label), createNode("span", "as_platform_count", total ? String(total) : ""));
            button.addEventListener("click", () => {
                state.platform = platform.id;
                state.status = "idle";
                state.results = [];
                renderPlatforms();
                renderSearchHint();
                renderResults();
                scheduleSearch();
                nodes.query.focus();
            });
            nodes.platforms.append(button);
        });
    }
    function renderSearchHint() {
        nodes.query.placeholder = platformById.get(state.platform)?.placeholder ?? "";
        nodes.searchSub.textContent =
            state.platform === "github"
                ? "Hits the GitHub API directly, no backend needed."
                : `Suggestions from ${API_BASE_URL}/search for ${state.platform}.`;
    }
    function renderCategories() {
        ensureGeneralCategory();
        if (!store.categories.some((category) => category.id === state.categoryId)) {
            state.categoryId = store.categories[0].id;
        }
        nodes.category.replaceChildren();
        nodes.category.append(...store.categories.map(createOption));
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
    function renderResults() {
        nodes.results.replaceChildren();
        if (state.status === "loading") {
            const loading = createNode("div", "as_loading");
            loading.append(createNode("div", "ia_loader"), createNode("div", "", "Searching…"));
            nodes.results.append(loading);
            return;
        }
        const messages = {
            idle: ["as_hint", "Search to see sources you can add."],
            empty: ["as_hint", "No results. Try another term."],
            error: ["as_error", state.error],
        };
        const message = messages[state.status];
        if (message) {
            nodes.results.append(createNode("div", ...message));
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
            text.append(createNode("div", "as_result_title", result.title), createNode("div", "as_result_meta", result.subtitle || hostOf(result.url)));
            row.append(text);
            const already = result.alreadyAdded || hasSource(result.url);
            const action = createNode("button", "card_btn btn_primary", already ? "Already added" : "Add");
            action.type = "button";
            action.disabled = already;
            action.addEventListener("click", () => {
                if (!addSource(result))
                    return;
                action.textContent = "Added";
                action.disabled = true;
            });
            row.append(action);
            nodes.results.append(row);
        });
    }
    function renderSources() {
        renderPlatforms();
        nodes.total.textContent = store.sources.length ? String(store.sources.length) : "";
        nodes.sources.replaceChildren();
        updateNavCounts();
        if (!store.sources.length) {
            nodes.sources.append(createNode("div", "empty", "No sources yet. Pick a platform and search."));
            return;
        }
        const groups = state.grouping === "category"
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
            block.append(createNode("div", "as_group_title", `${group.label} · ${group.items.length}`));
            group.items.forEach((source) => block.append(sourceRow(source)));
            nodes.sources.append(block);
        });
    }
    function sourceRow(source) {
        const row = createNode("div", "as_source");
        const text = createNode("div", "as_result_text");
        text.append(createNode("div", "as_result_title", source.title));
        const meta = createNode("div", "as_result_meta");
        meta.append(createNode("span", "as_badge", platformLabel(source.platform)), document.createTextNode(` ${hostOf(source.url)}`));
        text.append(meta);
        row.append(text);
        const select = createNode("select", "input as_move");
        select.setAttribute("aria-label", `Category for ${source.title}`);
        select.append(...store.categories.map(createOption));
        select.value = source.categoryId;
        select.addEventListener("change", () => moveSource(source.id, select.value));
        const remove = createNode("button", "card_btn danger", "Remove");
        remove.type = "button";
        remove.addEventListener("click", () => removeSource(source.id));
        row.append(select, remove);
        return row;
    }
    function updateNavCounts() {
        const counts = {};
        store.sources.forEach((source) => {
            counts[source.platform] = (counts[source.platform] || 0) + 1;
        });
        counts.all = store.sources.length;
        window.setNavCounts?.(counts);
    }
    /* ========================== 6. BACKEND HTTP LAYER ==========================
     *
     * All routes are intentionally kept together here. For now, the interface
     * remains local-first: if the server is unavailable, the local change still
     * works and the error is only logged.
     */
    async function apiRequest(path, options = {}) {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            credentials: "same-origin",
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {}),
            },
        });
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
            ? await response.json()
            : null;
        if (!response.ok) {
            const detail = isRecord(payload) && typeof payload.detail === "string"
                ? payload.detail
                : `Backend error ${response.status}`;
            throw new Error(detail);
        }
        return payload;
    }
    async function syncBackend(path, method, body) {
        try {
            await apiRequest(path, {
                method,
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        }
        catch (error) {
            console.warn("[Add source] Backend unavailable; local data was kept.", error);
        }
    }
    async function reloadFromBackend() {
        const payload = await apiRequest("/sources");
        const categories = parseList(payload.categories, toCategory);
        const sources = parseList(payload.sources, toSource);
        store.categories = categories.length ? categories : [{ ...GENERAL_CATEGORY }];
        store.sources = sources;
        writeStore();
        renderCategories();
        renderSources();
        renderResults();
    }
    /* =================== 7. INITIALIZATION AND PUBLIC VIEW API =================== */
    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("add_source_view");
        if (!(root instanceof HTMLElement))
            return;
        buildSkeleton(root);
        renderPlatforms();
        renderSearchHint();
        renderCategories();
        renderResults();
        renderSources();
        window.addEventListener("navigationchange", (event) => {
            const detail = event.detail;
            if (detail?.view === "add-source")
                nodes.query.focus();
        });
        /* Read-only access for the feed. */
        window.Vao2Sources = Object.freeze({
            all: () => store.sources.map((source) => ({ ...source })),
            categories: () => store.categories.map((category) => ({ ...category })),
            byPlatform: (platform) => store.sources.filter((source) => source.platform === platform),
            byCategory: (categoryId) => store.sources.filter((source) => source.categoryId === categoryId),
            reload: reloadFromBackend,
        });
    });
})();
