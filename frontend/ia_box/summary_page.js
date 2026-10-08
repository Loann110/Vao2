/*
  The page the AI panel shows for one article: a small header (image, title,
  source), then two tabs, "Summary" and "Ask AI" (chat.js).
*/

import { element } from "../global/dom.js";
import { phosphorIcon } from "../global/icons.js";
import { chatTab } from "./chat.js";


function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}


/* ---- header ------------------------------------------------------------- */

function articleHeader(article) {
  const header = element("header", "ia_article_header");

  const imageUrl = safeUrl(article.image_url);
  if (imageUrl) {
    header.classList.add("has_image");

    const image = element("img", "ia_hero");
    image.src = imageUrl;
    image.alt = article.title || "";
    image.loading = "eager";
    header.append(image);
  }

  const text = element("div", "ia_header_text");
  text.append(element("h2", "ia_title", article.title || "News summary"));
  if (article.source_name) {
    text.append(element("div", "ia_header_source", article.source_name));
  }

  header.append(text);
  return header;
}


/* ---- summary tab -------------------------------------------------------- */

function section(heading, content) {
  const wrapper = element("section", "ia_section");
  wrapper.append(heading, content);
  return wrapper;
}

function foldableSection(title, content) {
  const body = element("div", "ia_accordion_body");
  body.append(content);

  const wrapper = element("details", "ia_accordion");
  wrapper.append(element("summary", "", title), body);
  return wrapper;
}

function sourceRows(sources) {
  const list = element("div");

  for (const source of sources) {
    const text = element("div");
    text.append(
      element("div", "ia_item_title", source.source || "Source"),
      element("div", "ia_item_meta", source.title || ""),
    );

    const row = element("div", "ia_source");
    row.append(text);

    const url = safeUrl(source.url);
    if (url) {
      const link = element("a", "ia_link");
      link.append(phosphorIcon("arrow-square-out"));
      link.setAttribute("aria-label", "Open the original content");
      link.title = "Open the original content";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      row.append(link);
    }

    list.append(row);
  }

  return list;
}

function summaryTab(article, details) {
  const badge = details.generated_by_ai
    ? element("span", "ia_badge", "AI-generated")
    : element("span", "ia_badge is_plain", "Source excerpts, local AI unavailable");

  const heading = element("h3", "", "Summary");
  heading.append(badge);

  const text = element("p", "ia_summary_text", details.synthesis || "No content is available for the summary.");

  let sources = details.sources_used || [];
  if (!sources.length) {
    sources = [{ source: article.source_name, title: article.title, url: article.url }];
  }

  const sections = element("div", "ia_sections");
  sections.append(
    section(heading, text),
    foldableSection("Sources used", sourceRows(sources)),
  );

  return sections;
}


/* ---- tabs --------------------------------------------------------------- */

function tabPanel(id, className) {
  const panel = element("div", className);
  panel.id = id;
  panel.setAttribute("role", "tabpanel");
  return panel;
}

function selectTab(tabs, panels, selectedTab) {
  for (const tab of tabs) {
    const isSelected = tab === selectedTab;

    tab.classList.toggle("is_active", isSelected);
    tab.setAttribute("aria-selected", isSelected ? "true" : "false");
    tab.tabIndex = isSelected ? 0 : -1;
  }

  for (const panel of panels) {
    const isSelected = panel.id === selectedTab.getAttribute("aria-controls");
    panel.classList.toggle("is_active", isSelected);
  }
}

function tabBar(entries) {
  const bar = element("div", "ia_tabs");
  bar.setAttribute("role", "tablist");

  const tabs = [];
  const panels = entries.map((entry) => entry.panel);

  for (const { label, panel, isActive } of entries) {
    const tab = element("button", isActive ? "ia_tab is_active" : "ia_tab", label);
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.id = `${panel.id}_tab`;
    tab.setAttribute("aria-controls", panel.id);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.tabIndex = isActive ? 0 : -1;

    panel.setAttribute("aria-labelledby", tab.id);

    tab.addEventListener("click", () => selectTab(tabs, panels, tab));
    tabs.push(tab);
    bar.append(tab);
  }

  // Left and right arrows move between tabs.
  bar.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    const step = event.key === "ArrowRight" ? 1 : -1;
    const current = tabs.indexOf(document.activeElement);
    const next = tabs[(current + step + tabs.length) % tabs.length];

    next.click();
    next.focus();
  });

  return bar;
}


/* ---- the page ----------------------------------------------------------- */

/**
 * The whole page for an article. While the summary is still being written,
 * `askEnabled` is false and the chat waits for it.
 */
export function summaryPage(article, details, askEnabled = true) {
  const summaryPanel = tabPanel("ia_summary_panel", "ia_tab_panel is_active");
  summaryPanel.append(summaryTab(article, details));

  const askPanel = tabPanel("ia_ask_panel", "ia_tab_panel ia_chat_panel");
  askPanel.append(chatTab(article, askEnabled, details.suggested_questions));

  const tabs = tabBar([
    { label: "Summary", panel: summaryPanel, isActive: true },
    { label: "Ask AI", panel: askPanel, isActive: false },
  ]);

  const page = element("article", "ia_page");
  page.append(articleHeader(article), tabs, summaryPanel, askPanel);
  return page;
}
