"use strict";
(() => {
    "use strict";
    const TRIGGER_SELECTOR = "[data-ia-article-url][data-ia-details-url]";
    const iaBoxElement = document.getElementById("ia_box");
    if (!(iaBoxElement instanceof HTMLElement))
        return;
    const iaBox = iaBoxElement;
    let requestController = null;
    function createNode(tag, className = "", text = "") {
        const element = document.createElement(tag);
        if (className)
            element.className = className;
        if (text !== "")
            element.textContent = String(text);
        return element;
    }
    function isRecord(value) {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    function unwrapObject(payload, property) {
        if (!isRecord(payload))
            throw new Error("Réponse JSON invalide");
        const nested = payload[property];
        return isRecord(nested) ? nested : payload;
    }
    function validBackendUrl(value) {
        if (typeof value !== "string" || !value.trim())
            return null;
        try {
            const url = new URL(value, window.location.href);
            return ["http:", "https:"].includes(url.protocol) ? url.href : null;
        }
        catch {
            return null;
        }
    }
    function formatDate(value) {
        if (!value)
            return "";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? ""
            : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
    }
    function stringItems(value) {
        return Array.isArray(value)
            ? value.filter((item) => typeof item === "string")
            : [];
    }
    function objectItems(value) {
        return Array.isArray(value)
            ? value.filter(isRecord)
            : [];
    }
    async function requestJson(url, method = "GET") {
        const response = await fetch(url, {
            method,
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: requestController?.signal,
        });
        if (!response.ok)
            throw new Error(`Erreur backend ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            throw new Error("Le backend doit retourner du JSON");
        }
        return response.json();
    }
    function section(title, content) {
        const wrapper = createNode("section", "ia_section");
        wrapper.append(createNode("h3", "", title), content);
        return wrapper;
    }
    function list(items) {
        const ul = createNode("ul");
        items.forEach((item) => ul.append(createNode("li", "", item)));
        return ul;
    }
    function chips(items) {
        const wrapper = createNode("div", "ia_chips");
        items.forEach((item) => wrapper.append(createNode("span", "ia_chip", item)));
        return wrapper;
    }
    function externalLink(url, label) {
        const href = validBackendUrl(url);
        if (!href)
            return null;
        const link = createNode("a", "ia_link", label);
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        return link;
    }
    function relatedItems(items) {
        const wrapper = createNode("div");
        items.forEach((item) => {
            const row = createNode("div", "ia_related");
            const text = createNode("div");
            text.append(createNode("div", "ia_item_title", item.title || item.name || "Publication"), createNode("div", "ia_item_meta", [item.source_name || item.source, formatDate(item.published_at)]
                .filter(Boolean)
                .join(" · ")));
            row.append(text);
            const link = externalLink(item.url, "Ouvrir");
            if (link)
                row.append(link);
            wrapper.append(row);
        });
        return wrapper;
    }
    function sourceItems(items) {
        const wrapper = createNode("div");
        items.forEach((item) => {
            const row = createNode("div", "ia_source");
            const text = createNode("div");
            text.append(createNode("div", "ia_item_title", item.source || "Source"), createNode("div", "ia_item_meta", item.title || ""));
            row.append(text);
            const link = externalLink(item.url, "Contenu original");
            if (link)
                row.append(link);
            wrapper.append(row);
        });
        return wrapper;
    }
    function panel(...children) {
        const page = createNode("div", "ia_page");
        page.append(createNode("div", "ia_eyebrow", "Synthèse"), ...children);
        iaBox.replaceChildren(page);
    }
    /* The panel is never blank: with no selection it invites the next action. */
    function reset() {
        requestController?.abort();
        requestController = null;
        panel(createNode("div", "ia_empty", "Choisis un article dans le feed pour afficher sa synthèse ici."));
    }
    function showLoading() {
        const loading = createNode("div", "ia_loading");
        loading.append(createNode("div", "ia_loader"), createNode("div", "", "Génération de la synthèse en cours…"));
        panel(loading);
    }
    function showError(message) {
        panel(createNode("div", "ia_error", `Synthèse indisponible : ${message}`));
    }
    function render(article, details) {
        const page = createNode("article", "ia_page");
        page.append(createNode("div", "ia_eyebrow", "Synthèse"));
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
            .filter((value) => Boolean(value))
            .forEach((value, index) => {
            if (index)
                meta.append(createNode("span", "", "·"));
            meta.append(createNode("span", "", value));
        });
        if (article.category) {
            meta.append(createNode("span", "ia_category", article.category));
        }
        page.append(meta, createNode("h2", "ia_title", article.title || "Résumé de l’actualité"), createNode("div", "ia_notice", "Synthèse générée automatiquement — se référer aux sources listées."));
        const sections = createNode("div", "ia_sections");
        sections.append(section(details.generated_by_ai
            ? "Synthèse (générée par IA)"
            : "Synthèse (extraits de la source — IA locale indisponible)", createNode("p", "", details.synthesis || "Aucun contenu disponible pour la synthèse.")));
        const keyPoints = stringItems(details.key_points);
        const entities = stringItems(details.entities);
        const related = stringItems(details.related);
        const sameTopic = objectItems(article.same_topic);
        if (keyPoints.length) {
            sections.append(section("Points essentiels", list(keyPoints)));
        }
        if (entities.length) {
            sections.append(section("Personnes, entreprises et technologies", chips(entities)));
        }
        if (related.length) {
            sections.append(section("Informations connexes", list(related)));
        }
        if (sameTopic.length) {
            sections.append(section("Autres publications sur le même sujet", relatedItems(sameTopic)));
        }
        const backendSources = objectItems(details.sources_used);
        const sources = backendSources.length
            ? backendSources
            : [{
                    source: article.source_name,
                    title: article.title,
                    url: article.url,
                }];
        sections.append(section("Sources utilisées", sourceItems(sources)));
        page.append(sections);
        iaBox.replaceChildren(page);
        iaBox.scrollTop = 0;
    }
    async function open(options = {}) {
        const articleUrl = validBackendUrl(options.articleUrl);
        const detailsUrl = validBackendUrl(options.detailsUrl);
        const rawMethod = String(options.detailsMethod || "POST").toUpperCase();
        const detailsMethod = rawMethod === "GET" || rawMethod === "POST" ? rawMethod : null;
        if (!articleUrl || !detailsUrl || !detailsMethod)
            return false;
        /* Clicking a second article cancels the request still in flight. */
        requestController?.abort();
        requestController = new AbortController();
        showLoading();
        try {
            const [articleResponse, detailsResponse] = await Promise.all([
                requestJson(articleUrl),
                requestJson(detailsUrl, detailsMethod),
            ]);
            const article = unwrapObject(articleResponse, "article");
            const details = unwrapObject(detailsResponse, "details");
            render(article, details);
            return true;
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                return false;
            showError(error instanceof Error ? error.message : "Erreur inconnue");
            return false;
        }
    }
    function setActiveTrigger(trigger) {
        document
            .querySelectorAll(`${TRIGGER_SELECTOR}.is_active`)
            .forEach((element) => element.classList.remove("is_active"));
        trigger.classList.add("is_active");
    }
    document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element))
            return;
        const trigger = event.target.closest(TRIGGER_SELECTOR);
        if (!(trigger instanceof HTMLElement))
            return;
        const articleUrl = validBackendUrl(trigger.dataset.iaArticleUrl);
        const detailsUrl = validBackendUrl(trigger.dataset.iaDetailsUrl);
        const rawMethod = (trigger.dataset.iaDetailsMethod || "POST").toUpperCase();
        if (!articleUrl ||
            !detailsUrl ||
            (rawMethod !== "GET" && rawMethod !== "POST"))
            return;
        event.preventDefault();
        setActiveTrigger(trigger);
        void open({
            articleUrl,
            detailsUrl,
            detailsMethod: rawMethod,
        });
    });
    reset();
    const globalWindow = window;
    globalWindow.IABox = Object.freeze({ open, reset, render });
})();
