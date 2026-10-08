/*
  The Weather view: current conditions, the next hours and the next 7 days.

  The position comes from the browser (geolocation), or the last known place,
  or a default town. The forecast comes from /api/weather/forecast
  (backend/platforms/weather.py, Open-Meteo).
*/

import { fetchJson } from "../global/api.js";
import { element } from "../global/dom.js";
import { clearAssistantHistory, hideAssistant, showAssistant } from "./weather_assistant.js";
import { detailIcon, weatherCondition, weatherIcon } from "./weather_icons.js";
import { outfitBlock } from "./weather_outfit.js";
import { degrees, setTemperatureUnits, temperatureUnits } from "./units.js";


const STORAGE_KEY = "vao2-weather-location";

const DEFAULT_LOCATION = {
  name: "La Chapelle-Saint-Mesmin",
  admin1: "Centre-Val de Loire",
  country: "France",
  latitude: 47.8906,
  longitude: 1.8285,
};

// Names the backend uses when it could not find the town.
const UNNAMED_PLACES = ["My location", "Current location", "Selected location"];

const HOURS_SHOWN = 12;

let forecastRequest = null;


/* ---- formatting --------------------------------------------------------- */

function rounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : "–";
}

function formatTime(value) {
  if (!value) {
    return "–";
  }

  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function dayLabel(date, index) {
  if (index === 0) {
    return "Today";
  }

  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
}


/* ---- location ----------------------------------------------------------- */

function savedLocation() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude)) {
      return value;
    }
  } catch {
    // Unreadable: use the default.
  }

  return DEFAULT_LOCATION;
}

function saveLocation(location) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
}

/** Remember the town name the backend found, for the next visit. */
function rememberPlaceName(location) {
  const hasRealName = location.name && !UNNAMED_PLACES.includes(location.name);
  if (!hasRealName) {
    return;
  }

  saveLocation({
    ...savedLocation(),
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
  });
}

