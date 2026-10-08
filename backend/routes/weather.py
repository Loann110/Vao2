"""
The Weather view.

    GET  /api/weather/forecast?latitude=..&longitude=..&name=..
    POST /api/weather/assistant/stream      a question about the forecast
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import httpx
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.concurrency import iterate_in_threadpool

from backend.llm.model import status as model_status
from backend.llm.weather import weather_answer_stream
from backend.platforms.weather import forecast_facts, weather_forecast
from backend.platforms.weather_outfit import outfit_periods
from backend.routes.streaming import event_line, stream_response


router = APIRouter()

UNAVAILABLE = "Weather data is temporarily unavailable"


#/////////////////////////////////////////////////////////
# FORECAST ///////////////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.get("/weather/forecast")
async def get_forecast(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    name: str = Query(default="", max_length=120),
    units: str = Query(default="metric", pattern="^(metric|imperial)$"),
):
    try:
        forecast = await weather_forecast(latitude, longitude, name.strip())
    except httpx.HTTPError as error:
        raise HTTPException(502, UNAVAILABLE) from error

    forecast["outfit_periods"] = outfit_periods(forecast, units)
    return forecast


#/////////////////////////////////////////////////////////
# ASSISTANT //////////////////////////////////////////////
#/////////////////////////////////////////////////////////
@router.post("/weather/assistant/stream")
async def stream_weather_answer(
    question: str = Body(min_length=2, max_length=400),
    latitude: float = Body(ge=-90, le=90),
    longitude: float = Body(ge=-180, le=180),
):
    try:
        forecast = await weather_forecast(latitude, longitude)
    except httpx.HTTPError as error:
        raise HTTPException(502, UNAVAILABLE) from error

    facts = forecast_facts(forecast)
    question = question.strip()

    async def events():
        yield event_line("status", message="Reading the forecast…")

        answered = False

        writer = weather_answer_stream(facts, question)
        async for kind, text in iterate_in_threadpool(writer):
            if kind == "off_topic":
                yield event_line("off_topic")
                return

            answered = True
            yield event_line("delta", text=text)

        if not answered:
            error = model_status().get("error") or "The local model returned an empty response."
            yield event_line("error", message=error)
            return

        yield event_line("complete")

    return stream_response(events())
