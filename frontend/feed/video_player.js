/*
  The YouTube player inside a feed card.

  The video plays in YouTube's official embedded player. Its own controls are
  turned off and Vao2 draws simpler ones under it (play, mute, volume,
  progress), driven through YouTube's IFrame API.

  - buildVideo(article)  the player block of a card
  - buildLink(...)       the block shown instead when the video's owner refuses
                         playback outside YouTube ("YouTube only")
  - connectPlayers()     wire every player on the page to its controls
  - resetPlayers()       forget every player before the feed is redrawn

  Only one video plays at a time.
*/

import { element } from "../global/dom.js";
import { phosphorIcon } from "../global/icons.js";


const IFRAME_API_URL = "https://www.youtube.com/iframe_api";

// YouTube's error codes when the owner disabled embedding.
const EMBEDDING_REFUSED = [101, 150];

// Control -> Phosphor icon (global/icons.js).
const ICONS = {
  play: "play",
  pause: "pause",
  volume: "speaker-high",
  muted: "speaker-x",
};

let players = [];
let progressTimers = [];

// Bumped on every redraw, so a player that finishes loading after the feed
// was redrawn knows it belongs to a page that no longer exists.
let renderVersion = 0;


/* ---- thumbnails --------------------------------------------------------- */

/** An <img> showing the large thumbnail, falling back to the feed's own. */
function thumbnail(className, imageUrl) {
  const image = element("img", className);
  image.src = imageUrl.replace(/\/hqdefault\.jpg(?:\?.*)?$/, "/maxresdefault.jpg");

  image.addEventListener("error", () => {
    if (image.src !== imageUrl) {
      image.src = imageUrl;
    }
  }, { once: true });

  image.alt = "";
  return image;
}

export function videoIdFromEmbed(embedUrl) {
  return embedUrl.replace(/\/+$/, "").split("/").pop();
}

function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}


/* ---- the player block --------------------------------------------------- */

function embedFrame(article) {
  const url = new URL(article.media_url);

  // YouTube's own interface is switched off: the card draws its own below.
  url.searchParams.set("enablejsapi", "1");
  url.searchParams.set("controls", "0");
  url.searchParams.set("cc_load_policy", "0");
  url.searchParams.set("disablekb", "1");
  url.searchParams.set("fs", "0");
  url.searchParams.set("iv_load_policy", "3");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  if (window.location.origin !== "null") {
    url.searchParams.set("origin", window.location.origin);
  }

  const frame = element("iframe", "feed_card_player");
  frame.src = url.toString();
  frame.dataset.videoId = videoIdFromEmbed(article.media_url);
  frame.dataset.articleId = article.id ?? "";
  frame.title = `Play ${article.title || "YouTube video"}`;
  frame.loading = "lazy";
  frame.tabIndex = -1;
  frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";

  return frame;
}

function rangeInput(className, step, value, label) {
  const input = element("input", className);
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = step;
  input.value = value;
  input.setAttribute("aria-label", label);
  return input;
}

function controlButton(action, iconName, label) {
  const button = element("button");
  button.type = "button";
  button.dataset.action = action;
  button.replaceChildren(phosphorIcon(ICONS[iconName]));
  button.setAttribute("aria-label", `${label} video`);
  button.title = label;
  return button;
}

function controlBar() {
  const progress = rangeInput("feed_player_progress", "0.1", "0", "Video progress");
  const play = controlButton("toggle", "play", "Play");
  const mute = controlButton("mute", "volume", "Mute");
  const volume = rangeInput("feed_player_volume", "1", "100", "Volume");
  const time = element("span", "feed_player_time", "0:00 / 0:00");

  const actions = element("div", "feed_player_actions");
  actions.append(play, mute, volume, time);

  const controls = element("div", "feed_player_controls");
  controls.append(progress, actions);
  return controls;
}

