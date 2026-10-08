/*
  The reader: "Read" on a card opens the article in a panel on the right.

  Publishers refuse being shown inside another site in many ways, so nothing
  is framed here. The backend downloads the page and returns the article as
  simple blocks (/api/preview, backend/platforms/reader/), painted below in
  Vao2's own style. When the publisher refuses, the panel says so and links to
  the original page. A YouTube article opens in the official embedded player.

  openReader(source) is called by feed/feed_card.js.
*/

import { element } from "../global/dom.js";
import { videoIdFromEmbed } from "../feed/video_player.js";


const state = {
  // Bumped on every opening, so a slow answer for a previous article is ignored.
  requestId: 0,
  request: null,
  // Where focus goes back when the panel closes.
  returnFocus: null,
};


/* ---- article data ------------------------------------------------------- */

/** What the card already knows about the article, shown while the page loads. */
function articleFromCard(source) {
  let address;
  try {
    address = new URL(source.url);
  } catch {
    return null;
  }

  return {
    url: source.url,
    title: source.title || "",
    outlet: source.outlet || address.hostname.replace(/^www\./, ""),
    image: source.image_url || "",
    published: source.published_at || "",
    summary: source.summary || "",
  };
}

async function fetchArticle(url, signal) {
  const query = new URLSearchParams({ url });
  const response = await fetch(`/api/preview?${query}`, { signal });

  if (!response.ok) {
    throw new Error("This source could not be read.");
  }

  return response.json();
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  // A bare date ("2026-10-06") is read at noon, so no time zone shifts the day.
  const date = new Date(value.length === 10 ? `${value}T12:00` : value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}


/* ---- article body ------------------------------------------------------- */

function figure(url, alt = "") {
  const root = element("figure", "reader_figure");

  const image = element("img");
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";

  // A broken photo would look like a failed preview: drop it.
  image.addEventListener("error", () => root.remove());

  root.append(image);

  // Publishers often put the caption in the alt text; a short alt is not one.
  if (alt.length > 24) {
    root.append(element("figcaption", "", alt));
  }

  return root;
}

function blockElement(block) {
  if (block.type === "image") {
    return figure(block.url, block.alt || "");
  }

  if (block.type === "heading") {
    const tag = block.level === "2" ? "h2" : "h3";
    return element(tag, "reader_head", block.text);
  }

  if (block.type === "quote") {
    return element("blockquote", "reader_quote", block.text);
  }

  return element("p", "", block.text);
}

function articleBody(blocks) {
  const body = element("div", "reader_body");
  let currentList = null;

  for (const block of blocks || []) {
    // Consecutive list items share one <ul>.
    if (block.type === "list") {
      if (!currentList) {
        currentList = element("ul", "reader_list");
        body.append(currentList);
      }
      currentList.append(element("li", "", block.text));
      continue;
    }

    currentList = null;
    body.append(blockElement(block));
  }

  return body;
}

function loadingSkeleton() {
  const skeleton = element("div", "reader_skeleton");
  skeleton.setAttribute("aria-hidden", "true");

  for (const width of ["96%", "88%", "94%", "62%", "91%", "80%"]) {
    const bar = element("span", "reader_skeleton_bar");
    bar.style.width = width;
    skeleton.append(bar);
  }

  return skeleton;
}

function refusalNotice(article, payload) {
  const notice = element("div", "reader_fallback");

  notice.append(element(
    "p",
    "reader_fallback_text",
    `${article.outlet} does not serve its article text here. Open the original for the full page.`,
  ));

  const link = element("a", "reader_open", "Open the original ↗");
  link.href = payload?.url || article.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const actions = element("div", "reader_fallback_actions");
  actions.append(link);
  notice.append(actions);

  return notice;
}

function metaLine(parts) {
  const line = element("div", "reader_meta");

  for (const part of parts) {
    if (part) {
      line.append(element("span", "", part));
    }
  }

  return line;
}


/* ---- the panel ---------------------------------------------------------- */

function setHeader(title, domain, url) {
  document.getElementById("reader_sheet_title").textContent = title;
  document.getElementById("reader_sheet_domain").textContent = domain;
  document.getElementById("reader_sheet_external").href = url;
}

function setNotice(text) {
  document.getElementById("reader_sheet_notice").textContent = text;
}

function showContent(node) {
  const body = document.getElementById("reader_sheet_body");
  body.replaceChildren(node);
  body.scrollTop = 0;
}

/**
 * Draw the article. `payload` is the backend's answer, or null while it is
 * still loading (the card's own title, image and summary are shown meanwhile).
 */
function paintArticle(article, payload) {
  const title = payload?.title || article.title || article.outlet;
  setHeader(title, payload?.domain || article.outlet, payload?.url || article.url);

  const page = element("article", "reader");

  const leadImage = payload?.lead_image || article.image;
  if (leadImage) {
    page.append(figure(leadImage, ""));
  }

  page.append(element("h1", "reader_title", title));

  const meta = metaLine([
    payload?.site || article.outlet,
    payload?.byline || "",
    formatDate(payload?.published_at || article.published),
  ]);

  // The reader is told when ads were taken out of what they read.
  const removedAds = Number(payload?.blocked) || 0;
  if (removedAds) {
    const plural = removedAds > 1 ? "s" : "";
    meta.append(element("span", "reader_blocked", `${removedAds} ad${plural} removed`));
  }

  if (meta.childElementCount) {
    page.append(meta);
  }

  if (!payload) {
    if (article.summary) {
      page.append(element("p", "reader_standfirst", article.summary));
    }
    page.append(loadingSkeleton());
    showContent(page);
    return;
  }

  const blocks = payload.blocks || [];
  const hasText = blocks.some((block) => block.type !== "image");

  if (!hasText && article.summary) {
    page.append(element("p", "reader_standfirst", article.summary));
  }

  if (blocks.length) {
    page.append(articleBody(blocks));
  }

  if (payload.status !== "ok") {
    page.append(refusalNotice(article, payload));
  }

  showContent(page);
}

function createPanel() {
  const scrim = element("div", "reader_scrim");
  scrim.id = "reader_scrim";
  scrim.setAttribute("aria-hidden", "true");

  const sheet = element("aside", "reader_sheet");
  sheet.id = "reader_sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Article reader");
  sheet.setAttribute("aria-hidden", "true");
  sheet.innerHTML = `
    <header class="reader_sheet_head">
      <div class="reader_sheet_identity">
        <strong id="reader_sheet_title">Article</strong>
        <span id="reader_sheet_domain"></span>
      </div>
      <a id="reader_sheet_external" class="reader_sheet_external" href="#" target="_blank" rel="noopener noreferrer">Open source ↗</a>
      <button id="reader_sheet_close" class="reader_sheet_close" type="button" aria-label="Close reader">×</button>
    </header>
    <p id="reader_sheet_notice" class="reader_sheet_notice" aria-live="polite"></p>
    <div id="reader_sheet_body" class="reader_scroll" tabindex="0"></div>`;

  document.body.append(scrim, sheet);

  sheet.querySelector("#reader_sheet_close").addEventListener("click", closeReader);
  scrim.addEventListener("click", closeReader);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sheet.classList.contains("is_open")) {
      closeReader();
    }
  });

  return sheet;
}

