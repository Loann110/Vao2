const NAV_ITEMS = [
  { id: "all", label: "For you", icon: "home", subtitle: "All your sources in one place" },
  { id: "add-source", label: "Add source", icon: "add", subtitle: "Find and organize your sources" },
  { type: "title", label: "Sources" },
  { id: "youtube", label: "YouTube", icon: "youtube", subtitle: "Latest videos from your channels" },
  { id: "github", label: "GitHub", icon: "github", subtitle: "Repositories and releases you follow" },
  { id: "reddit", label: "Reddit", icon: "reddit", subtitle: "Posts from your communities" },
  { id: "news", label: "News", icon: "news", subtitle: "Your selected news sources" },
  { id: "podcast", label: "Podcasts", icon: "podcast", subtitle: "Your latest podcast episodes" },
  { id: "rss", label: "RSS feeds", icon: "rss", subtitle: "Updates from your RSS feeds" },
];

function svgNode(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
  return node;
}

function platformLogo(kind, extraClass = "") {
  const svg = svgNode("svg", {
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false",
    class: `platform-logo ${kind} ${extraClass}`.trim(),
  });

  if (kind === "home") {
    svg.append(
      svgNode("path", {
        d: "M3.5 10.6 12 3.5l8.5 7.1v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6.3h-4v6.3H5a1.5 1.5 0 0 1-1.5-1.5Z",
        fill: "currentColor",
      }),
    );
  } else if (kind === "add") {
      svg.append(
        svgNode("circle", {
          cx: 12,
          cy: 12,
          r: 9,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 1.8,
        }),
        svgNode("path", {
          d: "M12 8v8M8 12h8",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 1.8,
          "stroke-linecap": "round",
        }),
      );
    } else if (kind === "youtube") {
      svg.append(
        svgNode("rect", { x: 1, y: 4.5, width: 22, height: 15, rx: 4.5, fill: "currentColor" }),
        svgNode("path", { d: "M10 8.2 16.2 12 10 15.8Z", fill: "#fff" }),
      );
    } else if (kind === "github") {
      svg.append(svgNode("path", {
        fill: "currentColor",
        d: "M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17 4.8 18 5.1 18 5.1c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .7Z",
      }));
    } else if (kind === "rss") {
      svg.append(
        svgNode("rect", { x: 1, y: 1, width: 22, height: 22, rx: 5, fill: "currentColor" }),
        svgNode("circle", { cx: 7.1, cy: 17, r: 1.8, fill: "#fff" }),
        svgNode("path", { d: "M5.4 11.4a7.2 7.2 0 0 1 7.2 7.2M5.4 6.2A12.4 12.4 0 0 1 17.8 18.6", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round" }),
      );
    } else if (kind === "podcast") {
      svg.append(
        svgNode("rect", { x: 1, y: 1, width: 22, height: 22, rx: 6, fill: "currentColor" }),
        svgNode("path", { d: "M12 6.2a4.3 4.3 0 0 1 4.3 4.3c0 1.7-1 3.2-2.4 3.9l.9 4.3a1 1 0 0 1-1 1.2h-3.6a1 1 0 0 1-1-1.2l.9-4.3a4.3 4.3 0 0 1 1.9-8.2Z", fill: "#fff" }),
        svgNode("circle", { cx: 12, cy: 10.4, r: 1.9, fill: "currentColor" }),
      );
    } else if (kind === "reddit") {
      svg.append(
        svgNode("circle", { cx: 12, cy: 12, r: 11, fill: "currentColor" }),
        svgNode("ellipse", { cx: 12, cy: 13.6, rx: 6.2, ry: 4.4, fill: "#fff" }),
        svgNode("circle", { cx: 9.4, cy: 13, r: 1.1, fill: "currentColor" }),
        svgNode("circle", { cx: 14.6, cy: 13, r: 1.1, fill: "currentColor" }),
        svgNode("path", { d: "M9.6 16.1c1.5 1 3.3 1 4.8 0", fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-linecap": "round" }),
        svgNode("circle", { cx: 17.6, cy: 8.3, r: 1.4, fill: "#fff" }),
        svgNode("path", { d: "M12.6 9.3 13.5 5l3.4.9", fill: "none", stroke: "#fff", "stroke-width": 1.2, "stroke-linecap": "round" }),
      );
    } else if (kind === "news") {
      svg.append(
        svgNode("rect", { x: 2, y: 4, width: 20, height: 16, rx: 2.5, fill: "#fff" }),
        svgNode("rect", { x: 4, y: 6, width: 7, height: 6, rx: 1, fill: "#4285f4" }),
        svgNode("rect", { x: 13, y: 6, width: 7, height: 2, rx: 1, fill: "#ea4335" }),
        svgNode("rect", { x: 13, y: 10, width: 7, height: 2, rx: 1, fill: "#fbbc04" }),
        svgNode("rect", { x: 4, y: 14, width: 16, height: 2, rx: 1, fill: "#34a853" }),
        svgNode("rect", { x: 4, y: 18, width: 11, height: 1, rx: 0.5, fill: "#8b97a5" }),
      );
    }
  return svg;
}

function selectNavItem(button, item) {
  document.querySelectorAll("#nav .nav_btn").forEach((navButton) => {
    const selected = navButton === button;
    navButton.classList.toggle("active", selected);
    navButton.setAttribute("aria-current", selected ? "page" : "false");
  });

  const title = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");
  const content = document.getElementById("content");
  const addSourceView = document.getElementById("add_source_view");
  const feedTools = document.getElementById("feed_tools");
  const notice = document.getElementById("notice");
  const isAddSourceView = item.id === "add-source";

  if (title) title.textContent = item.label;
  if (subtitle) subtitle.textContent = item.subtitle || "";
  if (content) content.hidden = isAddSourceView;
  if (addSourceView) addSourceView.hidden = !isAddSourceView;
  if (feedTools) feedTools.hidden = isAddSourceView;
  if (notice) notice.hidden = isAddSourceView;

  document.body.dataset.view = item.id;

  window.dispatchEvent(new CustomEvent("navigationchange", {
    detail: { view: item.id },
  }));
}

function renderNavbar() {
  const nav = document.getElementById("nav");
  if (!nav) return;

  nav.replaceChildren();

  NAV_ITEMS.forEach((item) => {
    if (item.type === "title") {
      const title = document.createElement("div");
      title.className = "nav_title";
      title.textContent = item.label;
      nav.append(title);
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav_btn${item.id === "all" ? " active" : ""}${item.id === "add-source" ? " add_source_btn" : ""}`;
    button.dataset.view = item.id;
    button.setAttribute("aria-current", item.id === "all" ? "page" : "false");
    button.setAttribute("aria-label", item.label);

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.append(platformLogo(item.icon));

    const label = document.createElement("span");
    label.className = "nav_label";
    label.textContent = item.label;

    button.append(icon, label);
    button.addEventListener("click", () => {
      selectNavItem(button, item);
    });
    nav.append(button);
  });
}

document.addEventListener("DOMContentLoaded", renderNavbar);
