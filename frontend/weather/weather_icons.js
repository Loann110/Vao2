/*
  Icons of the Weather view: the sky (Meteocons), the detail tiles (Phosphor)
  and the clothing suggestions. See global/icons.js.
*/

import { element } from "../global/dom.js";
import { clothingIcon, meteocon, phosphorIcon } from "../global/icons.js";


/* WMO weather code (as reported by Open-Meteo) -> icon and words, with `night`
   holding what differs after dark. Taken from _beta. */
const CONDITIONS = {
  0: { icon: "clear-day", label: "Sunny", night: { icon: "clear-night", label: "Clear" } },
  1: { icon: "clear-day", label: "Mostly sunny", night: { icon: "clear-night", label: "Mostly clear" } },
  2: { icon: "partly-cloudy-day", label: "Partly sunny", night: { icon: "partly-cloudy-night", label: "Partly cloudy" } },
  3: { icon: "overcast", label: "Cloudy" },
  45: { icon: "fog", label: "Fog" },
  48: { icon: "fog", label: "Freezing fog" },
  51: { icon: "drizzle", label: "Light drizzle" },
  53: { icon: "drizzle", label: "Drizzle" },
  55: { icon: "drizzle", label: "Heavy drizzle" },
  56: { icon: "sleet", label: "Freezing drizzle" },
  57: { icon: "sleet", label: "Freezing drizzle" },
  61: { icon: "drizzle", label: "Light rain" },
  63: { icon: "rain", label: "Rain" },
  65: { icon: "rain", label: "Heavy rain" },
  66: { icon: "sleet", label: "Freezing rain" },
  67: { icon: "sleet", label: "Freezing rain" },
  71: { icon: "snow", label: "Light snow" },
  73: { icon: "snow", label: "Snow" },
  75: { icon: "snow", label: "Heavy snow" },
  77: { icon: "snow", label: "Snow grains" },
  80: { icon: "partly-cloudy-day-drizzle", label: "Light showers", night: { icon: "partly-cloudy-night-drizzle", label: "Light showers" } },
  81: { icon: "partly-cloudy-day-rain", label: "Showers", night: { icon: "partly-cloudy-night-rain", label: "Showers" } },
  82: { icon: "rain", label: "Heavy showers" },
  85: { icon: "snow", label: "Snow showers" },
  86: { icon: "snow", label: "Heavy snow showers" },
  95: { icon: "thunderstorms-rain", label: "Thunderstorms" },
  96: { icon: "hail", label: "Thunderstorms with hail" },
  99: { icon: "hail", label: "Severe thunderstorms" },
};

// Detail tiles -> Phosphor icon.
const DETAIL_ICONS = {
  air: "leaf",
  humidity: "drop",
  wind: "wind",
  visibility: "eye",
  pressure: "gauge",
  dew: "drop-half",
  uv: "sun-dim",
  clouds: "cloud",
};

/** { icon, label } of a weather code, by day or by night. */
export function weatherCondition(code, isDay = true) {
  const condition = CONDITIONS[Number(code)] || CONDITIONS[3];

  if (!isDay && condition.night) {
    return condition.night;
  }

  return condition;
}

/** The sky icon of a weather code, in a span sized by `sizeClass`. */
export function weatherIcon(code, isDay = true, sizeClass = "") {
  const condition = weatherCondition(code, isDay);

  const wrapper = element("span", `weather_icon ${sizeClass}`.trim());
  wrapper.append(meteocon(condition.icon, "", condition.label));
  return wrapper;
}

/** The small icon at the top of a detail tile. */
export function detailIcon(name) {
  const wrapper = element("span", "weather_detail_icon");
  wrapper.append(phosphorIcon(DETAIL_ICONS[name]));
  return wrapper;
}

/** The icon of a clothing suggestion. */
export function kitIcon(garment) {
  return clothingIcon(garment, "wx_kit");
}
