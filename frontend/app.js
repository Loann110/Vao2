const THEME_KEY = "vao2-theme";

function applyTheme(theme, animate = false) {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  const button = document.getElementById("theme_button");
  const label = document.getElementById("theme_label");

  document.documentElement.dataset.theme = selectedTheme;

  if (label) label.textContent = selectedTheme === "dark" ? "Light" : "Dark";
  if (button) {
    button.setAttribute(
      "aria-label",
      `Switch to ${selectedTheme === "dark" ? "light" : "dark"} theme`,
    );

    if (animate) {
      button.classList.remove("is_switching");
      void button.offsetWidth;
      button.classList.add("is_switching");
      window.setTimeout(() => button.classList.remove("is_switching"), 500);
    }
  }
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

  applyTheme(nextTheme, true);
  localStorage.setItem(THEME_KEY, nextTheme);
}

function openAddSource() {
  const modal = document.getElementById("add_source_modal");
  if (!modal) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal_open");
  window.setTimeout(() => document.getElementById("source_type")?.focus(), 0);
}

function closeAddSource() {
  const modal = document.getElementById("add_source_modal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal_open");
  document.querySelector(".add_source_btn")?.focus();
}

function readSourcesStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem("vao2-sources") || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { categories: [], sources: [] };
    }

    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((item) => item && typeof item === "object" && typeof item.name === "string")
      : [];
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.filter((item) => item && typeof item === "object" && typeof item.url === "string")
      : [];

    return { categories, sources };
  } catch {
    return { categories: [], sources: [] };
  }
}

function getCategoryName(categoryId, categories) {
  const category = categories.find((item) => item.id === categoryId);
  return category?.name || "General";
}

let feedArticles = [];
let feedLoaded = false;

function renderForYouContent() {
  const content = document.getElementById("content");
  const filter = document.getElementById("feed_category_filter");
  const searchInput = document.getElementById("feed_search");
  const notice = document.getElementById("notice");

  if (!content) return;

  const { categories } = readSourcesStore();
  const selectedCategory = filter?.value || "all";
  const searchValue = searchInput?.value?.trim().toLowerCase() || "";

  const filteredArticles = feedArticles.filter((article) => {
    const matchesCategory = selectedCategory === "all" || article.category_id === selectedCategory;
    const haystack = `${article.title || ""} ${article.summary || ""} ${article.source_title || ""}`.toLowerCase();
    const matchesSearch = !searchValue || haystack.includes(searchValue);
    return matchesCategory && matchesSearch;
  });

  if (filter) {
    const currentValue = filter.value;
    filter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All categories";
    filter.appendChild(allOption);

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      filter.appendChild(option);
    });

    if (categories.some((category) => category.id === currentValue) || currentValue === "all") {
      filter.value = currentValue;
    } else {
      filter.value = "all";
    }
  }

  if (!filteredArticles.length) {
    content.innerHTML = "";
    content.className = "empty";
    if (notice) {
      notice.textContent = feedLoaded
        ? "No articles yet. Click Refresh to fetch the latest updates."
        : "Loading articles...";
      notice.hidden = false;
    }
    return;
  }

  if (notice) {
    notice.textContent = "";
    notice.hidden = true;
  }

  const list = document.createElement("div");
  list.className = "feed_list";

  filteredArticles.forEach((article) => {
    const card = document.createElement("article");
    card.className = "feed_card";

    if (article.image_url) {
      const image = document.createElement("img");
      image.className = "feed_card_image";
      image.src = article.image_url;
      image.alt = "";
      image.loading = "lazy";
      card.appendChild(image);
    }

    const header = document.createElement("div");
    header.className = "feed_card_header";

    const platform = document.createElement("span");
    platform.className = "feed_card_platform";
    platform.textContent = `${article.platform || "Source"} · ${article.source_title || ""}`;

    const category = document.createElement("span");
    category.className = "feed_card_category";
    category.textContent = getCategoryName(article.category_id, categories);

    header.append(platform, category);

    const title = document.createElement("h2");
    title.className = "feed_card_title";
    title.textContent = article.title || "Untitled article";

    const subtitle = document.createElement("p");
    subtitle.className = "feed_card_subtitle";
    subtitle.textContent = article.summary || "No description available";

    const link = document.createElement("a");
    link.className = "feed_card_link";
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Read";

    card.append(header, title, subtitle, link);
    list.appendChild(card);
  });

  content.className = "";
  content.innerHTML = "";
  content.appendChild(list);
}

async function loadArticles() {
  const response = await fetch("/api/articles?limit=200", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Backend error ${response.status}`);
  const payload = await response.json();
  feedArticles = Array.isArray(payload.articles) ? payload.articles : [];
  feedLoaded = true;
  renderForYouContent();
}

async function refreshFeed() {
  const button = document.getElementById("refresh_button");
  const notice = document.getElementById("notice");
  if (button) button.disabled = true;
  if (notice) {
    notice.textContent = "Fetching latest updates...";
    notice.hidden = false;
  }

  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error(`Backend error ${response.status}`);
    await loadArticles();
  } catch (error) {
    if (notice) {
      notice.textContent = error instanceof Error ? error.message : "Refresh failed";
      notice.hidden = false;
    }
  } finally {
    if (button) button.disabled = false;
  }
}

window.refreshFeed = refreshFeed;

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

  applyTheme(savedTheme || preferredTheme);

  const modal = document.getElementById("add_source_modal");
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeAddSource();
  });

  const filter = document.getElementById("feed_category_filter");
  filter?.addEventListener("change", renderForYouContent);

  const searchInput = document.getElementById("feed_search");
  searchInput?.addEventListener("input", renderForYouContent);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("open")) {
      closeAddSource();
    }
  });

  window.addEventListener("navigationchange", () => {
    if (document.body.dataset.view !== "add-source") {
      renderForYouContent();
    }
  });

  renderForYouContent();
  void loadArticles().catch(() => {
    feedLoaded = true;
    renderForYouContent();
  });
});
