/*
  The sidebar, and switching from one view to another.

  Choosing an entry sets <body data-view="..."> and fires a "navigationchange"
  event on window. Each view listens to that event and draws itself when it is
  its turn; this file knows nothing about what the views contain.

  Views: "all" (For you), "youtube", "news" (the feed filtered by platform),
  "add-source" and "weather".
*/

import { element } from "./dom.js";
import { platformIcon } from "./icons.js";


const NAV_ITEMS = [
  { id: "all", label: "For you", icon: "home", subtitle: "All your sources in one place" },
  { id: "add-source", label: "Add source", icon: "add", subtitle: "Find and organize your sources" },
  { id: "weather", label: "Weather", icon: "weather", subtitle: "Current conditions and the week ahead" },
  { type: "title", label: "Sources" },
  { id: "youtube", label: "YouTube", icon: "youtube", subtitle: "Latest videos from your channels" },
  { id: "news", label: "News", icon: "news", subtitle: "Your selected news sources" },
];

const DEFAULT_VIEW = "all";


function markSelectedButton(selectedButton) {
  const buttons = document.querySelectorAll("#nav .nav_btn");

  for (const button of buttons) {
    const isSelected = button === selectedButton;

    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-current", isSelected ? "page" : "false");
  }
}

function updateHeader(item) {
  const isAddSource = item.id === "add-source";
  const isWeather = item.id === "weather";

  document.getElementById("title").textContent = item.label;
  document.getElementById("subtitle").textContent = item.subtitle || "";

  // The feed's search and filter make no sense on the other two views.
  document.getElementById("content").hidden = isAddSource;
  document.getElementById("add_source_view").hidden = !isAddSource;
  document.getElementById("feed_tools").hidden = isAddSource || isWeather;
  document.getElementById("notice").hidden = isAddSource || isWeather;
}

function selectView(button, item) {
  markSelectedButton(button);
  updateHeader(item);

  document.body.dataset.view = item.id;

  window.dispatchEvent(new CustomEvent("navigationchange", {
    detail: { view: item.id },
  }));
}

function sectionTitle(item) {
  return element("div", "nav_title", item.label);
}

function navButton(item) {
  const isDefault = item.id === DEFAULT_VIEW;

  const button = element("button", "nav_btn");
  button.type = "button";
  button.classList.toggle("active", isDefault);
  button.classList.toggle("add_source_btn", item.id === "add-source");
  button.dataset.view = item.id;
  button.setAttribute("aria-current", isDefault ? "page" : "false");
  button.setAttribute("aria-label", item.label);

  const icon = element("span", "icon");
  icon.append(platformIcon(item.icon));

  const label = element("span", "nav_label", item.label);

  button.append(icon, label);
  button.addEventListener("click", () => selectView(button, item));

  return button;
}

/** Draw the sidebar entries. */
export function startNavigation() {
  const nav = document.getElementById("nav");
  nav.replaceChildren();

  for (const item of NAV_ITEMS) {
    if (item.type === "title") {
      nav.append(sectionTitle(item));
    } else {
      nav.append(navButton(item));
    }
  }

  // The header starts on the default view, subtitle included.
  updateHeader(NAV_ITEMS.find((item) => item.id === DEFAULT_VIEW));
}

/** The view currently shown ("all" until another entry is chosen). */
export function currentView() {
  return document.body.dataset.view || DEFAULT_VIEW;
}
