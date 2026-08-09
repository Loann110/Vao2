"use strict";
(() => {
    "use strict";
    const TRIGGER_SELECTOR = "[data-ia-article-url][data-ia-details-url]";
    const iaBoxElement = document.getElementById("ia_box");
    if (!(iaBoxElement instanceof HTMLElement))
        return;
    const iaBox = iaBoxElement;
    let requestController = null;
    let answerController = null;
    const conversations = new Map();
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
            throw new Error("Invalid JSON response");
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
            : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
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
            throw new Error(await friendlyResponseError(response));
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            throw new Error("The backend must return JSON");
        }
        return response.json();
    }
    async function requestStream(url, method, onEvent, body = null, signal = requestController?.signal) {
        const headers = { Accept: "application/x-ndjson" };
        if (body !== null)
            headers["Content-Type"] = "application/json";
        const response = await fetch(url, {
            method,
            credentials: "same-origin",
            headers,
            body: body === null ? undefined : JSON.stringify(body),
            signal,
        });
        if (!response.ok)
            throw new Error(await friendlyResponseError(response));
        if (!response.body)
            throw new Error("Streaming is not supported by this browser");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { value, done } = await reader.read();
            buffer += value ? decoder.decode(value, { stream: !done }) : "";
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (line.trim())
                    onEvent(JSON.parse(line));
            }
            if (done)
                break;
        }
        if (buffer.trim())
            onEvent(JSON.parse(buffer));
    }
    async function friendlyResponseError(response) {
        if (response.status >= 500)
            return "The local AI could not complete this request. Please try again.";
        try {
            const payload = await response.json();
            if (typeof payload.detail === "string" && payload.detail.trim())
                return payload.detail;
        }
        catch {
            // Fall back to a human-readable status below.
        }
        if (response.status === 404)
            return "This content is no longer available.";
        return "The request could not be completed. Please try again.";
    }
    function section(title, content) {
        const wrapper = createNode("section", "ia_section");
        wrapper.append(createNode("h3", "", title), content);
        return wrapper;
    }
    function collapsibleSection(title, content) {
        const wrapper = createNode("details", "ia_accordion");
        const body = createNode("div", "ia_accordion_body");
        body.append(content);
        wrapper.append(createNode("summary", "", title), body);
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
            const link = externalLink(item.url, "Open");
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
            const link = externalLink(item.url, "Original content");
            if (link)
                row.append(link);
            wrapper.append(row);
        });
        return wrapper;
    }
    function panel(...children) {
        const page = createNode("div", "ia_page");
        page.append(createNode("div", "ia_eyebrow", "AI assistant"), ...children);
        mountPage(page);
    }
    function mountPage(page) {
        const close = createNode("button", "ia_close", "×");
        close.type = "button";
        close.setAttribute("aria-label", "Close AI assistant");
        close.addEventListener("click", closeDrawer);
        iaBox.replaceChildren(close, page);
    }
    function openDrawer() {
        document.body.classList.add("ia_box_open");
        if (window.matchMedia("(max-width: 1180px)").matches) {
            iaBox.setAttribute("role", "dialog");
            iaBox.setAttribute("aria-modal", "true");
            iaBox.querySelector(".ia_close")?.focus();
        }
    }
    function closeDrawer() {
        document.body.classList.remove("ia_box_open");
        iaBox.removeAttribute("role");
        iaBox.removeAttribute("aria-modal");
        document.querySelector(`${TRIGGER_SELECTOR}.is_active`)?.focus();
    }
    /* The panel is never blank: with no selection it invites the next action. */
    function reset() {
        requestController?.abort();
        answerController?.abort();
        requestController = null;
        answerController = null;
        panel(createNode("div", "ia_empty", "Select an article from the feed to display its summary here."));
    }
    function showLoading() {
        const skeleton = createNode("div", "ia_skeleton");
        skeleton.append(createNode("div", "ia_skeleton_hero"), createNode("div", "ia_skeleton_line is_short"), createNode("div", "ia_skeleton_line is_title"), createNode("div", "ia_skeleton_tabs"), createNode("div", "ia_skeleton_card"));
        panel(skeleton);
    }
    function showError(message) {
        const error = createNode("div", "ia_error");
        error.append(createNode("strong", "", "Summary unavailable"), createNode("p", "", message));
        panel(error);
    }
    function chatMessage(role, text) {
        const row = createNode("div", `ia_message_row is_${role}`);
        const avatar = createNode("span", "ia_message_avatar", role === "ai" ? "AI" : "You");
        const bubble = createNode("div", `ia_message ia_message_${role}`, text);
        row.append(avatar, bubble);
        return { row, bubble };
    }
    function questionBox(article, enabled, suggestedQuestions = []) {
        const wrapper = createNode("div", "ia_ask");
        const conversation = createNode("div", "ia_conversation");
        conversation.setAttribute("role", "log");
        conversation.setAttribute("aria-live", "polite");
        conversation.setAttribute("aria-label", `Conversation about ${article.title || "this content"}`);
        const composer = createNode("div", "ia_ask_composer");
        const suggestions = createNode("div", "ia_ask_suggestions");
        suggestions.setAttribute("aria-label", "Suggested questions");
        const form = createNode("form", "ia_ask_form");
        const input = createNode("textarea", "ia_ask_input");
        input.name = "question";
        input.rows = 2;
        input.maxLength = 500;
        input.placeholder = article.platform === "youtube" ? "Ask something about this video…" : "Ask something about this article…";
        input.setAttribute("aria-label", "Question for the AI assistant");
        input.setAttribute("aria-describedby", "ia_ask_help ia_ask_validation");
        input.disabled = !enabled;
        const button = createNode("button", "ia_ask_button", "Ask");
        button.type = "submit";
        button.disabled = !enabled;
        button.dataset.mode = "ask";
        const help = createNode("div", "ia_ask_help", "Enter to send · Shift+Enter for a new line");
        help.id = "ia_ask_help";
        const validation = createNode("div", "ia_ask_validation");
        validation.id = "ia_ask_validation";
        validation.setAttribute("role", "status");
        const history = conversations.get(String(article.id)) || [];
        history.forEach((message) => conversation.append(chatMessage(message.role, message.text).row));
        const smartSuggestions = stringItems(suggestedQuestions).slice(0, 3);
        const questionSuggestions = smartSuggestions.length ? smartSuggestions : ["What is the main point?", "What evidence is provided?", "What happens next?"];
        questionSuggestions.forEach((label) => {
            const chip = createNode("button", "ia_suggestion", label);
            chip.type = "button";
            chip.disabled = !enabled;
            chip.addEventListener("click", () => {
                input.value = label;
                form.requestSubmit();
            });
            suggestions.append(chip);
        });
        form.append(input, button);
        composer.append(suggestions, form, help, validation);
        if (!enabled)
            wrapper.append(createNode("div", "ia_ask_hint", "Available after the summary is generated."));
        wrapper.append(conversation, composer);

        input.addEventListener("input", () => {
            validation.textContent = "";
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                form.requestSubmit();
            }
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (button.dataset.mode === "stop") {
                answerController?.abort();
                return;
            }
            const question = input.value.trim();
            if (!article.id)
                return;
            if (question.length < 2) {
                validation.textContent = "Enter a question of at least 2 characters.";
                input.focus();
                return;
            }
            answerController?.abort();
            answerController = new AbortController();
            input.value = "";
            input.disabled = true;
            suggestions.querySelectorAll("button").forEach((chip) => chip.disabled = true);
            button.textContent = "Stop";
            button.dataset.mode = "stop";
            button.classList.add("is_stop");
            const userMessage = chatMessage("user", question);
            const aiMessage = chatMessage("ai", "Thinking…");
            const articleHistory = conversations.get(String(article.id)) || [];
            articleHistory.push({ role: "user", text: question });
            conversations.set(String(article.id), articleHistory);
            aiMessage.bubble.classList.add("is_streaming");
            conversation.append(userMessage.row, aiMessage.row);
            conversation.scrollTop = conversation.scrollHeight;
            let started = false;
            try {
                await requestStream(`/api/articles/${article.id}/ask/stream`, "POST", (streamEvent) => {
                    if (!isRecord(streamEvent))
                        return;
                    if (streamEvent.type === "status" && !started)
                        aiMessage.bubble.textContent = String(streamEvent.message || "Thinking…");
                    else if (streamEvent.type === "delta") {
                        if (!started) {
                            aiMessage.bubble.textContent = "";
                            started = true;
                        }
                        aiMessage.bubble.textContent += String(streamEvent.text || "");
                        conversation.scrollTop = conversation.scrollHeight;
                    }
                    else if (streamEvent.type === "complete") {
                        aiMessage.bubble.classList.remove("is_streaming");
                        articleHistory.push({ role: "ai", text: aiMessage.bubble.textContent });
                    }
                }, { question }, answerController.signal);
            }
            catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") {
                    if (!started)
                        aiMessage.bubble.textContent = "Generation stopped.";
                }
                else {
                    aiMessage.bubble.textContent = error instanceof Error ? error.message : "The answer is unavailable. Please try again.";
                    aiMessage.bubble.classList.add("is_error");
                }
                aiMessage.bubble.classList.remove("is_streaming");
                articleHistory.push({ role: "ai", text: aiMessage.bubble.textContent });
            }
            finally {
                input.disabled = false;
                suggestions.querySelectorAll("button").forEach((chip) => chip.disabled = false);
                button.textContent = "Ask";
                button.dataset.mode = "ask";
                button.classList.remove("is_stop");
                input.focus();
            }
        });
        return wrapper;
    }
    function render(article, details, askEnabled = true) {
        const page = createNode("article", "ia_page");
        const header = createNode("header", "ia_article_header");
        const imageUrl = validBackendUrl(article.image_url);
        if (imageUrl) {
            header.classList.add("has_image");
            const image = createNode("img", "ia_hero");
            image.src = imageUrl;
            image.alt = article.title || "";
            image.loading = "eager";
            header.append(image);
        }
        const headerText = createNode("div", "ia_header_text");
        headerText.append(createNode("h2", "ia_title", article.title || "News summary"));
        if (article.source_name)
            headerText.append(createNode("div", "ia_header_source", article.source_name));
        header.append(headerText);
        const sections = createNode("div", "ia_sections");
        const summaryText = createNode("p", "ia_summary_text", details.synthesis || "No content is available for the summary.");
        sections.append(section(details.generated_by_ai
            ? "Summary (AI-generated)"
            : "Summary (source excerpts — local AI unavailable)", summaryText));
        const keyPoints = stringItems(details.key_points);
        const entities = stringItems(details.entities);
        const related = stringItems(details.related);
        const sameTopic = objectItems(article.same_topic);
        if (keyPoints.length) {
            sections.append(section("Key points", list(keyPoints)));
        }
        if (entities.length) {
            sections.append(section("People, companies and technologies", chips(entities)));
        }
        if (related.length) {
            sections.append(collapsibleSection("Related information", list(related)));
        }
        if (sameTopic.length) {
            sections.append(collapsibleSection("Other posts about the same topic", relatedItems(sameTopic)));
        }
        const backendSources = objectItems(details.sources_used);
        const sources = backendSources.length
            ? backendSources
            : [{
                    source: article.source_name,
                    title: article.title,
                    url: article.url,
                }];
        sections.append(collapsibleSection("Sources used", sourceItems(sources)));
        const summaryPanel = createNode("div", "ia_tab_panel is_active");
        summaryPanel.id = "ia_summary_panel";
        summaryPanel.setAttribute("role", "tabpanel");
        summaryPanel.append(sections);
        const askPanel = createNode("div", "ia_tab_panel ia_chat_panel");
        askPanel.id = "ia_ask_panel";
        askPanel.setAttribute("role", "tabpanel");
        askPanel.append(questionBox(article, askEnabled, details.suggested_questions));
        const tabs = createNode("div", "ia_tabs");
        tabs.setAttribute("role", "tablist");
        const summaryTab = createNode("button", "ia_tab is_active", "Summary");
        const askTab = createNode("button", "ia_tab", "Ask AI");
        [[summaryTab, summaryPanel], [askTab, askPanel]].forEach(([tab, panel]) => {
            tab.type = "button";
            tab.setAttribute("role", "tab");
            tab.id = `${panel.id}_tab`;
            tab.setAttribute("aria-controls", panel.id);
            panel.setAttribute("aria-labelledby", tab.id);
            tab.setAttribute("aria-selected", tab.classList.contains("is_active") ? "true" : "false");
            tab.tabIndex = tab.classList.contains("is_active") ? 0 : -1;
            tab.addEventListener("click", () => {
                tabs.querySelectorAll(".ia_tab").forEach((item) => {
                    item.classList.toggle("is_active", item === tab);
                    item.setAttribute("aria-selected", item === tab ? "true" : "false");
                    item.tabIndex = item === tab ? 0 : -1;
                });
                page.querySelectorAll(".ia_tab_panel").forEach((item) => item.classList.toggle("is_active", item === panel));
            });
            tabs.append(tab);
        });
        tabs.addEventListener("keydown", (event) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
                return;
            event.preventDefault();
            const tabItems = [...tabs.querySelectorAll(".ia_tab")];
            const current = tabItems.indexOf(document.activeElement);
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const next = tabItems[(current + direction + tabItems.length) % tabItems.length];
            next.click();
            next.focus();
        });
        page.append(header, tabs, summaryPanel, askPanel);
        mountPage(page);
        iaBox.scrollTop = 0;
    }
    function beginProgress(article) {
        render(article, {
            synthesis: " ", generated_by_ai: true,
            key_points: [], entities: [], related: [], sources_used: [],
        }, false);
        const text = iaBox.querySelector(".ia_summary_text");
        if (!(text instanceof HTMLElement))
            throw new Error("Unable to display the progressive summary");
        text.textContent = "";
        text.classList.add("is_streaming");
        const status = createNode("div", "ia_stream_status", "Preparing article…");
        text.before(status);
        return { text, status };
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
        answerController?.abort();
        requestController = new AbortController();
        answerController = null;
        showLoading();
        openDrawer();
        try {
            const articleResponse = await requestJson(articleUrl);
            const article = unwrapObject(articleResponse, "article");
            const progress = beginProgress(article);
            const streamUrl = `${detailsUrl.replace(/\/$/, "")}/stream`;
            await requestStream(streamUrl, detailsMethod, (event) => {
                if (!isRecord(event))
                    return;
                if (event.type === "status")
                    progress.status.textContent = String(event.message || "Working…");
                else if (event.type === "delta") {
                    progress.status.textContent = "Writing summary…";
                    progress.text.textContent += String(event.text || "");
                }
                else if (event.type === "complete")
                    render(article, unwrapObject(event, "details"));
            });
            return true;
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                return false;
            showError(error instanceof Error ? error.message : "Unknown error");
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
    document.getElementById("ia_box_backdrop")?.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (event) => {
        const drawerOpen = document.body.classList.contains("ia_box_open") && window.matchMedia("(max-width: 1180px)").matches;
        if (event.key === "Escape" && drawerOpen) {
            closeDrawer();
            return;
        }
        if (event.key === "Tab" && drawerOpen) {
            const focusable = [...iaBox.querySelectorAll('button:not(:disabled), textarea:not(:disabled), a[href], summary')];
            if (!focusable.length)
                return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    reset();
    const globalWindow = window;
    globalWindow.IABox = Object.freeze({ open, reset, render });
})();
