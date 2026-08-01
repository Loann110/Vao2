from contextlib import asynccontextmanager
from pathlib import Path
import sys

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import db
from backend.routes import router


@asynccontextmanager
async def lifespan(_app):
    db.init_db()
    yield


app = FastAPI(title="Vao2", lifespan=lifespan)
app.include_router(router)
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
