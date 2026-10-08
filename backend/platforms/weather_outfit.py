"""
What to wear, for the morning, the afternoon and the evening.

Called by `backend/routes/weather.py`, which adds the result to the forecast
sent to the Weather view. Pure rules over the forecast (no AI model), so it
always answers. Taken from _beta's platforms/weather/assistant.py.

    1. Each period's hours give an apparent temperature (it includes wind chill
       and humidity).
    2. That temperature picks a comfort band, and the band a base outfit.
    3. Rain, snow, sun, air quality and temperature swings add things to take.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
from datetime import datetime


# (highest apparent temperature in °C, key, label, advice)
COMFORT_BANDS = [
    (-8, "arctic", "Arctic", "Every layer you own, and keep skin covered."),
    (0, "freezing", "Freezing", "Winter coat weather, with hat and gloves."),
    (7, "cold", "Cold", "A proper coat over a warm layer."),
    (13, "chilly", "Chilly", "A jacket you can zip up."),
    (18, "mild", "Mild", "A light jacket or a sweater is enough."),
    (23, "pleasant", "Pleasant", "Short sleeves, with something for later."),
    (28, "warm", "Warm", "Light, breathable clothes."),
    (33, "hot", "Hot", "As little and as light as decency allows."),
    (99, "scorching", "Scorching", "Stay in the shade and drink more than you think."),
]

# The base outfit of each band: (icon, garment, why).
OUTFITS = {
    "arctic": [
        ("thermal", "Thermal base layer", "Traps heat before any other layer can."),
        ("coat", "Insulated parka", "The outer shell has to stop the cold outright."),
        ("beanie", "Warm hat", "Most heat leaves through an uncovered head."),
        ("gloves", "Gloves", "Fingers lose feeling first at this temperature."),
        ("scarf", "Scarf", "Seals the gap a coat collar leaves open."),
        ("boots", "Insulated boots", "Thin soles conduct cold straight up."),
    ],
    "freezing": [
        ("sweater", "Warm sweater", "The layer that actually holds your heat."),
        ("coat", "Winter coat", "Wind cuts through anything lighter."),
        ("beanie", "Warm hat", "Cheapest way to stay comfortable outside."),
        ("gloves", "Gloves", "Bare hands stiffen within minutes."),
        ("boots", "Boots", "Keeps feet dry and off the cold ground."),
    ],
    "cold": [
        ("longsleeve", "Long sleeves", "Your base layer for the day."),
        ("coat", "Warm coat", "Still coat weather, even in sunshine."),
        ("trousers", "Long trousers", "No reason to expose your legs today."),
        ("scarf", "Light scarf", "Useful when the wind picks up."),
    ],
    "chilly": [
        ("longsleeve", "Long sleeves", "Comfortable on its own once you get moving."),
        ("jacket", "Zip-up jacket", "Adjust it as the day warms."),
        ("trousers", "Long trousers", "Bare legs would feel the chill."),
    ],
    "mild": [
        ("tshirt", "T-shirt", "The right base for this temperature."),
        ("sweater", "Sweater or light jacket", "Something to put on when the sun drops."),
        ("trousers", "Trousers or jeans", "Neither too warm nor too cool."),
    ],
    "pleasant": [
        ("tshirt", "T-shirt", "Nothing heavier is needed."),
        ("trousers", "Light trousers", "Or shorts, whichever you prefer."),
        ("sneakers", "Trainers", "Comfortable for a full day out."),
    ],
    "warm": [
        ("tshirt", "Light t-shirt", "Natural fibres breathe better than synthetics."),
        ("shorts", "Shorts", "Warm enough to skip the trousers."),
        ("sneakers", "Breathable shoes", "Feet overheat before the rest of you."),
    ],
    "hot": [
        ("tshirt", "Loose light top", "Loose beats tight when it is this warm."),
        ("shorts", "Shorts", "Keep as little fabric on as you can."),
        ("cap", "Sun hat", "Shade you carry with you."),
    ],
    "scorching": [
        ("tshirt", "Loosest, lightest top", "Pale colours reflect the heat."),
        ("shorts", "Shorts", "Anything heavier is a mistake today."),
        ("cap", "Sun hat", "Non-negotiable in this heat."),
        ("water", "Water bottle", "Dehydration arrives before thirst does."),
    ],
}

# (key, label, first hour, hour after the last)
DAY_PERIODS = [
    ("morning", "Morning", 6, 12),
    ("afternoon", "Afternoon", 12, 18),
    ("evening", "Evening", 18, 23),
]

SNOW_CODES = {71, 73, 75, 77, 85, 86}


#/////////////////////////////////////////////////////////
# FORECAST HOURS /////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _degrees(celsius, units):
    """A temperature for a sentence, in °C or in °F ("imperial")."""
    if units == "imperial":
        return f"{round(celsius * 9 / 5 + 32)}°F"

    return f"{round(celsius)}°C"


def _degree_gap(celsius_gap, units):
    """A difference of temperature: no 32 to add in °F."""
    if units == "imperial":
        return f"{round(celsius_gap * 9 / 5)}°F"

    return f"{round(celsius_gap)}°C"


def _number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    # NaN is the only value not equal to itself.
    if number != number:
        return None

    return number


def _hour_of(time):
    try:
        return int(time[11:13])
    except (TypeError, ValueError, IndexError):
        return None


def _hour_label(time):
    try:
        return datetime.fromisoformat(time).strftime("%H:%M")
    except (TypeError, ValueError):
        return ""


def _hours_of_date(forecast, date):
    """Every hourly row of one day, each as a dict of its values."""
    hourly = forecast.get("hourly") or {}
    times = hourly.get("time") or []

    rows = []
    for index, time in enumerate(times):
        if not time.startswith(date):
            continue

        row = {"time": time}
        for key, values in hourly.items():
            if key != "time" and index < len(values):
                row[key] = _number(values[index])

        rows.append(row)

    return rows


def _most_frequent_code(rows):
    counts = {}
    for row in rows:
        code = row.get("weather_code")
        if code is not None:
            counts[int(code)] = counts.get(int(code), 0) + 1

    if not counts:
        return 3

    return max(counts.items(), key=lambda item: (item[1], item[0]))[0]


#/////////////////////////////////////////////////////////
# OUTFIT /////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _comfort_band(apparent):
    for highest, key, label, note in COMFORT_BANDS:
        if apparent <= highest:
            return {"key": key, "label": label, "note": note}

    return {"key": "scorching", "label": "Scorching", "note": COMFORT_BANDS[-1][3]}


def _rain_spell(rows):
    """The first stretch of hours where rain is likely, or None."""
    wet_hours = []
    for index, row in enumerate(rows):
        likely = (row.get("precipitation_probability") or 0) >= 45
        measurable = (row.get("precipitation") or 0) >= 0.5
        if likely or measurable:
            wet_hours.append(index)

    if not wet_hours:
        return None

    start = wet_hours[0]
    end = start
    for index in wet_hours[1:]:
        if index - end > 1:
            break
        end = index

    return {
        "from": rows[start]["time"],
        "to": rows[end]["time"],
        "single": start == end,
        "peak": max(rows[index].get("precipitation_probability") or 0 for index in wet_hours),
        "total": round(sum(row.get("precipitation") or 0 for row in rows), 1),
    }


def _rain_item(spell, wind_peak):
    # Strong gusts turn an umbrella inside out.
    if wind_peak >= 45:
        return ("raincoat", "Hooded raincoat", f"Gusts near {round(wind_peak)} km/h would turn an umbrella inside out.")

    if spell["single"]:
        when = f"around {_hour_label(spell['from'])}"
    else:
        when = f"from {_hour_label(spell['from'])} to {_hour_label(spell['to'])}"

    if spell["peak"] >= 45:
        odds = f"up to {round(spell['peak'])}% chance"
    else:
        odds = f"about {spell['total']:.1f} mm expected"

    return ("umbrella", "Umbrella", f"Rain expected {when}, {odds}.")


def _things_to_take(rows, forecast, band_key, units):
    """What the base outfit does not cover: rain, snow, sun, air, a cooler hour."""
    current = forecast.get("current") or {}
    daily = forecast.get("daily") or {}
    air = (forecast.get("air_quality") or {}).get("current") or {}

    wind_peak = max([row.get("wind_gusts_10m") or 0 for row in rows] or [0])
    uv_peak = max([row.get("uv_index") or 0 for row in rows] or [0])
    snow = any((row.get("weather_code") or 0) in SNOW_CODES for row in rows)
    air_index = _number(air.get("us_aqi")) or 0
    high = _number((daily.get("temperature_2m_max") or [None])[0]) or 0
    temperature_now = _number(current.get("temperature_2m")) or 0

    items = []

    spell = _rain_spell(rows)
    if spell:
        items.append(_rain_item(spell, wind_peak))

    if snow:
        items.append(("boots", "Waterproof boots", "Snow is in the forecast, keep your feet dry."))

    if uv_peak >= 6:
        items.append(("sunscreen", "Sunscreen", f"UV peaks at {uv_peak:.1f}, high enough to burn."))
        items.append(("sunglasses", "Sunglasses", "Glare will be strong in the open."))
    elif uv_peak >= 3 and not spell:
        items.append(("sunglasses", "Sunglasses", "Bright enough to squint through the afternoon."))

    if air_index >= 101:
        items.append(("mask", "Mask if you are sensitive", f"Air quality index {round(air_index)} is unhealthy for sensitive groups."))

    if temperature_now >= 27 or high >= 30:
        items.append(("water", "Water bottle", "You will lose more fluid than you notice in this heat."))

    apparent = [row["apparent_temperature"] for row in rows if row.get("apparent_temperature") is not None]
    swing = max(apparent) - min(apparent) if apparent else 0
    if swing >= 8 and band_key not in {"arctic", "freezing"}:
        items.append(("sweater", "A layer for later", f"It swings {_degree_gap(swing, units)} between the warmest and coolest hour ahead."))

    # One entry per icon: the first reason wins.
    unique = {}
    for icon, label, reason in items:
        unique.setdefault(icon, {"icon": icon, "label": label, "reason": reason})

    return list(unique.values())


#/////////////////////////////////////////////////////////
# PERIODS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def _period(forecast, key, label, date, rows, today, current_hour, start, end, units):
    apparent = [row["apparent_temperature"] for row in rows if row.get("apparent_temperature") is not None]
    if not apparent:
        return None

    average = sum(apparent) / len(apparent)
    coldest = min(apparent)

    # A cold hour weighs more than the average: you dress for the coolest moment.
    band = _comfort_band(min(average, coldest + 1.5))

    outfit = []
    for icon, garment, reason in OUTFITS[band["key"]]:
        outfit.append({"icon": icon, "label": garment, "reason": reason})

    daylight_hours = sum(1 for row in rows if row.get("is_day"))

    return {
        "id": key,
        "label": label,
        "is_today": date == today,
        "current": date == today and start <= current_hour < end,
        "temperature": round(average, 1),
        "band": band,
        "headline": (
            f"{band['label']} out there, {_degrees(average, units)} on average "
            f"and {_degrees(coldest, units)} at the coolest point."
        ),
        "outfit": outfit,
        "carry": _things_to_take(rows, forecast, band["key"], units),
        "rain_chance": round(max(row.get("precipitation_probability") or 0 for row in rows)),
        "weather_code": _most_frequent_code(rows),
        "is_day": daylight_hours / len(rows) >= 0.5,
    }


def outfit_periods(forecast, units="metric"):
    """
    Outfits for the morning, the afternoon and the evening.

    `units` ("metric" or "imperial") only changes how temperatures are written
    in the sentences; the numbers stay in °C.

    A period that is already over today is given for tomorrow, so the three
    shown are always still ahead.
    """
    daily = forecast.get("daily") or {}
    dates = daily.get("time") or []
    current_time = (forecast.get("current") or {}).get("time") or ""

    current_hour = _hour_of(current_time)
    if current_hour is None:
        current_hour = 12

    today = dates[0] if dates else current_time[:10]
    tomorrow = dates[1] if len(dates) > 1 else today

    periods = []
    for key, label, start, end in DAY_PERIODS:
        date = today if current_hour < end else tomorrow

        rows = []
        for row in _hours_of_date(forecast, date):
            hour = _hour_of(row["time"])
            if hour is not None and start <= hour < end:
                rows.append(row)

        period = _period(forecast, key, label, date, rows, today, current_hour, start, end, units)
        if period:
            periods.append(period)

    return periods
