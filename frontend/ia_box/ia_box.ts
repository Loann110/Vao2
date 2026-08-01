(() => {
  "use strict";

  type DetailsMethod = "GET" | "POST";

  interface RelatedArticle {
    title?: string;
    name?: string;
    source?: string;
    source_name?: string;
    published_at?: string;
    url?: string;
  }

  interface SourceUsed {
    source?: string;
    title?: string;
    url?: string;
  }

  interface Article {
    title?: string;
    source_name?: string;
    published_at?: string;
    category?: string;
    image_url?: string;
    url?: string;
    same_topic?: RelatedArticle[];
  }

  interface AIDetails {
    generated_by_ai?: boolean;
    synthesis?: string;
    key_points?: string[];
    entities?: string[];
    related?: string[];
    sources_used?: SourceUsed[];
  }

  interface IABoxOpenOptions {
    articleUrl: string;
    detailsUrl: string;
    detailsMethod?: DetailsMethod;
  }

  interface IABoxApi {
    open(options?: Partial<IABoxOpenOptions>): Promise<boolean>;
    reset(): void;
    render(article: Article, details: AIDetails): void;
  }


  const TRIGGER_SELECTOR = "[data-ia-article-url][data-ia-details-url]";

  const iaBoxElement = document.getElementById("ia_box");
  if (!(iaBoxElement instanceof HTMLElement)) return;
  const iaBox: HTMLElement = iaBoxElement;

  let requestController: AbortController | null = null;

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

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function unwrapObject(payload: unknown, property: string): Record<string, unknown> {
    if (!isRecord(payload)) throw new Error("Invalid JSON response");
    const nested = payload[property];
    return isRecord(nested) ? nested : payload;
  }

  function validBackendUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function formatDate(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
  }

  function stringItems(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  function objectItems<T>(value: unknown): T[] {
    return Array.isArray(value)
      ? value.filter(isRecord) as T[]
      : [];
  }

  async function requestJson(
    url: string,
    method: DetailsMethod = "GET",
  ): Promise<unknown> {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: requestController?.signal,
    });

    if (!response.ok) throw new Error(`Backend error ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("The backend must return JSON");
    }
    return response.json() as Promise<unknown>;
  }

  function section(title: string, content: Node): HTMLElement {
    const wrapper = createNode("section", "ia_section");
    wrapper.append(createNode("h3", "", title), content);
    return wrapper;
  }

  function list(items: string[]): HTMLUListElement {
    const ul = createNode("ul");
    items.forEach((item) => ul.append(createNode("li", "", item)));
    return ul;
  }

  function chips(items: string[]): HTMLElement {
    const wrapper = createNode("div", "ia_chips");
    items.forEach((item) => wrapper.append(createNode("span", "ia_chip", item)));
    return wrapper;
  }

  function externalLink(url: unknown, label: string): HTMLAnchorElement | null {
    const href = validBackendUrl(url);
    if (!href) return null;

    const link = createNode("a", "ia_link", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function relatedItems(items: RelatedArticle[]): HTMLElement {
    const wrapper = createNode("div");
    items.forEach((item) => {
      const row = createNode("div", "ia_related");
      const text = createNode("div");
      text.append(
        createNode("div", "ia_item_title", item.title || item.name || "Publication"),
        createNode(
          "div",
          "ia_item_meta",
          [item.source_name || item.source, formatDate(item.published_at)]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      row.append(text);
      const link = externalLink(item.url, "Open");
      if (link) row.append(link);
      wrapper.append(row);
    });
    return wrapper;
  }

  function sourceItems(items: SourceUsed[]): HTMLElement {
    const wrapper = createNode("div");
    items.forEach((item) => {
      const row = createNode("div", "ia_source");
      const text = createNode("div");
      text.append(
        createNode("div", "ia_item_title", item.source || "Source"),
        createNode("div", "ia_item_meta", item.title || ""),
      );
      row.append(text);
      const link = externalLink(item.url, "Original content");
      if (link) row.append(link);
      wrapper.append(row);
    });
    return wrapper;
  }

  function panel(...children: Node[]): void {
    const page = createNode("div", "ia_page");
    page.append(createNode("div", "ia_eyebrow", "AI summary"), ...children);
    iaBox.replaceChildren(page);
  }

  /* The panel is never blank: with no selection it invites the next action. */
  function reset(): void {
    requestController?.abort();
    requestController = null;

    panel(
      createNode(
        "div",
        "ia_empty",
        "Select an article from the feed to display its summary here.",
      ),
    );
  }

  function showLoading(): void {
    const loading = createNode("div", "ia_loading");
    loading.append(
      createNode("div", "ia_loader"),
      createNode("div", "", "Generating summary…"),
    );
    panel(loading);
  }

  function showError(message: string): void {
    panel(createNode("div", "ia_error", `Summary unavailable: ${message}`));
  }

  function render(article: Article, details: AIDetails): void {
    const page = createNode("article", "ia_page");
    page.append(createNode("div", "ia_eyebrow", "AI summary"));

    const imageUrl = validBackendUrl(article.image_url);
    if (imageUrl) {
      const image = createNode("img", "ia_hero");
      image.src = imageUrl;
      image.alt = article.title || "";
      image.loading = "eager";
      page.append(image);
    }

    const meta = createNode("div", "ia_meta");
    [article.source_name, formatDate(article.published_at)]
      .filter((value): value is string => Boolean(value))
      .forEach((value, index) => {
        if (index) meta.append(createNode("span", "", "·"));
        meta.append(createNode("span", "", value));
      });
    if (article.category) {
      meta.append(createNode("span", "ia_category", article.category));
    }

    page.append(
      meta,
      createNode("h2", "ia_title", article.title || "News summary"),
    );

    const sections = createNode("div", "ia_sections");
    sections.append(
      section(
        details.generated_by_ai
          ? "Summary (AI-generated)"
          : "Summary (source excerpts — local AI unavailable)",
        createNode(
          "p",
          "",
          details.synthesis || "No content is available for the summary.",
        ),
      ),
    );

    const keyPoints = stringItems(details.key_points);
    const entities = stringItems(details.entities);
    const related = stringItems(details.related);
    const sameTopic = objectItems<RelatedArticle>(article.same_topic);

    if (keyPoints.length) {
      sections.append(section("Key points", list(keyPoints)));
    }
    if (entities.length) {
      sections.append(section("People, companies and technologies", chips(entities)));
    }
    if (related.length) {
      sections.append(section("Related information", list(related)));
    }
    if (sameTopic.length) {
      sections.append(
        section("Other posts about the same topic", relatedItems(sameTopic)),
      );
    }

    const backendSources = objectItems<SourceUsed>(details.sources_used);
    const sources = backendSources.length
      ? backendSources
      : [{
          source: article.source_name,
          title: article.title,
          url: article.url,
        }];

    sections.append(section("Sources used", sourceItems(sources)));
    page.append(sections);
    iaBox.replaceChildren(page);
    iaBox.scrollTop = 0;
  }

  async function open(
    options: Partial<IABoxOpenOptions> = {},
  ): Promise<boolean> {
    const articleUrl = validBackendUrl(options.articleUrl);
    const detailsUrl = validBackendUrl(options.detailsUrl);
    const rawMethod = String(options.detailsMethod || "POST").toUpperCase();
    const detailsMethod: DetailsMethod | null =
      rawMethod === "GET" || rawMethod === "POST" ? rawMethod : null;

    if (!articleUrl || !detailsUrl || !detailsMethod) return false;

    /* Clicking a second article cancels the request still in flight. */
    requestController?.abort();
    requestController = new AbortController();
    showLoading();

    try {
      const [articleResponse, detailsResponse] = await Promise.all([
        requestJson(articleUrl),
        requestJson(detailsUrl, detailsMethod),
      ]);

      const article = unwrapObject(articleResponse, "article") as Article;
      const details = unwrapObject(detailsResponse, "details") as AIDetails;
      render(article, details);
      return true;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      showError(error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  }

  function setActiveTrigger(trigger: HTMLElement): void {
    document
      .querySelectorAll(`${TRIGGER_SELECTOR}.is_active`)
      .forEach((element) => element.classList.remove("is_active"));
    trigger.classList.add("is_active");
  }

  document.addEventListener("click", (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest(TRIGGER_SELECTOR);
    if (!(trigger instanceof HTMLElement)) return;

    const articleUrl = validBackendUrl(trigger.dataset.iaArticleUrl);
    const detailsUrl = validBackendUrl(trigger.dataset.iaDetailsUrl);
    const rawMethod = (trigger.dataset.iaDetailsMethod || "POST").toUpperCase();
    if (
      !articleUrl ||
      !detailsUrl ||
      (rawMethod !== "GET" && rawMethod !== "POST")
    ) return;

    event.preventDefault();
    setActiveTrigger(trigger);
    void open({
      articleUrl,
      detailsUrl,
      detailsMethod: rawMethod,
    });
  });

  reset();

  const globalWindow = window as unknown as Window & {
    IABox: Readonly<IABoxApi>;
  };
  globalWindow.IABox = Object.freeze({ open, reset, render });
})();
