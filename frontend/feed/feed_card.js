/*
  One article card in the feed.

  A card shows the source, the category, the title and the summary, with two
  actions: "Read" opens the reader panel (reader/reader.js), "Summarize" opens
  the AI panel (ia_box/ia_box.js). A YouTube card also carries the player, or
  the "YouTube only" link when the owner refuses embedded playback.
*/

import { element } from "../global/dom.js";
import { categoryName } from "../global/library.js";
import { openReader } from "../reader/reader.js";
import { buildLink, buildVideo, videoIdFromEmbed } from "./video_player.js";


function isPlainLeftClick(event) {
  return (
    event.button === 0
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !event.altKey
  );
}

function cardImage(article) {
  const image = element("img", "feed_card_image");
  image.src = article.image_url;
  image.alt = "";
  image.loading = "lazy";
  return image;
}

function cardHeader(article) {
  const platform = element("span", "feed_card_platform");
  platform.textContent = `${article.platform || "Source"} · ${article.source_title || ""}`;

  const category = element("span", "feed_card_category", categoryName(article.category_id));

  const header = element("div", "feed_card_header");
  header.append(platform, category);
  return header;
}

function readLink(article, card, youtubeOnly) {
  const link = element("a", "feed_card_link");
  link.href = article.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const title = article.title || article.url;
  if (youtubeOnly) {
    link.textContent = "Watch on YouTube ↗";
    link.title = `${title} — plays on YouTube only`;
  } else {
    link.textContent = "Read";
    link.title = `${title} — read it here`;
  }

  link.addEventListener("click", (event) => {
    // A YouTube-only video just opens YouTube. Checked at click time, because
    // the player can discover the refusal after the card was drawn.
    if (card.classList.contains("is_youtube_only")) {
      return;
    }

    // Ctrl+click, middle click... keep the browser's "open in a new tab".
    if (!isPlainLeftClick(event)) {
      return;
    }

    event.preventDefault();
    openReader({
      url: article.url,
      title: article.title,
      outlet: article.source_title || article.platform,
      platform: article.platform,
      media_url: article.media_url,
      image_url: article.image_url,
      published_at: article.published_at,
      summary: article.summary,
    });
  });

  return link;
}

function summarizeButton(article) {
  const button = element("button", "feed_card_summarize", "Summarize");
  button.type = "button";

  // Read by the AI panel when the button is clicked.
  button.dataset.articleId = article.id;

  return button;
}

/** The card element for one article. */
export function createFeedCard(article) {
  const isYouTube = article.platform === "youtube" && Boolean(article.media_url);

  // embeddable is 0 once YouTube refused this video in an embedded player.
  const youtubeOnly = isYouTube && article.embeddable === 0;

  const card = element("article", "feed_card");
  card.classList.toggle("is_youtube", isYouTube);
  card.classList.toggle("is_youtube_only", youtubeOnly);
  if (article.image_url) {
    card.dataset.imageUrl = article.image_url;
  }

  if (article.image_url && !isYouTube) {
    card.append(cardImage(article));
  }

  const title = element("h2", "feed_card_title", article.title || "Untitled article");
  const summary = element("p", "feed_card_subtitle", article.summary || "No description available");

  const actions = element("div", "feed_card_actions");
  actions.append(readLink(article, card, youtubeOnly), summarizeButton(article));

  const content = element("div", "feed_card_content");
  content.append(cardHeader(article), title, summary, actions);
  card.append(content);

  if (youtubeOnly) {
    const videoId = videoIdFromEmbed(article.media_url);
    card.append(buildLink(videoId, article.title, article.image_url));
  } else if (isYouTube) {
    card.append(buildVideo(article));
  }

  return card;
}
