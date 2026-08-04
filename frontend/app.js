const THEME_KEY = "vao2-theme";

function applyTheme(theme, animate = false) {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  const button = document.getElementById("theme_button");
  const label = document.getElementById("theme_label");

  document.documentElement.dataset.theme = selectedTheme;

  if (label) label.textContent = selectedTheme === "dark" ? "Light" : "Dark";
  if (button) {
    button.setAttribute(
      "aria-label",
      `Switch to ${selectedTheme === "dark" ? "light" : "dark"} theme`,
    );

    if (animate) {
      button.classList.remove("is_switching");
      void button.offsetWidth;
      button.classList.add("is_switching");
      window.setTimeout(() => button.classList.remove("is_switching"), 500);
    }
  }
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

  applyTheme(nextTheme, true);
  localStorage.setItem(THEME_KEY, nextTheme);
}

function openAddSource() {
  const modal = document.getElementById("add_source_modal");
  if (!modal) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal_open");
  window.setTimeout(() => document.getElementById("source_type")?.focus(), 0);
}

function closeAddSource() {
  const modal = document.getElementById("add_source_modal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal_open");
  document.querySelector(".add_source_btn")?.focus();
}

function readSourcesStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem("vao2-sources") || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { categories: [], sources: [] };
    }

    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((item) => item && typeof item === "object" && typeof item.name === "string")
      : [];
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.filter((item) => item && typeof item === "object" && typeof item.url === "string")
      : [];

    return { categories, sources };
  } catch {
    return { categories: [], sources: [] };
  }
}

function getCategoryName(categoryId, categories) {
  const category = categories.find((item) => item.id === categoryId);
  return category?.name || "General";
}

async function updateLlmStatus() {
  const status = document.getElementById("llm_status");
  const label = document.getElementById("llm_status_label");
  if (!status || !label) return;

  status.className = "llm_status is_checking";
  label.textContent = "Checking local model...";
  try {
    const response = await fetch("/api/llm/status", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    status.className = `llm_status ${payload.available ? "is_available" : "is_unavailable"}`;
    label.textContent = payload.available
      ? `${payload.model} available`
      : `${payload.model} unavailable`;
  } catch {
    status.className = "llm_status is_unavailable";
    label.textContent = "Local model unavailable";
  }
}

let feedArticles = [];
let feedLoaded = false;
let youtubePlayers = [];
let youtubeProgressTimers = [];
let youtubeRenderVersion = 0;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

function formatVideoTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}

function playerControlIcon(name) {
  const icons = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7V5Zm6.5 0H17v14h-3.5V5Z" fill="currentColor"/></svg>',
    volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="m17 9 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };
  return icons[name] || "";
}

async function connectYouTubePlayers(version) {
  const YT = await loadYouTubeApi();
  if (version !== youtubeRenderVersion) return;

  document.querySelectorAll(".feed_card_player").forEach((iframe) => {
    const controls = iframe.closest(".feed_card_video")?.querySelector(".feed_player_controls");
    const progress = controls?.querySelector(".feed_player_progress");
    const playButton = controls?.querySelector('[data-action="toggle"]');
    const muteButton = controls?.querySelector('[data-action="mute"]');
    const volume = controls?.querySelector(".feed_player_volume");
    const time = controls?.querySelector(".feed_player_time");
    const cover = iframe.closest(".feed_card_video")?.querySelector(".feed_player_cover");
    const player = new YT.Player(iframe, {
      events: {
        onReady() {
          try {
            player.setOption("captions", "track", {});
            player.unloadModule("captions");
          } catch {
            // Some videos do not expose a captions module.
          }

          const syncAudioControls = () => {
            const isMuted = player.isMuted() || player.getVolume() === 0;
            if (muteButton) {
              muteButton.innerHTML = playerControlIcon(isMuted ? "muted" : "volume");
              muteButton.setAttribute("aria-label", isMuted ? "Unmute video" : "Mute video");
              muteButton.title = isMuted ? "Unmute" : "Mute";
            }
            if (volume && document.activeElement !== volume) {
              volume.value = String(player.getVolume());
            }
          };

          const togglePlayback = () => {
            if (player.getPlayerState() === YT.PlayerState.PLAYING) {
              player.pauseVideo();
            } else {
              player.playVideo();
            }
          };

          syncAudioControls();
          iframe.closest(".feed_card_video")?.addEventListener("click", (event) => {
            if (event.target.closest(".feed_player_controls")) return;
            togglePlayback();
          });
          progress?.addEventListener("input", () => {
            const duration = player.getDuration();
            if (duration) player.seekTo(duration * Number(progress.value) / 100, true);
          });
          volume?.addEventListener("input", () => {
            const value = Number(volume.value);
            player.setVolume(value);
            if (value > 0) player.unMute();
            else player.mute();
            syncAudioControls();
          });
          controls?.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-action]");
            if (!button) return;
            if (button.dataset.action === "mute") {
              if (player.isMuted() || player.getVolume() === 0) {
                if (player.getVolume() === 0) player.setVolume(100);
                player.unMute();
              } else {
                player.mute();
              }
              syncAudioControls();
            } else {
              togglePlayback();
            }
          });

          const timer = window.setInterval(() => {
            const duration = player.getDuration();
            if (progress && duration) {
              progress.value = String(player.getCurrentTime() / duration * 100);
            }
            if (time) {
              time.textContent = `${formatVideoTime(player.getCurrentTime())} / ${formatVideoTime(duration)}`;
            }
            syncAudioControls();
          }, 500);
          youtubeProgressTimers.push(timer);
        },
        onStateChange(event) {
          const isPlaying = event.data === YT.PlayerState.PLAYING;
          if (isPlaying && cover?.isConnected) {
            window.setTimeout(() => {
              if (player.getPlayerState() !== YT.PlayerState.PLAYING || !cover.isConnected) return;
              cover.classList.add("is_hiding");
              window.setTimeout(() => cover.remove(), 280);
            }, 600);
          }
          if (playButton) {
            playButton.innerHTML = playerControlIcon(isPlaying ? "pause" : "play");
            playButton.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
            playButton.title = isPlaying ? "Pause" : "Play";
          }
          if (isPlaying) {
            youtubePlayers.forEach((otherPlayer) => {
              if (otherPlayer !== event.target) otherPlayer.pauseVideo();
            });
          }
        },
      },
    });
    youtubePlayers.push(player);
  });
}

