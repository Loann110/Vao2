/*
  The AI panel on the right: "Summarize" on a card shows the article's summary
  there, written live by the local model, with an "Ask AI" tab under it.

  On narrow screens (under 1180px) the panel becomes a drawer over the page.

  The summary streams from /api/articles/{id}/summary/stream
  (backend/routes/assistant.py). The page itself is built by summary_page.js.
*/

import { fetchJson, readEventStream } from "../global/api.js";
import { element } from "../global/dom.js";
import { phosphorIcon } from "../global/icons.js";
import { stopAnswer } from "./chat.js";
import { summaryPage } from "./summary_page.js";


const TRIGGER_SELECTOR = ".feed_card_summarize[data-article-id]";
const DRAWER_QUERY = "(max-width: 1180px)";

let panel = null;

// The summary being loaded, so a second click cancels the first one.
let summaryRequest = null;


/* ---- showing a page in the panel ---------------------------------------- */

function show(page) {
  const close = element("button", "ia_close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close AI assistant");
  close.addEventListener("click", closeDrawer);

  panel.replaceChildren(close, page);
}

/** A simple page: the "AI assistant" label above some content. */
function showMessage(...children) {
  const page = element("div", "ia_page");
  page.append(element("div", "ia_eyebrow", "AI assistant"), ...children);
  show(page);
}

function showEmpty() {
  const empty = element("div", "ia_empty");
  empty.append(
    phosphorIcon("sparkle", "ia_empty_icon"),
    element("strong", "", "Nothing selected yet"),
    element("p", "", "Press Summarize on an article to see its summary here, then ask questions about it."),
  );

  showMessage(empty);
}

function showLoading() {
  const skeleton = element("div", "ia_skeleton");
  skeleton.append(
    element("div", "ia_skeleton_hero"),
    element("div", "ia_skeleton_line is_short"),
    element("div", "ia_skeleton_line is_title"),
    element("div", "ia_skeleton_tabs"),
    element("div", "ia_skeleton_card"),
  );

  showMessage(skeleton);
}

function showError(message) {
  const error = element("div", "ia_error");
  error.append(element("strong", "", "Summary unavailable"), element("p", "", message));

  showMessage(error);
}


/* ---- drawer (narrow screens) -------------------------------------------- */

function isDrawer() {
  return window.matchMedia(DRAWER_QUERY).matches;
}

function openDrawer() {
  document.body.classList.add("ia_box_open");

  if (isDrawer()) {
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.querySelector(".ia_close")?.focus();
  }
}

function closeDrawer() {
  document.body.classList.remove("ia_box_open");
  panel.removeAttribute("role");
  panel.removeAttribute("aria-modal");

  document.querySelector(`${TRIGGER_SELECTOR}.is_active`)?.focus();
}

/** Keep Tab inside the open drawer, and close it with Escape. */
function handleDrawerKeys(event) {
  const drawerIsOpen = document.body.classList.contains("ia_box_open") && isDrawer();
  if (!drawerIsOpen) {
    return;
  }

  if (event.key === "Escape") {
    closeDrawer();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusable = [...panel.querySelectorAll("button:not(:disabled), textarea:not(:disabled), a[href], summary")];
  if (!focusable.length) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}


/* ---- summary ------------------------------------------------------------ */

function errorMessage(response) {
  if (response.status >= 500) {
    return "The local AI could not complete this request. Please try again.";
  }

  if (response.status === 404) {
    return "This content is no longer available.";
  }

  return "The request could not be completed. Please try again.";
}

/**
 * Show the article page with an empty summary, ready to be written into.
 * Returns the summary paragraph and the status line above it.
 */
function showSummaryInProgress(article) {
  const emptyDetails = { synthesis: " ", generated_by_ai: true, sources_used: [] };
  show(summaryPage(article, emptyDetails, false));

  const text = panel.querySelector(".ia_summary_text");
  text.textContent = "";
  text.classList.add("is_streaming");

  const status = element("div", "ia_stream_status", "Preparing article…");
  text.before(status);

  return { text, status };
}

async function openSummary(articleId) {
  // Clicking another article cancels the one still loading.
  summaryRequest?.abort();
  stopAnswer();
  summaryRequest = new AbortController();
  const { signal } = summaryRequest;

  showLoading();
  openDrawer();

  try {
    const { article } = await fetchJson(`/api/articles/${articleId}`, { signal });
    const progress = showSummaryInProgress(article);

    const response = await fetch(`/api/articles/${articleId}/summary/stream`, {
      method: "POST",
      headers: { Accept: "application/x-ndjson" },
      signal,
    });

    if (!response.ok) {
      throw new Error(errorMessage(response));
    }

    await readEventStream(response, (event) => {
      if (event.type === "status") {
        progress.status.textContent = event.message || "Working…";
      }

      if (event.type === "delta") {
        progress.status.textContent = "Writing summary…";
        progress.text.textContent += event.text || "";
      }

      if (event.type === "complete") {
        show(summaryPage(article, event.details));
        panel.scrollTop = 0;
      }
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(error.message || "Unknown error");
    }
  }
}


/* ---- startup ------------------------------------------------------------ */

function markActiveTrigger(trigger) {
  for (const other of document.querySelectorAll(`${TRIGGER_SELECTOR}.is_active`)) {
    other.classList.remove("is_active");
  }

  trigger.classList.add("is_active");
}

export function startAiPanel() {
  panel = document.getElementById("ia_box");

  // Cards are redrawn often, so clicks are caught once at the document level.
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.(TRIGGER_SELECTOR);
    if (!trigger) {
      return;
    }

    event.preventDefault();
    markActiveTrigger(trigger);
    void openSummary(trigger.dataset.articleId);
  });

  document.getElementById("ia_box_backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", handleDrawerKeys);

  showEmpty();
}
