const THEME_KEY = "vao2-theme";

function applyTheme(theme, animate = false) {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  const button = document.getElementById("theme_button");
  const label = document.getElementById("theme_label");

  document.documentElement.dataset.theme = selectedTheme;

  if (label) label.textContent = selectedTheme === "dark" ? "Light" : "Dark";
  if (button) {
    button.setAttribute(
      "aria-label",
      `Switch to ${selectedTheme === "dark" ? "light" : "dark"} theme`,
    );

    if (animate) {
      button.classList.remove("is_switching");
      void button.offsetWidth;
      button.classList.add("is_switching");
      window.setTimeout(() => button.classList.remove("is_switching"), 500);
    }
  }
}

function toggleTheme() {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";

  applyTheme(nextTheme, true);
  localStorage.setItem(THEME_KEY, nextTheme);
}

function openAddSource() {
  const modal = document.getElementById("add_source_modal");
  if (!modal) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal_open");
  window.setTimeout(() => document.getElementById("source_type")?.focus(), 0);
}

function closeAddSource() {
  const modal = document.getElementById("add_source_modal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal_open");
  document.querySelector(".add_source_btn")?.focus();
}

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

  applyTheme(savedTheme || preferredTheme);

  const modal = document.getElementById("add_source_modal");
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeAddSource();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("open")) {
      closeAddSource();
    }
  });
});