function renderForYouContent() {
  const content = document.getElementById("content");
  const filter = document.getElementById("feed_category_filter");
  const searchInput = document.getElementById("feed_search");
  const notice = document.getElementById("notice");

  if (!content) return;

  youtubeRenderVersion += 1;
  youtubePlayers.forEach((player) => player.destroy?.());
  youtubeProgressTimers.forEach((timer) => window.clearInterval(timer));
  youtubePlayers = [];
  youtubeProgressTimers = [];
  const renderVersion = youtubeRenderVersion;

  const { categories } = readSourcesStore();
  const selectedCategory = filter?.value || "all";
  const searchValue = searchInput?.value?.trim().toLowerCase() || "";
  const currentView = document.body.dataset.view || "all";

  const filteredArticles = feedArticles.filter((article) => {
    const matchesPlatform = currentView === "all" || article.platform === currentView;
    const matchesCategory = selectedCategory === "all" || article.category_id === selectedCategory;
    const haystack = `${article.title || ""} ${article.summary || ""} ${article.source_title || ""}`.toLowerCase();
    const matchesSearch = !searchValue || haystack.includes(searchValue);
    return matchesPlatform && matchesCategory && matchesSearch;
  });

  if (filter) {
    const currentValue = filter.value;
    filter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All categories";
    filter.appendChild(allOption);

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      filter.appendChild(option);
    });

    if (categories.some((category) => category.id === currentValue) || currentValue === "all") {
      filter.value = currentValue;
    } else {
      filter.value = "all";
    }
  }

  if (!filteredArticles.length) {
    content.innerHTML = "";
    content.className = "empty";
    if (notice) {
      notice.textContent = feedLoaded
        ? "No articles yet. Click Refresh to fetch the latest updates."
        : "Loading articles...";
      notice.hidden = false;
    }
    return;
  }

  if (notice) {
    notice.textContent = "";
    notice.hidden = true;
  }

  const list = document.createElement("div");
  list.className = "feed_list";

  filteredArticles.forEach((article) => {
    const card = document.createElement("article");
    card.className = "feed_card";
    const isYouTube = article.platform === "youtube" && article.media_url;
    if (isYouTube) card.classList.add("is_youtube");

    if (article.image_url && !isYouTube && article.platform !== "github") {
      const image = document.createElement("img");
      image.className = "feed_card_image";
      const fallbackImage = article.image_url;
      image.src = article.platform === "youtube"
        ? fallbackImage.replace(/\/hqdefault\.jpg(?:\?.*)?$/, "/maxresdefault.jpg")
        : fallbackImage;
      image.addEventListener("error", () => {
        if (image.src !== fallbackImage) image.src = fallbackImage;
      }, { once: true });
      image.alt = "";
      image.loading = "lazy";
      card.appendChild(image);
    }

    const header = document.createElement("div");
    header.className = "feed_card_header";

    const platform = document.createElement("span");
    platform.className = "feed_card_platform";
    platform.textContent = `${article.platform || "Source"} · ${article.source_title || ""}`;

    const category = document.createElement("span");
    category.className = "feed_card_category";
    category.textContent = getCategoryName(article.category_id, categories);

    header.append(platform, category);

    const title = document.createElement("h2");
    title.className = "feed_card_title";
    title.textContent = article.title || "Untitled article";

    const subtitle = document.createElement("p");
    subtitle.className = "feed_card_subtitle";
    subtitle.textContent = article.summary || "No description available";

    const link = document.createElement("a");
    link.className = "feed_card_link";
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Read";

    const summarize = document.createElement("button");
    summarize.type = "button";
    summarize.className = "feed_card_summarize";
    summarize.textContent = "Summarize";
    summarize.dataset.iaArticleUrl = `/api/articles/${article.id}`;
    summarize.dataset.iaDetailsUrl = `/api/articles/${article.id}/summary`;
    summarize.dataset.iaDetailsMethod = "POST";

    const actions = document.createElement("div");
    actions.className = "feed_card_actions";
    actions.append(link, summarize);

    const details = document.createElement("div");
    details.className = "feed_card_content";
    details.append(header, title, subtitle, actions);
    card.appendChild(details);

    if (isYouTube) {
      const player = document.createElement("iframe");
      player.className = "feed_card_player";
      const playerUrl = new URL(article.media_url);
      playerUrl.searchParams.set("enablejsapi", "1");
      playerUrl.searchParams.set("controls", "0");
      playerUrl.searchParams.set("cc_load_policy", "0");
      playerUrl.searchParams.set("disablekb", "1");
      playerUrl.searchParams.set("fs", "0");
      playerUrl.searchParams.set("iv_load_policy", "3");
      playerUrl.searchParams.set("playsinline", "1");
      playerUrl.searchParams.set("rel", "0");
      if (window.location.origin !== "null") {
        playerUrl.searchParams.set("origin", window.location.origin);
      }
      player.src = playerUrl.toString();
      player.title = `Play ${article.title || "YouTube video"}`;
      player.loading = "lazy";
      player.tabIndex = -1;
      player.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      player.allowFullscreen = true;
      player.referrerPolicy = "strict-origin-when-cross-origin";

      const video = document.createElement("div");
      video.className = "feed_card_video";
      if (article.image_url) {
        const cover = document.createElement("img");
        const fallbackImage = article.image_url;
        cover.className = "feed_player_cover";
        cover.src = fallbackImage.replace(/\/hqdefault\.jpg(?:\?.*)?$/, "/maxresdefault.jpg");
        cover.addEventListener("error", () => {
          if (cover.src !== fallbackImage) cover.src = fallbackImage;
        }, { once: true });
        cover.alt = "";
        video.appendChild(cover);
      }
      const controls = document.createElement("div");
      controls.className = "feed_player_controls";
      const progress = document.createElement("input");
      progress.className = "feed_player_progress";
      progress.type = "range";
      progress.min = "0";
      progress.max = "100";
      progress.step = "0.1";
      progress.value = "0";
      progress.setAttribute("aria-label", "Video progress");
      const actions = document.createElement("div");
      actions.className = "feed_player_actions";

      const play = document.createElement("button");
      play.type = "button";
      play.dataset.action = "toggle";
      play.innerHTML = playerControlIcon("play");
      play.setAttribute("aria-label", "Play video");
      play.title = "Play";

      const mute = document.createElement("button");
      mute.type = "button";
      mute.dataset.action = "mute";
      mute.innerHTML = playerControlIcon("volume");
      mute.setAttribute("aria-label", "Mute video");
      mute.title = "Mute";

      const volume = document.createElement("input");
      volume.className = "feed_player_volume";
      volume.type = "range";
      volume.min = "0";
      volume.max = "100";
      volume.value = "100";
      volume.setAttribute("aria-label", "Volume");

      const time = document.createElement("span");
      time.className = "feed_player_time";
      time.textContent = "0:00 / 0:00";

      actions.append(play, mute, volume, time);
      controls.append(progress, actions);
      video.append(player, controls);
      card.appendChild(video);
    }

    list.appendChild(card);
  });

  content.className = "";
  content.innerHTML = "";
  content.appendChild(list);
  if (list.querySelector(".feed_card_player")) {
    void connectYouTubePlayers(renderVersion);
  }
}