/** The video block of a card: thumbnail cover, embedded player and controls. */
export function buildVideo(article) {
  const block = element("div", "feed_card_video");

  // The cover hides the embed until the video starts playing.
  if (article.image_url) {
    block.append(thumbnail("feed_player_cover", article.image_url));
  }

  block.append(embedFrame(article), controlBar());
  return block;
}

/**
 * The block shown instead of a player when the owner refuses embedding:
 * the thumbnail, a "YouTube only" badge, and a link to watch it there.
 */
export function buildLink(videoId, title, imageUrl = "") {
  const link = element("a", "feed_card_video is_external");
  link.href = watchUrl(videoId);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `${title || "This video"} plays on YouTube only`;

  const fallbackImage = imageUrl || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
  const cover = thumbnail("feed_link_cover", fallbackImage);
  cover.loading = "lazy";

  const badge = element("span", "feed_link_badge", "YouTube only");

  const action = element("span", "feed_link_action");
  action.append(phosphorIcon(ICONS.play), element("span", "", "Watch on YouTube ↗"));

  link.append(cover, badge, action);
  return link;
}


/* ---- driving a player --------------------------------------------------- */

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

/** Fade the cover out once the video has really started. */
function hideCover(block, isStillPlaying) {
  const cover = block.querySelector(".feed_player_cover");
  if (!cover) {
    return;
  }

  window.setTimeout(() => {
    if (!isStillPlaying() || !cover.isConnected) {
      return;
    }

    cover.classList.add("is_hiding");
    window.setTimeout(() => cover.remove(), 280);
  }, 600);
}

function showPlayState(block, player, isPlaying, isStillPlaying) {
  const button = block.querySelector('[data-action="toggle"]');
  button.replaceChildren(phosphorIcon(ICONS[isPlaying ? "pause" : "play"]));
  button.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
  button.title = isPlaying ? "Pause" : "Play";

  if (!isPlaying) {
    return;
  }

  hideCover(block, isStillPlaying);

  // One video at a time. A player that is not ready yet has no pauseVideo.
  for (const other of players) {
    if (other !== player) {
      other.pauseVideo?.();
    }
  }
}

/** Wire the controls under a player. Returns an AbortController that unwires them. */
function bindControls(block, player, isPlaying) {
  const progress = block.querySelector(".feed_player_progress");
  const muteButton = block.querySelector('[data-action="mute"]');
  const volume = block.querySelector(".feed_player_volume");
  const time = block.querySelector(".feed_player_time");
  const controls = block.querySelector(".feed_player_controls");

  const binding = new AbortController();
  const { signal } = binding;

  const showAudioState = () => {
    const isMuted = player.isMuted() || player.getVolume() === 0;

    muteButton.replaceChildren(phosphorIcon(ICONS[isMuted ? "muted" : "volume"]));
    muteButton.setAttribute("aria-label", isMuted ? "Unmute video" : "Mute video");
    muteButton.title = isMuted ? "Unmute" : "Mute";

    // Not while the user is dragging the slider.
    if (document.activeElement !== volume) {
      volume.value = String(player.getVolume());
    }
  };

  const togglePlay = () => {
    if (isPlaying()) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  const toggleMute = () => {
    const isMuted = player.isMuted() || player.getVolume() === 0;

    if (isMuted) {
      if (player.getVolume() === 0) {
        player.setVolume(100);
      }
      player.unMute();
    } else {
      player.mute();
    }

    showAudioState();
  };

  // A click on the picture plays or pauses, like on youtube.com.
  block.addEventListener("click", (event) => {
    if (!event.target.closest(".feed_player_controls")) {
      togglePlay();
    }
  }, { signal });

  controls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    if (button.dataset.action === "mute") {
      toggleMute();
    } else {
      togglePlay();
    }
  }, { signal });

  progress.addEventListener("input", () => {
    const duration = player.getDuration();
    if (duration) {
      player.seekTo(duration * Number(progress.value) / 100, true);
    }
  }, { signal });

  volume.addEventListener("input", () => {
    const value = Number(volume.value);

    player.setVolume(value);
    if (value > 0) {
      player.unMute();
    } else {
      player.mute();
    }

    showAudioState();
  }, { signal });

  const timer = window.setInterval(() => {
    const duration = player.getDuration();
    const position = player.getCurrentTime();

    if (duration) {
      progress.value = String(position / duration * 100);
    }

    // A video not played yet has no duration: "0:00" alone, rather than a
    // "0:00 / 0:00" that looks broken.
    if (duration) {
      time.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
    } else {
      time.textContent = formatTime(position);
    }

    showAudioState();
  }, 500);

  progressTimers.push(timer);
  signal.addEventListener("abort", () => window.clearInterval(timer), { once: true });

  showAudioState();
  return binding;
}


