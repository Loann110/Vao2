"""Weather platform data from Open-Meteo."""

from datetime import UTC, datetime

import httpx


FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_GEOCODING_URL = "https://nominatim.openstreetmap.org/reverse"


async def search_locations(query: str, limit: int = 6):
    params = {
        "name": query,
        "count": limit,
        "language": "en",
        "format": "json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(GEOCODING_URL, params=params)
        response.raise_for_status()
    return [
        {
            "id": item.get("id"),
            "name": item.get("name", ""),
            "admin1": item.get("admin1", ""),
            "country": item.get("country", ""),
            "country_code": item.get("country_code", ""),
            "latitude": item["latitude"],
            "longitude": item["longitude"],
            "timezone": item.get("timezone", "auto"),
        }
        for item in response.json().get("results", [])
        if "latitude" in item and "longitude" in item
    ]


async def weather_forecast(latitude: float, longitude: float, name: str = ""):
    current_fields = [
        "temperature_2m", "apparent_temperature", "relative_humidity_2m",
        "precipitation", "weather_code", "cloud_cover", "pressure_msl",
        "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "is_day",
    ]
    hourly_fields = [
        "temperature_2m", "apparent_temperature", "precipitation_probability",
        "weather_code", "wind_speed_10m", "relative_humidity_2m", "visibility",
    ]
    daily_fields = [
        "weather_code", "temperature_2m_max", "temperature_2m_min",
        "apparent_temperature_max", "apparent_temperature_min",
        "precipitation_probability_max", "precipitation_sum", "sunrise", "sunset",
        "sunshine_duration", "uv_index_max", "wind_speed_10m_max", "wind_gusts_10m_max",
    ]
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(current_fields),
        "hourly": ",".join(hourly_fields),
        "daily": ",".join(daily_fields),
        "timezone": "auto",
        "forecast_days": 7,
    }
    async with httpx.AsyncClient(
        timeout=15,
        headers={"User-Agent": "Vao2/1.0", "Accept-Language": "en"},
    ) as client:
        response = await client.get(FORECAST_URL, params=params)
        response.raise_for_status()
        if not name or name == "My location":
            try:
                # City-level precision is sufficient and avoids sharing the
                # user's exact coordinates with the reverse-geocoding service.
                place_response = await client.get(REVERSE_GEOCODING_URL, params={
                    "lat": round(latitude, 2),
                    "lon": round(longitude, 2),
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "zoom": 10,
                })
                place_response.raise_for_status()
                address = place_response.json().get("address", {})
                name = next((address.get(key) for key in (
                    "city", "town", "village", "municipality", "county"
                ) if address.get(key)), name)
            except (httpx.HTTPError, ValueError):
                pass
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
        "updated_at": datetime.now(UTC).isoformat(),
        "provider": "Open-Meteo",
    }
