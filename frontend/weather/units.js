/*
  °C or °F in the Weather view, remembered in the browser.

  The forecast always arrives in °C; temperatures are converted here, when
  they are written on screen.
*/

const STORAGE_KEY = "vao2-weather-units";


/** "metric" (°C) or "imperial" (°F). */
export function temperatureUnits() {
  return localStorage.getItem(STORAGE_KEY) === "imperial" ? "imperial" : "metric";
}

export function setTemperatureUnits(units) {
  localStorage.setItem(STORAGE_KEY, units);
}

/** A temperature given in °C, written in the chosen unit ("19°"). */
export function degrees(celsius) {
  const value = Number(celsius);
  if (celsius === null || celsius === undefined || !Number.isFinite(value)) {
    return "–";
  }

  if (temperatureUnits() === "imperial") {
    return `${Math.round(value * 9 / 5 + 32)}°`;
  }

  return `${Math.round(value)}°`;
}
