/*
  The "Ask AI" tab of the AI panel: questions about one article or video.

  Answers stream from /api/articles/{id}/ask/stream (backend/routes/assistant.py)
  and only use the article's own text. The conversation about each article is
  kept while the page is open, so switching articles and coming back keeps it.
*/

import { readEventStream } from "../global/api.js";
import { element } from "../global/dom.js";
import { phosphorIcon } from "../global/icons.js";


const DEFAULT_SUGGESTIONS = [
  "What is the main point?",
  "What evidence is provided?",
  "What happens next?",
];

// Article id -> [{ role: "user" | "ai", text }]
const conversations = new Map();

// The answer being written, so it can be stopped.
let answerRequest = null;


/** Stop the answer being written, if any. */
export function stopAnswer() {
  answerRequest?.abort();
  answerRequest = null;
}


/* ---- messages ----------------------------------------------------------- */

/** Your question in a bubble; the answer under an "Assistant" label. */
function message(role, text) {
  const row = element("div", `ia_message_row is_${role}`);
  const bubble = element("div", `ia_message ia_message_${role}`, text);

  if (role === "ai") {
    const label = element("span", "ia_message_label");
    label.append(phosphorIcon("sparkle"), "Assistant");
    row.append(label);
  }

  row.append(bubble);
  return { row, bubble };
}

function historyOf(article) {
  const key = String(article.id);

  if (!conversations.has(key)) {
    conversations.set(key, []);
  }

  return conversations.get(key);
}


/* ---- asking ------------------------------------------------------------- */

async function errorMessage(response) {
  if (response.status >= 500) {
    return "The local AI could not complete this request. Please try again.";
  }

  try {
    const payload = await response.json();
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Use the generic message below.
  }

  return "The request could not be completed. Please try again.";
}

/** Stream the answer into `bubble`. */
async function streamAnswer(article, question, bubble, scrollToEnd, signal) {
  const response = await fetch(`/api/articles/${article.id}/ask/stream`, {
    method: "POST",
    headers: {
      Accept: "application/x-ndjson",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  let started = false;

  await readEventStream(response, (event) => {
    if (event.type === "status" && !started) {
      bubble.textContent = event.message || "Thinking…";
    }

    if (event.type === "delta") {
      if (!started) {
        bubble.textContent = "";
        started = true;
      }
      bubble.textContent += event.text || "";
      scrollToEnd();
    }

    if (event.type === "complete") {
      bubble.classList.remove("is_streaming");
    }
  });

  return started;
}


/* ---- the tab ------------------------------------------------------------ */

function questionInput(article, enabled) {
  const input = element("textarea", "ia_ask_input");
  input.name = "question";
  input.rows = 2;
  input.maxLength = 500;
  input.placeholder = article.platform === "youtube"
    ? "Ask something about this video…"
    : "Ask something about this article…";
  input.setAttribute("aria-label", "Question for the AI assistant");
  input.setAttribute("aria-describedby", "ia_ask_help ia_ask_validation");
  input.disabled = !enabled;
  return input;
}

/**
 * The "Ask AI" tab content. `enabled` is false while the summary is still
 * being written; `suggestedQuestions` come with the finished summary.
 */
export function chatTab(article, enabled, suggestedQuestions = []) {
  const history = historyOf(article);

  const conversation = element("div", "ia_conversation");
  conversation.setAttribute("role", "log");
  conversation.setAttribute("aria-live", "polite");
  conversation.setAttribute("aria-label", `Conversation about ${article.title || "this content"}`);

  for (const entry of history) {
    conversation.append(message(entry.role, entry.text).row);
  }

  const input = questionInput(article, enabled);

  const askButton = element("button", "ia_ask_button");
  askButton.append(phosphorIcon("arrow-up"));
  askButton.setAttribute("aria-label", "Send");
  askButton.type = "submit";
  askButton.disabled = !enabled;
  askButton.dataset.mode = "ask";

  const form = element("form", "ia_ask_form");
  form.append(input, askButton);

  const suggestions = element("div", "ia_ask_suggestions");
  suggestions.setAttribute("aria-label", "Suggested questions");

  const questions = suggestedQuestions.slice(0, 3);
  for (const question of questions.length ? questions : DEFAULT_SUGGESTIONS) {
    const chip = element("button", "ia_suggestion", question);
    chip.type = "button";
    chip.disabled = !enabled;
    chip.addEventListener("click", () => {
      input.value = question;
      form.requestSubmit();
    });
    suggestions.append(chip);
  }

  const help = element("div", "ia_ask_help", "Enter to send · Shift+Enter for a new line");
  help.id = "ia_ask_help";

  const validation = element("div", "ia_ask_validation");
  validation.id = "ia_ask_validation";
  validation.setAttribute("role", "status");

  const composer = element("div", "ia_ask_composer");
  composer.append(suggestions, form, help, validation);

  const tab = element("div", "ia_ask");
  if (!enabled) {
    tab.append(element("div", "ia_ask_hint", "Available after the summary is generated."));
  }
  tab.append(conversation, composer);

  /* While an answer is written the form is locked and "Send" becomes "Stop". */
  const setBusy = (isBusy) => {
    input.disabled = isBusy;
    for (const chip of suggestions.querySelectorAll("button")) {
      chip.disabled = isBusy;
    }

    askButton.replaceChildren(phosphorIcon(isBusy ? "stop" : "arrow-up"));
    askButton.setAttribute("aria-label", isBusy ? "Stop" : "Send");
    askButton.dataset.mode = isBusy ? "stop" : "ask";
    askButton.classList.toggle("is_stop", isBusy);
  };

  const scrollToEnd = () => {
    conversation.scrollTop = conversation.scrollHeight;
  };

  const ask = async (question) => {
    stopAnswer();
    answerRequest = new AbortController();

    input.value = "";
    setBusy(true);

    const userMessage = message("user", question);
    const aiMessage = message("ai", "Thinking…");
    aiMessage.bubble.classList.add("is_streaming");
    conversation.append(userMessage.row, aiMessage.row);
    scrollToEnd();

    history.push({ role: "user", text: question });

    let started = false;
    try {
      started = await streamAnswer(article, question, aiMessage.bubble, scrollToEnd, answerRequest.signal);
    } catch (error) {
      if (error.name === "AbortError") {
        if (!started) {
          aiMessage.bubble.textContent = "Generation stopped.";
        }
      } else {
        aiMessage.bubble.textContent = error.message || "The answer is unavailable. Please try again.";
        aiMessage.bubble.classList.add("is_error");
      }
    }

    aiMessage.bubble.classList.remove("is_streaming");
    history.push({ role: "ai", text: aiMessage.bubble.textContent });

    setBusy(false);
    input.focus();
  };

  input.addEventListener("input", () => {
    validation.textContent = "";
  });

  // Enter sends; Shift+Enter makes a new line.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (askButton.dataset.mode === "stop") {
      stopAnswer();
      return;
    }

    const question = input.value.trim();
    if (question.length < 2) {
      validation.textContent = "Enter a question of at least 2 characters.";
      input.focus();
      return;
    }

    void ask(question);
  });

  return tab;
}
