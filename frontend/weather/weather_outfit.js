/*
  What to wear, in the Weather view: Morning / Afternoon / Evening tabs, the
  outfit for the chosen period, and what to take with you.

  The suggestions come with the forecast (`outfit_periods`), computed by
  backend/platforms/weather_outfit.py. The layout follows _beta.
*/

import { element } from "../global/dom.js";
import { degrees } from "./units.js";
import { kitIcon, weatherIcon } from "./weather_icons.js";


// The tab chosen by the user, kept while the view is redrawn.
let selectedPeriodId = null;


function periodName(period) {
  if (period.current) {
    return `${period.label} · Now`;
  }

  if (!period.is_today) {
    return `${period.label} · Tomorrow`;
  }

  return period.label;
}

function kitCard(item, kind) {
  const text = element("div", "wx_kit_text");
  text.append(element("strong", "", item.label), element("small", "", item.reason));

  const card = element("div", `wx_kit_card is_${kind}`);
  card.append(kitIcon(item.icon), text);
  return card;
}

function periodTab(period, isSelected, onSelect) {
  const tab = element("button", isSelected ? "wx_period_tab is_selected" : "wx_period_tab");
  tab.type = "button";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", String(isSelected));

  const text = element("div", "wx_period_tab_text");
  text.append(
    element("span", "wx_period_tab_label", periodName(period)),
    element("strong", "", degrees(period.temperature)),
  );

  tab.append(weatherIcon(period.weather_code, period.is_day, "is_period"), text);

  // The rain chance is only worth showing when it is real.
  if (period.rain_chance >= 30) {
    tab.append(element("span", "wx_period_tab_rain", `${period.rain_chance}% rain`));
  }

  tab.addEventListener("click", () => onSelect(period.id));
  return tab;
}

function fillOutfit(box, periods) {
  const fallback = periods.find((period) => period.current) || periods[0];
  const selected = periods.find((period) => period.id === selectedPeriodId) || fallback;
  selectedPeriodId = selected.id;

  const select = (periodId) => {
    selectedPeriodId = periodId;
    fillOutfit(box, periods);
  };

  const tabs = element("div", "wx_period_tabs");
  tabs.setAttribute("role", "tablist");
  for (const period of periods) {
    tabs.append(periodTab(period, period.id === selected.id, select));
  }

  const headline = element("div", "wx_outfit_headline");
  headline.append(
    element("strong", "", `${periodName(selected)}: ${selected.headline}`),
    element("p", "", selected.band.note),
  );

  const outfit = element("div", "wx_kit_row");
  for (const item of selected.outfit) {
    outfit.append(kitCard(item, "wear"));
  }

  box.replaceChildren(tabs, headline, outfit);

  if (selected.carry.length) {
    const carry = element("div", "wx_kit_row is_carry");
    for (const item of selected.carry) {
      carry.append(kitCard(item, "carry"));
    }

    box.append(element("h3", "wx_kit_title", "Take with you"), carry);
  }
}

/** The "what to wear" block, or null when the forecast has no periods. */
export function outfitBlock(periods) {
  if (!periods || !periods.length) {
    return null;
  }

  const box = element("div", "wx_outfit");
  fillOutfit(box, periods);
  return box;
}