async function loadArticles() {
  const response = await fetch("/api/articles?limit=200", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Backend error ${response.status}`);
  const payload = await response.json();
  feedArticles = Array.isArray(payload.articles) ? payload.articles : [];
  feedLoaded = true;
  renderForYouContent();
}

async function refreshFeed() {
  const button = document.getElementById("refresh_button");
  const notice = document.getElementById("notice");
  if (button) button.disabled = true;
  if (notice) {
    notice.textContent = "Fetching latest updates...";
    notice.hidden = false;
  }

  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error(`Backend error ${response.status}`);
    await loadArticles();
  } catch (error) {
    if (notice) {
      notice.textContent = error instanceof Error ? error.message : "Refresh failed";
      notice.hidden = false;
    }
  } finally {
    if (button) button.disabled = false;
  }
}

window.refreshFeed = refreshFeed;

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem(THEME_KEY);

  applyTheme(savedTheme || "dark");
  void updateLlmStatus();
  window.setInterval(updateLlmStatus, 30000);

  const modal = document.getElementById("add_source_modal");
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeAddSource();
  });

  const filter = document.getElementById("feed_category_filter");
  filter?.addEventListener("change", renderForYouContent);

  const searchInput = document.getElementById("feed_search");
  searchInput?.addEventListener("input", renderForYouContent);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("open")) {
      closeAddSource();
    }
  });

  window.addEventListener("navigationchange", () => {
    if (document.body.dataset.view !== "add-source") {
      renderForYouContent();
    }
  });

  renderForYouContent();
  void loadArticles().catch(() => {
    feedLoaded = true;
    renderForYouContent();
  });
});
