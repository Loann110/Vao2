/*
  Vao2 starts here: each part of the interface is started in order.

    global/     sidebar, theme, local model badge, shared source library
    feed/       the article feed and its YouTube players
    reader/     the reader panel ("Read" on a card)
    ia_box/     the AI panel ("Summarize" on a card)
    add_source/ the "Add source" view
    weather/    the Weather view
*/

import { startAddSource } from "./add_source/add_source.js";
import { startFeed } from "./feed/feed.js";
import { loadLibrary } from "./global/library.js";
import { startModelStatus } from "./global/model_status.js";
import { startNavigation } from "./global/navigation.js";
import { startTheme } from "./global/theme.js";
import { startAiPanel } from "./ia_box/ia_box.js";
import { startWeather } from "./weather/weather.js";


async function start() {
  startTheme();
  startNavigation();
  startModelStatus();

  // Categories are needed by the feed and the "Add source" view.
  try {
    await loadLibrary();
  } catch (error) {
    console.warn("[Vao2] The source library could not be loaded.", error);
  }

  startAddSource();
  startAiPanel();
  startWeather();
  startFeed();
}

void start();
