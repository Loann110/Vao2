/*
  The weather assistant, in the right-hand column of the Weather view (where
  the AI panel sits in the other views).

  Its code is separate from the AI panel (ia_box/), but it reuses the AI
  panel's CSS classes so both look the same. Answers come from the local model,
  from the forecast only, and anything not about the weather is declined
  (backend/llm/weather.py).
*/

import { fetchJson, readEventStream } from "../global/api.js";
import { element } from "../global/dom.js";
import { phosphorIcon } from "../global/icons.js";


const SUGGESTIONS = [
  "What should I wear today?",
  "Will it rain soon?",
  "When is the best time to go out?",
];

const OFF_TOPIC_ANSWER = "I only cover the weather: ask me what to wear, when the rain arrives, or the best moment to head out.";

// [{ role: "user" | "ai", text }], kept until the Weather view is opened again.
let history = [];

// The answer being written, so it can be stopped.
let answerRequest = null;


function panel() {
  return document.getElementById("wx_assistant_panel");
}

/** Start a new conversation (called when the Weather view opens). */
export function clearAssistantHistory() {
  history = [];
  answerRequest?.abort();
}

export function hideAssistant() {
  answerRequest?.abort();
  panel().hidden = true;
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


/* ---- asking ------------------------------------------------------------- */

/** Stream the answer into `bubble`. Returns true when some text arrived. */
async function streamAnswer(question, location, bubble, scrollToEnd, signal) {
  const response = await fetch("/api/weather/assistant/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      question,
      latitude: location.latitude,
      longitude: location.longitude,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error("The assistant could not answer. Check that the local model is installed.");
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

    if (event.type === "off_topic") {
      bubble.textContent = OFF_TOPIC_ANSWER;
      started = true;
    }

    if (event.type === "error") {
      bubble.textContent = `Weather assistant error: ${event.message}`;
      bubble.classList.add("is_error");
      started = true;
    }
  });

  return started;
}


/* ---- the panel ---------------------------------------------------------- */

/** Disable the chat when the local model cannot answer, and say why. */
async function checkModel(setAvailable, hint) {
  try {
    const status = await fetchJson("/api/llm/status");
    const available = Boolean(status.available && !status.error);

    setAvailable(available);
    hint.textContent = status.error || "Install the local model to ask questions in your own words.";
    hint.hidden = available;
  } catch {
    setAvailable(false);
  }
}

function questionInput() {
  const input = element("textarea", "ia_ask_input");
  input.name = "question";
  input.rows = 2;
  input.maxLength = 400;
  input.placeholder = "Ask anything about this weather…";
  input.setAttribute("aria-label", "Question for the weather assistant");
  input.setAttribute("aria-describedby", "wx_ask_help wx_ask_validation");
  return input;
}

/** Show the assistant for the forecast of `location` in the side panel. */
export function showAssistant(location) {
  const conversation = element("div", "ia_conversation");
  conversation.setAttribute("role", "log");
  conversation.setAttribute("aria-live", "polite");
  conversation.setAttribute("aria-label", "Conversation about the weather");

  for (const entry of history) {
    conversation.append(message(entry.role, entry.text).row);
  }

  const input = questionInput();

  const askButton = element("button", "ia_ask_button");
  askButton.append(phosphorIcon("arrow-up"));
  askButton.setAttribute("aria-label", "Send");
  askButton.type = "submit";
  askButton.dataset.mode = "ask";

  const form = element("form", "ia_ask_form");
  form.append(input, askButton);

  const suggestions = element("div", "ia_ask_suggestions");
  suggestions.setAttribute("aria-label", "Suggested questions");
  for (const question of SUGGESTIONS) {
    const chip = element("button", "ia_suggestion", question);
    chip.type = "button";
    chip.addEventListener("click", () => {
      input.value = question;
      form.requestSubmit();
    });
    suggestions.append(chip);
  }

  const help = element("div", "ia_ask_help", "Enter to send · Shift+Enter for a new line");
  help.id = "wx_ask_help";

  const validation = element("div", "ia_ask_validation");
  validation.id = "wx_ask_validation";
  validation.setAttribute("role", "status");

  const hint = element("div", "ia_ask_hint");
  hint.hidden = true;

  const composer = element("div", "ia_ask_composer");
  composer.append(suggestions, form, help, validation);

  const chat = element("div", "ia_ask");
  chat.append(hint, conversation, composer);

  // .ia_chat_panel gives the conversation its height and scrolling.
  const chatPanel = element("div", "ia_chat_panel");
  chatPanel.append(chat);

  const page = element("div", "ia_page");
  page.append(
    element("div", "ia_eyebrow", "Weather assistant"),
    element("p", "wx_assistant_intro", "Grounded in this forecast, weather only."),
    chatPanel,
  );

  panel().replaceChildren(page);
  panel().hidden = false;

  /* While an answer is written the form is locked and "Send" becomes "Stop". */
  let modelAvailable = true;

  const setBusy = (isBusy) => {
    input.disabled = isBusy || !modelAvailable;
    for (const chip of suggestions.querySelectorAll("button")) {
      chip.disabled = isBusy || !modelAvailable;
    }

    askButton.disabled = !modelAvailable;
    askButton.replaceChildren(phosphorIcon(isBusy ? "stop" : "arrow-up"));
    askButton.setAttribute("aria-label", isBusy ? "Stop" : "Send");
    askButton.dataset.mode = isBusy ? "stop" : "ask";
    askButton.classList.toggle("is_stop", isBusy);
  };

  const setAvailable = (available) => {
    modelAvailable = available;
    setBusy(false);
  };

  const scrollToEnd = () => {
    conversation.scrollTop = conversation.scrollHeight;
  };

  const ask = async (question) => {
    answerRequest?.abort();
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
      started = await streamAnswer(question, location, aiMessage.bubble, scrollToEnd, answerRequest.signal);
      if (!started) {
        aiMessage.bubble.textContent = "The local model returned an empty response.";
      }
    } catch (error) {
      if (error.name === "AbortError") {
        if (!started) {
          aiMessage.bubble.textContent = "Generation stopped.";
        }
      } else {
        aiMessage.bubble.textContent = error.message;
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
      answerRequest?.abort();
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

  void checkModel(setAvailable, hint);
}
