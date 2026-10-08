/*
  Every icon of the interface, taken from icon libraries rather than drawn
  here (downloaded into global/vendor/ by scripts/vendor_icons.py):

  - Phosphor: interface icons, painted with the text colour (currentColor);
  - Meteocons: coloured weather icons;
  - clothing: one accurate icon per garment (Lucide, IconPark, MingCute).
*/

import CLOTHING from "./vendor/clothing.js";
import METEOCONS from "./vendor/meteocons.js";
import PHOSPHOR from "./vendor/phosphor.js";


// Sidebar and "Add source" entries -> Phosphor icon.
const PLATFORM_ICONS = {
  home: "house",
  add: "plus-circle",
  weather: "cloud-sun",
  youtube: "youtube-logo",
  news: "newspaper",
};

let meteoconCount = 0;


function svgFromMarkup(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

/** A Phosphor icon by its library name ("sun", "t-shirt"...). */
export function phosphorIcon(name, className = "") {
  const body = PHOSPHOR[name] || "";

  return svgFromMarkup(
    `<svg class="${className}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`,
  );
}

/** A Meteocons weather icon by its library name ("clear-day", "rain"...). */
export function meteocon(name, className = "", label = "") {
  // Each drawing gets its own gradient ids: the same icon many times on a page
  // must not share them.
  meteoconCount += 1;
  const suffix = `_${meteoconCount}`;

  const body = (METEOCONS[name] || "")
    .replace(/id="([^"]+)"/g, (_match, id) => `id="${id}${suffix}"`)
    .replace(/url\(#([^)]+)\)/g, (_match, id) => `url(#${id}${suffix})`);

  let accessibility = 'aria-hidden="true" focusable="false"';
  if (label) {
    accessibility = `role="img" aria-label="${label.replace(/"/g, "&quot;")}"`;
  }

  return svgFromMarkup(
    `<svg class="${className}" viewBox="0 0 64 64" ${accessibility}>${body}</svg>`,
  );
}

/** The icon of a garment ("jacket", "scarf"...), painted with the text colour. */
export function clothingIcon(garment, className = "") {
  const svg = svgFromMarkup(CLOTHING[garment] || CLOTHING.tshirt);

  // The library's own size is replaced by the CSS one.
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  return svg;
}

/** The icon of a sidebar entry or a platform ("home", "youtube"...). */
export function platformIcon(kind) {
  return phosphorIcon(PLATFORM_ICONS[kind], `platform-logo ${kind}`);
}
