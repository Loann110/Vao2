/*
  Calls to the Vao2 backend (/api/...).

  Two kinds of answers exist:
  - plain JSON, read with fetchJson();
  - streamed answers from the local AI, one JSON event per line, read with
    readEventStream() as they arrive (see backend/routes/streaming.py).
*/

/** The error message the backend put in its answer, if any. */
async function errorDetail(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return "";
  }

  try {
    const payload = await response.json();
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
  } catch {
    // An unreadable error body: the caller uses its own message.
  }

  return "";
}

/** GET (or another method) a JSON answer. Throws with the backend's message on failure. */
export async function fetchJson(url, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new Error(detail || `Backend error ${response.status}`);
  }

  return response.json();
}

/**
 * Read a streamed answer: call onEvent(event) for each JSON line as it arrives.
 * The stream ends when the server closes it.
 */
export async function readEventStream(response, onEvent) {
  if (!response.body) {
    throw new Error("Streaming is not supported by this browser");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { value, done } = await reader.read();

    if (value) {
      pending += decoder.decode(value, { stream: !done });
    }

    // Every complete line is one event; the last piece may still be partial.
    const lines = pending.split("\n");
    pending = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        onEvent(JSON.parse(line));
      }
    }

    if (done) {
      break;
    }
  }

  if (pending.trim()) {
    onEvent(JSON.parse(pending));
  }
}
