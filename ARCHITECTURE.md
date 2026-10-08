# Vao2: where is what

The file to open first. It answers one question: **where is the code for the
thing I want to change?**

## Where to change what

| What you see | Frontend | API route | Logic |
| --- | --- | --- | --- |
| Sidebar and switching views | `frontend/global/navigation.js` | | |
| Theme button | `frontend/global/theme.js` | | |
| Local model badge | `frontend/global/model_status.js` | `routes/system.py` | `llm/model.py` |
| The feed ("For you", "YouTube", "News") | `frontend/feed/feed.js` | `routes/articles.py` | `platforms/feeds.py`, `db.py` |
| One card of the feed | `frontend/feed/feed_card.js` | | |
| YouTube player in a card | `frontend/feed/video_player.js` | `routes/articles.py` (`/embeddable`) | `platforms/youtube.py` |
| "Read": the reader panel | `frontend/reader/` | `routes/reader.py` | `platforms/reader/` |
| "Summarize": the AI panel (Summary and Ask AI tabs) | `frontend/ia_box/` | `routes/assistant.py` | `llm/summary.py`, `llm/questions.py`, `llm/context.py` |
| "Add source" | `frontend/add_source/` | `routes/sources.py` | `platforms/news.py`, `platforms/youtube.py` |
| Categories and sources (shared) | `frontend/global/library.js` | `routes/sources.py` | `db.py` |
| Weather | `frontend/weather/weather.js` | `routes/weather.py` | `platforms/weather.py` |
| Weather assistant (right column of Weather) | `frontend/weather/weather_assistant.js` | `routes/weather.py` | `llm/weather.py` |
| °C / °F switch | `frontend/weather/units.js` | `routes/weather.py` (`units`) | `platforms/weather_outfit.py` |
| Weather icons | `frontend/weather/weather_icons.js` | | |
| What to wear (Weather) | `frontend/weather/weather_outfit.js` | `routes/weather.py` | `platforms/weather_outfit.py` |
| Icons | `frontend/global/icons.js`, `global/vendor/` | | `scripts/vendor_icons.py` downloads them |
| Colours, fonts, spacing | `frontend/global/styles/theme.css` | | |
| Page layout, buttons, small screens | `frontend/global/styles/` (`layout`, `controls`, `responsive`) | | |
| Calling the API, streamed answers | `frontend/global/api.js` | `routes/streaming.py` | |
| Local model download | | | `scripts/download_model.py` |

Backend paths are under `backend/`.

## How the pieces fit

```text
browser
  frontend/main.js            starts every part of the interface, in order
  frontend/<part>/            each part owns its JavaScript and its CSS
        │
        │  fetch("/api/...")
        ▼
backend/routes/               one file per area; short functions
        │
        ├── backend/platforms/   everything that talks to the outside world
        ├── backend/llm/         the local AI model (optional)
        └── backend/db.py        the SQLite database
```

- **Frontend.** Plain JavaScript modules (`import` / `export`), no build step.
  `main.js` is the only script in `index.html`. `global/` holds what every
  part shares (`dom.js`, `api.js`, `icons.js`, `library.js`). Views talk to each other
  through two events on `window`: `navigationchange` (another view was
  chosen) and `librarychange` (sources or categories changed).
- **Backend.** `backend/main.py` starts FastAPI. Every URL under `/api` is in
  `backend/routes/`; the rest serves the `frontend/` folder. AI answers are
  streamed as NDJSON (`routes/streaming.py`).
- **Database.** `backend/vao2.db`, created on first start. Only `db.py` reads
  or writes it.

## The AI column

The right column shows the AI panel (`frontend/ia_box/`) in every view except
Weather, where the weather assistant takes its place. Their code is separate;
the assistant reuses the `ia_*` CSS classes so both look the same.

## Optional settings

| Variable | Effect |
| --- | --- |
| `VAO2_MODEL_PATH`, `VAO2_MODEL_*` | Another model, or other llama.cpp settings (`llm/runtime.py`) |
| `VAO2_YOUTUBE_API_KEY` | Flags videos YouTube refuses to embed, before they are shown |

## Known limits

- **The local model is optional.** Without it, summaries fall back to the
  article's best sentences, and the weather assistant is disabled.
- **Some publishers refuse to be read.** The reader then says so and links to
  the original page; it never works around the refusal.
- **Some YouTube videos only play on YouTube.** Their card shows a "YouTube
  only" link instead of a player.
