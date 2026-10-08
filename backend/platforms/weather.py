"""
Weather forecast from Open-Meteo (no API key needed).

Called by `backend/routes/weather.py`:

- `weather_forecast()` gives the Weather view everything it draws: current
  conditions, hours, days and air quality;
- `forecast_facts()` turns that same forecast into short sentences the weather
  assistant gives to the local model.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
from datetime import UTC, datetime

import httpx


FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
REVERSE_GEOCODING_URL = "https://nominatim.openstreetmap.org/reverse"

CURRENT_FIELDS = [
    "temperature_2m", "apparent_temperature", "relative_humidity_2m",
    "precipitation", "weather_code", "cloud_cover", "pressure_msl",
    "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "is_day",
    "dew_point_2m", "uv_index", "visibility",
]

HOURLY_FIELDS = [
    "temperature_2m", "apparent_temperature", "precipitation_probability",
    "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m",
    "relative_humidity_2m", "visibility", "uv_index", "is_day",
]

DAILY_FIELDS = [
    "weather_code", "temperature_2m_max", "temperature_2m_min",
    "apparent_temperature_max", "apparent_temperature_min",
    "precipitation_probability_max", "precipitation_sum", "sunrise", "sunset",
    "sunshine_duration", "uv_index_max", "wind_speed_10m_max", "wind_gusts_10m_max",
]

AIR_QUALITY_FIELDS = [
    "us_aqi", "european_aqi", "pm2_5", "pm10", "ozone",
    "nitrogen_dioxide", "sulphur_dioxide", "carbon_monoxide",
]

# Names tried in order when turning coordinates into a place name.
PLACE_KEYS = ("city", "town", "village", "municipality", "county")

# WMO weather codes, as Open-Meteo reports them.
CONDITION_NAMES = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "freezing fog",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "heavy freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "heavy freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light rain showers", 81: "rain showers", 82: "heavy rain showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm",
}

UPCOMING_HOURS = 6


#/////////////////////////////////////////////////////////
# FORECAST ///////////////////////////////////////////////
#/////////////////////////////////////////////////////////
async def _air_quality(client, latitude, longitude):
    """Current air quality, or an empty dict: the forecast works without it."""
    try:
        response = await client.get(AIR_QUALITY_URL, params={
            "latitude": latitude,
            "longitude": longitude,
            "current": ",".join(AIR_QUALITY_FIELDS),
            "timezone": "auto",
        })
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return {}


async def _place_name(client, latitude, longitude):
    """The town at these coordinates, or an empty string."""
    try:
        # Rounded to about 1 km: city-level precision is enough, and the
        # user's exact position is not sent to the geocoding service.
        response = await client.get(REVERSE_GEOCODING_URL, params={
            "lat": round(latitude, 2),
            "lon": round(longitude, 2),
            "format": "jsonv2",
            "addressdetails": 1,
            "zoom": 10,
        })
        response.raise_for_status()
        address = response.json().get("address", {})
    except (httpx.HTTPError, ValueError):
        return ""

    for key in PLACE_KEYS:
        if address.get(key):
            return address[key]

    return ""


async def weather_forecast(latitude, longitude, name=""):
    """Seven-day forecast, current conditions and air quality for one place."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_FIELDS),
        "hourly": ",".join(HOURLY_FIELDS),
        "daily": ",".join(DAILY_FIELDS),
        "timezone": "auto",
        "forecast_days": 7,
    }

    headers = {"User-Agent": "Vao2/1.0", "Accept-Language": "en"}

    async with httpx.AsyncClient(timeout=15, headers=headers) as client:
        response = await client.get(FORECAST_URL, params=params)
        response.raise_for_status()

        air_quality = await _air_quality(client, latitude, longitude)

        if not name or name == "My location":
            name = await _place_name(client, latitude, longitude)

    forecast = response.json()

    return {
        "location": {
            "name": name or "Current location",
            "latitude": forecast.get("latitude", latitude),
            "longitude": forecast.get("longitude", longitude),
            "timezone": forecast.get("timezone", ""),
        },
        "current": forecast.get("current", {}),
        "current_units": forecast.get("current_units", {}),
        "hourly": forecast.get("hourly", {}),
        "hourly_units": forecast.get("hourly_units", {}),
        "daily": forecast.get("daily", {}),
        "daily_units": forecast.get("daily_units", {}),
        "air_quality": air_quality,
        "updated_at": datetime.now(UTC).isoformat(),
        "provider": "Open-Meteo",
    }


