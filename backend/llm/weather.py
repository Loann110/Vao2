"""
The weather assistant: answers a question from the forecast, with the local model.

Called by `backend/routes/weather.py`. The forecast arrives already written as
plain facts (`platforms/weather.py: forecast_facts()`), and the model may only
use those. A question that is not about the weather is refused: the model is
told to answer the single word OFF_TOPIC.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
from backend.llm.model import generate_stream


SYSTEM_PROMPT = (
    "You are Vao's weather assistant. Only answer weather questions and decisions "
    "that depend on weather. Use only the forecast facts. Reply in the same "
    "language as the user. For anything else, reply exactly OFF_TOPIC."
)

OFF_TOPIC = "OFF_TOPIC"

# The answer is held back until this many characters have arrived, so an
# OFF_TOPIC reply is caught before any of it reaches the screen.
HOLD_BACK = 32


#/////////////////////////////////////////////////////////
# ANSWER /////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def weather_answer_stream(facts, question):
    """
    Yield ("text", piece) while the answer is written.

    Yields a single ("off_topic", "") instead when the question is not about
    the weather. Yields nothing when the model is unavailable.
    """
    prompt = f"Forecast (C, km/h, mm): {facts}\nQuestion: {question}"

    held_back = ""
    released = False

    for piece in generate_stream(prompt, system_prompt=SYSTEM_PROMPT):
        if released:
            yield "text", piece
            continue

        held_back += piece

        if OFF_TOPIC in held_back.upper()[:HOLD_BACK]:
            yield "off_topic", ""
            return

        if len(held_back) >= HOLD_BACK:
            released = True
            yield "text", held_back

    # A short answer never reached HOLD_BACK: it is sent whole at the end.
    if not released and held_back.strip():
        yield "text", held_back