/** The position just found, keeping the saved town name if it is the same area. */
function locationFromPosition(coords) {
  const previous = savedLocation();

  const sameArea = (
    Math.abs(previous.latitude - coords.latitude) < 0.02
    && Math.abs(previous.longitude - coords.longitude) < 0.02
  );
  const previousHasName = previous.name && !UNNAMED_PLACES.includes(previous.name);

  return {
    name: sameArea && previousHasName ? previous.name : "My location",
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}


/* ---- current conditions ------------------------------------------------- */

function heroCard(forecast) {
  const { current = {}, daily = {}, location = {} } = forecast;
  const isNight = current.is_day === 0;

  const hero = element("article", isNight ? "wx_hero is_night" : "wx_hero");

  const place = element("div", "wx_hero_place");
  place.append(element("span", "", location.name || "Current location"));
  if (location.country) {
    place.append(element("small", "wx_hero_region", location.country));
  }

  const stamp = element("div", "wx_hero_stamp", `Updated ${formatTime(current.time)}`);

  const reading = element("div", "wx_hero_reading");
  reading.append(
    element("strong", "wx_hero_temp", degrees(current.temperature_2m)),
    element("div", "wx_hero_condition", weatherCondition(current.weather_code, current.is_day !== 0).label),
    element("div", "wx_hero_feels", `Feels like ${degrees(current.apparent_temperature)}`),
  );

  const main = element("div", "wx_hero_main");
  main.append(weatherIcon(current.weather_code, current.is_day === 1, "is_hero"), reading);

  const range = element("div", "wx_hero_range");
  range.append(
    element("strong", "", `H ${degrees(daily.temperature_2m_max?.[0])}`),
    element("strong", "", `L ${degrees(daily.temperature_2m_min?.[0])}`),
    element("span", "", `${rounded(daily.precipitation_probability_max?.[0])}% chance of precipitation`),
  );

  hero.append(place, stamp, main, range);

  const outfit = outfitBlock(forecast.outfit_periods);
  if (outfit) {
    hero.append(outfit);
  }

  return hero;
}

function detailTile(iconName, label, value) {
  const tile = element("div", "weather_detail");
  tile.append(detailIcon(iconName), element("span", "weather_detail_label", label), element("strong", "", value));
  return tile;
}

function detailTiles(forecast) {
  const current = forecast.current || {};

  const windDirection = Number(current.wind_direction_10m);
  const windSuffix = Number.isFinite(windDirection) ? ` · ${Math.round(windDirection)}°` : "";

  const airIndex = Number(forecast.air_quality?.current?.us_aqi);
  const airText = Number.isFinite(airIndex) ? `${Math.round(airIndex)} AQI` : "Unavailable";

  const visibilityKm = (Number(current.visibility || 0) / 1000).toFixed(1);

  const tiles = element("div", "wx_now_tiles");
  tiles.append(
    detailTile("air", "Air quality", airText),
    detailTile("humidity", "Humidity", `${rounded(current.relative_humidity_2m)}%`),
    detailTile("wind", "Wind", `${rounded(current.wind_speed_10m)} km/h${windSuffix}`),
    detailTile("visibility", "Visibility", `${visibilityKm} km`),
    detailTile("pressure", "Pressure", `${rounded(current.pressure_msl)} hPa`),
    detailTile("dew", "Dew point", degrees(current.dew_point_2m)),
    detailTile("uv", "UV index", String(rounded(current.uv_index))),
    detailTile("clouds", "Cloud cover", `${rounded(current.cloud_cover)}%`),
  );
  return tiles;
}

function todaySection(forecast, switcher) {
  const now = element("div", "wx_now");
  now.append(heroCard(forecast), detailTiles(forecast));

  // The °C / °F switch sits in the card's top right corner.
  const section = element("section", "wx_today_split");
  section.append(switcher, now);
  return section;
}


/* ---- hours and days ----------------------------------------------------- */

function hoursSection(forecast) {
  const { current = {}, hourly = {} } = forecast;

  // From half an hour ago, so the current hour is included.
  const startTime = new Date(current.time || Date.now()).getTime() - 30 * 60 * 1000;

  const list = element("div", "weather_hourly");

  (hourly.time || []).forEach((time, index) => {
    if (new Date(time).getTime() < startTime || list.children.length >= HOURS_SHOWN) {
      return;
    }

    const label = list.children.length === 0 ? "Now" : formatTime(time);

    const hour = element("div", "weather_hour");
    hour.append(
      element("strong", "", label),
      weatherIcon(hourly.weather_code?.[index], true, "is_hourly"),
      element("span", "weather_hour_temp", degrees(hourly.temperature_2m?.[index])),
      element("small", "", `${rounded(hourly.precipitation_probability?.[index])}% rain`),
    );
    list.append(hour);
  });

  const section = element("section", "weather_panel");
  section.append(element("h2", "weather_section_title", "Next hours"), list);
  return section;
}

function daysSection(forecast) {
  const daily = forecast.daily || {};
  const list = element("div", "weather_daily");

  (daily.time || []).forEach((date, index) => {
    const code = daily.weather_code?.[index];

    const label = element("div", "weather_day_label");
    label.append(element("strong", "", dayLabel(date, index)), element("small", "", weatherCondition(code).label));

    const temperatures = element("div", "weather_day_temps");
    temperatures.append(
      element("strong", "", degrees(daily.temperature_2m_max?.[index])),
      element("span", "", degrees(daily.temperature_2m_min?.[index])),
    );

    const day = element("div", "weather_day");
    day.append(
      label,
      weatherIcon(code, true, "is_daily"),
      element("span", "weather_day_rain", `${rounded(daily.precipitation_probability_max?.[index])}%`),
      temperatures,
    );
    list.append(day);
  });

  const section = element("section", "weather_panel");
  section.append(element("h2", "weather_section_title", "7-day forecast"), list);
  return section;
}


/* ---- view --------------------------------------------------------------- */

/** °C / °F buttons; changing unit loads the forecast again (its sentences too). */
function unitSwitch(root, location) {
  const switcher = element("div", "wx_units");
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Temperature unit");

  const choices = [
    { units: "metric", label: "°C" },
    { units: "imperial", label: "°F" },
  ];

  for (const choice of choices) {
    const isSelected = temperatureUnits() === choice.units;

    const button = element("button", isSelected ? "wx_unit is_selected" : "wx_unit", choice.label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(isSelected));
    button.addEventListener("click", () => {
      if (isSelected) {
        return;
      }

      setTemperatureUnits(choice.units);
      void loadForecast(root, location);
    });

    switcher.append(button);
  }

  return switcher;
}

function renderForecast(root, forecast, location) {
  rememberPlaceName(forecast.location || {});

  const placeName = forecast.location?.name || "selected location";
  const footer = element(
    "div",
    "weather_footer",
    `Forecast for ${placeName} · Weather by Open-Meteo · Location © OpenStreetMap contributors`,
  );

  const dashboard = element("div", "weather_dashboard");
  dashboard.append(
    todaySection(forecast, unitSwitch(root, location)),
    hoursSection(forecast),
    daysSection(forecast),
    footer,
  );

  root.replaceChildren(dashboard);
  showAssistant(location);
}

function showState(root, className, text) {
  root.replaceChildren(element("div", `weather_state ${className}`, text));
}

function showError(root, message, retry) {
  const error = element("div", "weather_state weather_error");

  const button = element("button", "btn_primary", "Try again");
  button.type = "button";
  button.addEventListener("click", retry);

  error.append(element("strong", "", "Weather unavailable"), element("p", "", message), button);
  root.replaceChildren(error);
}

async function loadForecast(root, location) {
  forecastRequest?.abort();
  forecastRequest = new AbortController();

  showState(root, "weather_loading", "Loading the latest forecast…");

  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    name: location.name,
    units: temperatureUnits(),
  });

  try {
    const forecast = await fetchJson(`/api/weather/forecast?${params}`, { signal: forecastRequest.signal });

    // The user may have left the view while it loaded.
    if (document.body.dataset.view === "weather") {
      renderForecast(root, forecast, location);
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(root, "Weather service is temporarily unavailable.", () => loadForecast(root, location));
    }
  }
}

function openWeatherView() {
  const content = document.getElementById("content");
  content.className = "weather_view";

  clearAssistantHistory();

  const root = element("div", "weather_forecast");
  content.replaceChildren(root);
  showState(root, "weather_loading", "Finding your current location…");

  if (!navigator.geolocation) {
    void loadForecast(root, savedLocation());
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const location = locationFromPosition(coords);
      saveLocation(location);
      void loadForecast(root, location);
    },
    () => void loadForecast(root, savedLocation()),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  );
}

export function startWeather() {
  window.addEventListener("navigationchange", (event) => {
    if (event.detail.view === "weather") {
      openWeatherView();
      return;
    }

    forecastRequest?.abort();
    hideAssistant();
  });
}
