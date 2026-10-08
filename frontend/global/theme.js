/*
  Light and dark theme: the button at the bottom of the sidebar.

  The theme is set as <html data-theme="dark|light"> and remembered in the
  browser. All colours come from CSS variables (global/styles/theme.css).
*/

import { phosphorIcon } from "./icons.js";


const STORAGE_KEY = "vao2-theme";
const SPIN_DURATION_MS = 500;


function applyTheme(theme, animate = false) {
  const button = document.getElementById("theme_button");
  const label = document.getElementById("theme_label");

  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";

  // The button offers the other theme.
  label.textContent = isDark ? "Light" : "Dark";
  button.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);

  if (animate) {
    // Restart the spin even when the button is clicked twice quickly.
    button.classList.remove("is_switching");
    void button.offsetWidth;
    button.classList.add("is_switching");

    window.setTimeout(() => button.classList.remove("is_switching"), SPIN_DURATION_MS);
  }
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  applyTheme(nextTheme, true);
  localStorage.setItem(STORAGE_KEY, nextTheme);
}

/** Apply the remembered theme (dark by default) and wire the button. */
export function startTheme() {
  // The sun and the moon, stacked: the CSS shows one and hides the other.
  document.querySelector("#theme_button .theme_icon").append(
    phosphorIcon("sun", "theme_sun"),
    phosphorIcon("moon", "theme_moon"),
  );

  const savedTheme = localStorage.getItem(STORAGE_KEY);
  applyTheme(savedTheme || "dark");

  document.getElementById("theme_button").addEventListener("click", toggleTheme);
}