/** The panel, created the first time it is needed. */
function panel() {
  return document.getElementById("reader_sheet") || createPanel();
}

function showPanel(sheet, isLoading) {
  if (!sheet.classList.contains("is_open")) {
    state.returnFocus = document.activeElement;
  }

  sheet.classList.add("is_open");
  sheet.classList.toggle("is_loading", isLoading);
  sheet.setAttribute("aria-hidden", "false");
  document.getElementById("reader_scrim").classList.add("is_open");
}

/** Cancel the article being loaded, if any. Returns the id of the new opening. */
function startNewRequest() {
  state.requestId += 1;
  state.request?.abort();
  state.request = null;
  return state.requestId;
}


/* ---- YouTube ------------------------------------------------------------ */

function youtubePlayer(videoId, title) {
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  embed.searchParams.set("rel", "0");

  const iframe = element("iframe");
  iframe.src = embed.href;
  iframe.title = `Play ${title}`;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";

  const frame = element("div", "reader_video");
  frame.append(iframe);
  return frame;
}

function openYouTube(source, videoId) {
  const article = articleFromCard(source);
  const title = article.title || "YouTube video";
  const outlet = article.outlet || "YouTube";

  startNewRequest();
  showPanel(panel(), false);

  setHeader(title, outlet, article.url);
  setNotice("Official YouTube embedded player");

  const page = element("article", "reader");
  page.append(youtubePlayer(videoId, title), element("h1", "reader_title", title));
  page.append(metaLine([outlet, formatDate(article.published)]));

  if (article.summary) {
    page.append(element("p", "reader_standfirst", article.summary));
  }

  showContent(page);
  document.getElementById("reader_sheet_close").focus();
}


/* ---- opening and closing ------------------------------------------------ */

export async function openReader(source) {
  // A YouTube card plays in the official player rather than being read.
  if (source.platform === "youtube" && source.media_url) {
    openYouTube(source, videoIdFromEmbed(source.media_url));
    return;
  }

  const article = articleFromCard(source);
  if (!article) {
    return;
  }

  const sheet = panel();
  const requestId = startNewRequest();
  state.request = new AbortController();
  const { signal } = state.request;

  showPanel(sheet, true);
  paintArticle(article, null);
  setNotice("Reading the source…");
  document.getElementById("reader_sheet_close").focus();

  let payload = null;
  try {
    payload = await fetchArticle(article.url, signal);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }
  }

  // Another article was opened, or the panel closed, while this one loaded.
  if (state.requestId !== requestId) {
    return;
  }

  sheet.classList.remove("is_loading");
  paintArticle(article, payload || { status: "blocked", blocks: [] });
  setNotice(payload?.note || "This source could not be read. Open the original page for the full article.");
}

function closeReader() {
  const sheet = document.getElementById("reader_sheet");

  sheet.classList.remove("is_open", "is_loading");
  sheet.setAttribute("aria-hidden", "true");
  document.getElementById("reader_scrim").classList.remove("is_open");

  startNewRequest();
  document.getElementById("reader_sheet_body").replaceChildren();
  setNotice("");

  if (state.returnFocus?.isConnected) {
    state.returnFocus.focus();
  }
  state.returnFocus = null;
}
