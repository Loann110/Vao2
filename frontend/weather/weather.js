"use strict";

(() => {
  const STORAGE_KEY = "vao2-weather-location";
  const DEFAULT_LOCATION = { name: "La Chapelle-Saint-Mesmin", admin1: "Centre-Val de Loire", country: "France", latitude: 47.8906, longitude: 1.8285 };
  let forecastController = null;

  function node(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = String(text);
    return element;
  }

  function savedLocation() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude)) return value;
    } catch { /* Use the default location. */ }
    return DEFAULT_LOCATION;
  }

  function weatherKind(code) {
    if (code === 0) return ["clear", "Clear sky"];
    if ([1, 2].includes(code)) return ["partly", "Partly cloudy"];
    if (code === 3) return ["cloud", "Overcast"];
    if ([45, 48].includes(code)) return ["fog", "Foggy"];
    if ([51, 53, 55, 56, 57].includes(code)) return ["drizzle", "Drizzle"];
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ["rain", "Rain"];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ["snow", "Snow"];
    if ([95, 96, 99].includes(code)) return ["storm", "Thunderstorms"];
    return ["cloud", "Variable conditions"];
  }

  function weatherIcon(code, isDay = true, className = "") {
    const [kind, label] = weatherKind(Number(code));
    const wrapper = node("span", `weather_icon weather_icon_${kind} ${className}`.trim());
    wrapper.setAttribute("role", "img");
    wrapper.setAttribute("aria-label", label);
    const sky = isDay
      ? '<circle class="wi_sun" cx="26" cy="23" r="11"/><g class="wi_rays"><path d="M26 5v6M26 35v6M8 23h6M38 23h6M13 10l4 4M35 32l4 4M39 10l-4 4M17 32l-4 4"/></g>'
      : '<path class="wi_moon" d="M37 31A17 17 0 0 1 18 9a17 17 0 1 0 19 22Z"/>';
    const cloud = '<path class="wi_cloud" d="M13 44h31a9 9 0 0 0 1-18 14 14 0 0 0-26-4 11 11 0 0 0-6 22Z"/>';
    const precipitation = kind === "rain" || kind === "drizzle"
      ? '<path class="wi_rain" d="m19 49-3 7m13-7-3 7m13-7-3 7"/>'
      : kind === "snow" ? '<path class="wi_snow" d="M18 50v7m-3-4h6m9-3v7m-3-4h6m9-3v7m-3-4h6"/>'
      : kind === "storm" ? '<path class="wi_bolt" d="m31 46-7 11h7l-3 9 12-15h-8l4-5Z"/>'
      : kind === "fog" ? '<path class="wi_fog" d="M10 49h36M15 56h27"/>' : "";
    wrapper.innerHTML = `<svg viewBox="0 0 60 66" aria-hidden="true">${["clear", "partly"].includes(kind) ? sky : ""}${kind !== "clear" ? cloud : ""}${precipitation}</svg>`;
    return wrapper;
  }

  const rounded = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : "–";
  const formatTime = (value) => value ? new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "–";
  const dayLabel = (value, index) => index === 0 ? "Today" : new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${value}T12:00:00`));

  async function responseJson(url, signal) {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!response.ok) throw new Error(response.status >= 500 ? "Weather service is temporarily unavailable." : "Unable to load weather data.");
    return response.json();
  }

  function detailIcon(name) {
    const paths = {
      humidity: '<path d="M12 3.2S6.8 9.1 6.8 13.6a5.2 5.2 0 0 0 10.4 0C17.2 9.1 12 3.2 12 3.2Z"/><path d="M9.5 14.1a2.8 2.8 0 0 0 2.8 2.8"/>',
      wind: '<path d="M3.5 8h10.2a2.6 2.6 0 1 0-2.4-3.6"/><path d="M3.5 12h15.2a2.8 2.8 0 1 1-2.5 4"/><path d="M3.5 16h7"/>',
      rain: '<path d="M7.2 15.2h9.5a4 4 0 0 0 .3-8 5.3 5.3 0 0 0-9.9 1.6 3.2 3.2 0 0 0 .1 6.4Z"/><path d="m8 18-1 2.5M13 18l-1 2.5M18 18l-1 2.5"/>',
      pressure: '<circle cx="12" cy="12" r="8.5"/><path d="m12 12 4-3M7.5 16.5h9"/><path d="M12 6v1M7.8 8l.8.8M16.2 8l-.8.8"/>',
      uv: '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
      sunrise: '<path d="M3 18h18M5 14h14M7.2 14a4.8 4.8 0 0 1 9.6 0M12 3v4M5.6 7.6l2.1 2M18.4 7.6l-2.1 2"/>',
      sunset: '<path d="M3 18h18M5 14h14M7.2 14a4.8 4.8 0 0 1 9.6 0M12 7V3M9.8 5.2 12 3l2.2 2.2"/>',
      clouds: '<path d="M6.5 17.5h11a4 4 0 0 0 .4-8 6 6 0 0 0-11.4 1.8 3.1 3.1 0 0 0 0 6.2Z"/><path d="M5 7.8A4.8 4.8 0 0 1 13.8 6"/>',
    };
    const icon = node("span", "weather_detail_icon");
    icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
    return icon;
  }

  function detail(iconName, label, value) {
    const card = node("div", "weather_detail");
    card.append(detailIcon(iconName), node("span", "weather_detail_label", label), node("strong", "", value));
    return card;
  }

  function renderForecast(root, payload) {
    const { current = {}, hourly = {}, daily = {}, location = {} } = payload;
    const [, condition] = weatherKind(Number(current.weather_code));
    const stored = savedLocation();
    if (location.name && location.name !== "Current location" && location.name !== "My location") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...stored,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
      }));
    }
    const content = node("div", "weather_dashboard");
    const hero = node("section", "weather_hero");
    const heroLocation = node("div", "weather_hero_location");
    heroLocation.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    heroLocation.append(node("span", "", location.name || "Current location"));
    const heroMain = node("div", "weather_hero_main");
    heroMain.append(weatherIcon(current.weather_code, current.is_day === 1, "is_hero"));
    const temperature = node("div", "weather_temperature");
    temperature.append(node("strong", "", `${rounded(current.temperature_2m)}°`), node("span", "", condition), node("small", "", `Feels like ${rounded(current.apparent_temperature)}°`));
    heroMain.append(temperature);
    const heroMeta = node("div", "weather_hero_meta");
    heroMeta.append(node("span", "", `H: ${rounded(daily.temperature_2m_max?.[0])}°`), node("span", "", `L: ${rounded(daily.temperature_2m_min?.[0])}°`), node("span", "", `Updated ${formatTime(current.time)}`));
    hero.append(heroLocation, heroMain, heroMeta);

    const hourlySection = node("section", "weather_panel");
    hourlySection.append(node("h2", "weather_section_title", "Next hours"));
    const hourlyList = node("div", "weather_hourly");
    const currentHour = new Date(current.time || Date.now()).getTime();
    (hourly.time || []).forEach((time, index) => {
      if (new Date(time).getTime() < currentHour - 1800000 || hourlyList.children.length >= 12) return;
      const item = node("div", "weather_hour");
      item.append(node("strong", "", hourlyList.children.length === 0 ? "Now" : formatTime(time)), weatherIcon(hourly.weather_code?.[index], true, "is_hourly"), node("span", "weather_hour_temp", `${rounded(hourly.temperature_2m?.[index])}°`), node("small", "", `${rounded(hourly.precipitation_probability?.[index])}% rain`));
      hourlyList.append(item);
    });
    hourlySection.append(hourlyList);

    const dailySection = node("section", "weather_panel");
    dailySection.append(node("h2", "weather_section_title", "7-day forecast"));
    const dailyList = node("div", "weather_daily");
    (daily.time || []).forEach((date, index) => {
      const item = node("div", "weather_day");
      const [, description] = weatherKind(Number(daily.weather_code?.[index]));
      const label = node("div", "weather_day_label");
      label.append(node("strong", "", dayLabel(date, index)), node("small", "", description));
      const temperatures = node("div", "weather_day_temps");
      temperatures.append(node("strong", "", `${rounded(daily.temperature_2m_max?.[index])}°`), node("span", "", `${rounded(daily.temperature_2m_min?.[index])}°`));
      item.append(label, weatherIcon(daily.weather_code?.[index], true, "is_daily"), node("span", "weather_day_rain", `${rounded(daily.precipitation_probability_max?.[index])}%`), temperatures);
      dailyList.append(item);
    });
    dailySection.append(dailyList);

    const details = node("section", "weather_details");
    details.append(
      detail("humidity", "Humidity", `${rounded(current.relative_humidity_2m)}%`), detail("wind", "Wind", `${rounded(current.wind_speed_10m)} km/h`),
      detail("rain", "Precipitation", `${Number(current.precipitation || 0).toFixed(1)} mm`), detail("pressure", "Pressure", `${rounded(current.pressure_msl)} hPa`),
      detail("uv", "UV index", String(rounded(daily.uv_index_max?.[0]))), detail("sunrise", "Sunrise", formatTime(daily.sunrise?.[0])),
      detail("sunset", "Sunset", formatTime(daily.sunset?.[0])), detail("clouds", "Cloud cover", `${rounded(current.cloud_cover)}%`),
    );
    content.append(hero, hourlySection, dailySection, details, node("div", "weather_footer", `Forecast for ${location.name || "selected location"} · Weather by Open-Meteo · Location © OpenStreetMap contributors`));
    root.replaceChildren(content);
  }

  function renderError(root, message, retry) {
    const error = node("div", "weather_state weather_error");
    error.append(node("strong", "", "Weather unavailable"), node("p", "", message));
    const button = node("button", "btn_primary", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    error.append(button);
    root.replaceChildren(error);
  }

  async function loadForecast(root, location) {
    forecastController?.abort();
    forecastController = new AbortController();
    root.replaceChildren(node("div", "weather_state weather_loading", "Loading the latest forecast…"));
    const params = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, name: location.name });
    try {
      const payload = await responseJson(`/api/weather/forecast?${params}`, forecastController.signal);
      if (document.body.dataset.view === "weather") renderForecast(root, payload);
    } catch (error) {
      if (error.name !== "AbortError") renderError(root, error.message, () => loadForecast(root, location));
    }
  }

  function renderWeather() {
    const content = document.getElementById("content");
    if (!content) return;
    content.className = "weather_view";
    content.replaceChildren();
    const forecast = node("div", "weather_forecast");
    content.append(forecast);
    forecast.replaceChildren(node("div", "weather_state weather_loading", "Finding your current location…"));
    if (!navigator.geolocation) {
      void loadForecast(forecast, savedLocation());
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const previous = savedLocation();
      const sameArea = Math.abs(previous.latitude - coords.latitude) < 0.02
        && Math.abs(previous.longitude - coords.longitude) < 0.02;
      const hasResolvedName = previous.name
        && !["My location", "Current location", "Selected location"].includes(previous.name);
      const location = {
        name: sameArea && hasResolvedName ? previous.name : "My location",
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
      void loadForecast(forecast, location);
    }, () => void loadForecast(forecast, savedLocation()), {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 600000,
    });
  }

  window.addEventListener("navigationchange", (event) => {
    if (event.detail?.view === "weather") renderWeather();
    else forecastController?.abort();
  });
})();