#/////////////////////////////////////////////////////////
# FACTS FOR THE ASSISTANT ////////////////////////////////
#/////////////////////////////////////////////////////////
def _number(value, digits=0):
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "unknown"


def _first(values):
    """First value of a daily series (today), or None."""
    return values[0] if values else None


def _current_facts(current):
    condition = CONDITION_NAMES.get(current.get("weather_code"), "variable conditions")

    visibility = current.get("visibility")
    visibility_km = _number(float(visibility) / 1000, 1) if visibility is not None else "unknown"

    return (
        f"Now {_number(current.get('temperature_2m'))} C, "
        f"feels like {_number(current.get('apparent_temperature'))} C, {condition}; "
        f"wind {_number(current.get('wind_speed_10m'))} km/h, "
        f"humidity {_number(current.get('relative_humidity_2m'))}%, "
        f"rain {_number(current.get('precipitation'), 1)} mm, "
        f"pressure {_number(current.get('pressure_msl'))} hPa, "
        f"UV {_number(current.get('uv_index'))}, "
        f"visibility {visibility_km} km, "
        f"dew point {_number(current.get('dew_point_2m'))} C, "
        f"cloud cover {_number(current.get('cloud_cover'))}%."
    )


def _today_facts(daily):
    high = _first(daily.get("temperature_2m_max"))
    low = _first(daily.get("temperature_2m_min"))
    rain_chance = _first(daily.get("precipitation_probability_max"))
    uv = _first(daily.get("uv_index_max"))

    return (
        f"Today high {_number(high)} C, "
        f"low {_number(low)} C, "
        f"max rain chance {_number(rain_chance)}%, "
        f"max UV {_number(uv)}."
    )


def _upcoming_hours(hourly, now):
    """One short line per coming hour, for the next few hours."""
    times = hourly.get("time", [])
    temperatures = hourly.get("temperature_2m", [])
    rain_chances = hourly.get("precipitation_probability", [])
    wind_speeds = hourly.get("wind_speed_10m", [])

    lines = []

    for index, time in enumerate(times):
        if time < now or index >= len(temperatures):
            continue

        clock = time[11:16] if len(time) >= 16 else time
        rain = _number(rain_chances[index]) if index < len(rain_chances) else "unknown"
        wind = _number(wind_speeds[index]) if index < len(wind_speeds) else "unknown"

        lines.append(f"{clock}: {_number(temperatures[index])} C, rain {rain}%, wind {wind} km/h")

        if len(lines) == UPCOMING_HOURS:
            break

    return lines


def forecast_facts(forecast):
    """The forecast as a few sentences of plain facts, for the local model."""
    current = forecast.get("current", {})
    hourly = forecast.get("hourly", {})
    daily = forecast.get("daily", {})

    location_name = str(forecast.get("location", {}).get("name", "Current location"))[:80]
    air_index = forecast.get("air_quality", {}).get("current", {}).get("us_aqi")

    upcoming = _upcoming_hours(hourly, now=str(current.get("time", "")))
    upcoming_text = "; ".join(upcoming) or "unavailable"

    sentences = [
        f"Location: {location_name}.",
        _current_facts(current),
        _today_facts(daily),
        f"Next hours: {upcoming_text}.",
        f"US air quality index: {_number(air_index)}.",
    ]

    return " ".join(sentences)