/* ---- refused videos ----------------------------------------------------- */

/** Tell the backend, so the next render draws a link card from the start. */
function reportRefusal(articleId) {
  if (!articleId) {
    return;
  }

  void fetch(`/api/articles/${encodeURIComponent(articleId)}/embeddable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeddable: false }),
  }).catch(() => {});
}

/** Replace a refused player with the "YouTube only" link, in place. */
function showAsYouTubeOnly(block, binding, videoId, articleId) {
  binding?.abort();

  const card = block.closest(".feed_card");
  const title = card.querySelector(".feed_card_title")?.textContent || "";
  const imageUrl = card.dataset.imageUrl || "";

  block.replaceWith(buildLink(videoId, title, imageUrl));
  card.classList.add("is_youtube_only");

  const readLink = card.querySelector(".feed_card_link");
  readLink.textContent = "Watch on YouTube ↗";
  readLink.href = watchUrl(videoId);

  reportRefusal(articleId);
}


/* ---- page lifecycle ----------------------------------------------------- */

function loadIframeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  return new Promise((resolve) => {
    // YouTube calls this global function once its script is ready.
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };

    if (!document.querySelector(`script[src="${IFRAME_API_URL}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_URL;
      document.head.appendChild(script);
    }
  });
}

/** Forget every player before the feed is redrawn. Returns the new version. */
export function resetPlayers() {
  renderVersion += 1;

  for (const player of players) {
    player.destroy?.();
  }
  for (const timer of progressTimers) {
    window.clearInterval(timer);
  }

  players = [];
  progressTimers = [];

  return renderVersion;
}

function connectPlayer(YT, frame, version) {
  const block = frame.closest(".feed_card_video");
  const videoId = frame.dataset.videoId || "";
  const articleId = frame.dataset.articleId || "";
  let binding = null;

  const isPlaying = () => player.getPlayerState() === YT.PlayerState.PLAYING;

  const player = new YT.Player(frame, {
    events: {
      onReady() {
        // Subtitles are not wanted in a feed preview.
        try {
          player.setOption("captions", "track", {});
          player.unloadModule("captions");
        } catch {
          // Some videos have no captions module.
        }

        binding = bindControls(block, player, isPlaying);
      },

      onStateChange(event) {
        const playing = event.data === YT.PlayerState.PLAYING;
        showPlayState(block, event.target, playing, isPlaying);
      },

      onError(event) {
        if (!EMBEDDING_REFUSED.includes(event.data)) {
          return;
        }

        const pageStillShown = version === renderVersion && block.isConnected;
        if (pageStillShown && videoId) {
          showAsYouTubeOnly(block, binding, videoId, articleId);
        }
      },
    },
  });

  players.push(player);
}

/** Wire every player on the page to the controls beneath it. */
export async function connectPlayers(version) {
  const YT = await loadIframeApi();

  // The feed may have been redrawn while the API was loading.
  if (version !== renderVersion) {
    return;
  }

  for (const frame of document.querySelectorAll("iframe.feed_card_player")) {
    connectPlayer(YT, frame, version);
  }
}
