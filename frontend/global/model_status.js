/*
  The local AI badge at the bottom of the sidebar: is the model available?

  Asked on startup and every 30 seconds (backend/routes/system.py).
*/

import { fetchJson } from "./api.js";


const CHECK_INTERVAL_MS = 30000;


async function updateModelStatus() {
  const badge = document.getElementById("llm_status");
  const label = document.getElementById("llm_status_label");

  badge.className = "llm_status is_checking";
  label.textContent = "Checking local model...";

  try {
    const status = await fetchJson("/api/llm/status");

    if (status.available) {
      badge.className = "llm_status is_available";
      label.textContent = `${status.model} available`;
    } else {
      badge.className = "llm_status is_unavailable";
      label.textContent = `${status.model} unavailable`;
    }
  } catch {
    badge.className = "llm_status is_unavailable";
    label.textContent = "Local model unavailable";
  }
}

export function startModelStatus() {
  void updateModelStatus();
  window.setInterval(updateModelStatus, CHECK_INTERVAL_MS);
}
