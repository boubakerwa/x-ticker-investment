const X_STATUS_URL_PATTERN =
  /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/\s]+\/status\/(\d+)(?:\?[^\s]*)?/i;
const HTML_ENTITY_REPLACEMENTS = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'"
};

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "").replace(
    /&(amp|lt|gt|quot|#39);/g,
    (match) => HTML_ENTITY_REPLACEMENTS[match] || match
  );
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "));
}

function normalizeUrlToken(value) {
  return String(value || "").trim().replace(/[),.!?]+$/, "");
}

function replaceEntityUrls(text, entities = {}) {
  let nextText = String(text || "");

  for (const entity of entities.urls || []) {
    const token = String(entity?.url || "").trim();
    const expandedUrl = String(entity?.expanded_url || entity?.url || "").trim();

    if (!token) {
      continue;
    }

    nextText = nextText.replaceAll(token, expandedUrl || "");
  }

  for (const entity of entities.media || []) {
    const token = String(entity?.url || "").trim();

    if (!token) {
      continue;
    }

    nextText = nextText.replaceAll(token, "");
  }

  return normalizeWhitespace(nextText);
}

function normalizeLinks(entities = {}) {
  return (entities.urls || [])
    .map((entity) => ({
      displayUrl: String(entity?.display_url || "").trim(),
      expandedUrl: String(entity?.expanded_url || entity?.url || "").trim()
    }))
    .filter((entity) => entity.expandedUrl);
}

function normalizeMedia(payload = {}) {
  const mediaDetails = Array.isArray(payload.mediaDetails) ? payload.mediaDetails : [];
  const photos = Array.isArray(payload.photos) ? payload.photos : [];
  const mediaItems = mediaDetails.length ? mediaDetails : photos;

  return mediaItems
    .map((item) => {
      const videoVariant = Array.isArray(item?.video_info?.variants)
        ? item.video_info.variants.find((variant) => String(variant?.content_type || "") === "video/mp4")
        : null;
      const normalizedType = String(
        item?.type || (item?.video_info ? "video" : item?.media_url_https ? "photo" : "")
      ).trim();

      return {
        type: normalizedType || "media",
        expandedUrl: String(item?.expanded_url || "").trim(),
        previewUrl: String(item?.media_url_https || item?.poster || "").trim(),
        assetUrl: String(videoVariant?.url || item?.media_url_https || "").trim(),
        width: Number(item?.original_info?.width || item?.sizes?.large?.w || 0),
        height: Number(item?.original_info?.height || item?.sizes?.large?.h || 0)
      };
    })
    .filter((item) => item.previewUrl || item.assetUrl || item.expandedUrl);
}

async function requestJson(url, errorMessage) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error(errorMessage);
  }

  return payload;
}

function buildAuthorHandle(url) {
  const match = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([^/]+)\/status\//i.exec(String(url || ""));
  return match?.[1] ? `@${match[1]}` : "";
}

function buildSyndicationSource(payload, xUrl) {
  const canonicalUrl = `https://x.com/${payload?.user?.screen_name || buildAuthorHandle(xUrl).replace(/^@/, "")}/status/${payload?.id_str}`;

  return {
    type: "x-post",
    xUrl: normalizeUrlToken(xUrl),
    canonicalUrl,
    postId: String(payload?.id_str || "").trim(),
    extractionMethod: "syndication",
    authorName: String(payload?.user?.name || "").trim(),
    authorHandle: payload?.user?.screen_name ? `@${payload.user.screen_name}` : buildAuthorHandle(xUrl),
    createdAt: String(payload?.created_at || "").trim(),
    text: replaceEntityUrls(payload?.text || "", payload?.entities || {}),
    links: normalizeLinks(payload?.entities || {}),
    media: normalizeMedia(payload),
    mediaSummary: buildMediaSummary(normalizeMedia(payload))
  };
}

function buildMediaSummary(media = []) {
  if (!media.length) {
    return "No media attached";
  }

  const counts = media.reduce((summary, item) => {
    const type = String(item?.type || "media").toLowerCase().replaceAll("_", " ");
    summary[type] = (summary[type] || 0) + 1;
    return summary;
  }, {});
  const parts = Object.entries(counts).map(([type, count]) => `${count} ${type}${count === 1 ? "" : "s"}`);

  return parts.join(", ");
}

function extractTextFromOEmbedHtml(html) {
  const paragraphMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(String(html || ""));
  return normalizeWhitespace(stripHtml(paragraphMatch?.[1] || ""));
}

function buildOEmbedSource(payload, xUrl) {
  return {
    type: "x-post",
    xUrl: normalizeUrlToken(xUrl),
    canonicalUrl: String(payload?.url || normalizeUrlToken(xUrl)).trim(),
    postId: extractXPostId(xUrl),
    extractionMethod: "oembed",
    authorName: String(payload?.author_name || "").trim(),
    authorHandle: buildAuthorHandle(payload?.url || xUrl),
    createdAt: "",
    text: extractTextFromOEmbedHtml(payload?.html || ""),
    links: [],
    media: [],
    mediaSummary: "Media preview unavailable"
  };
}

export function extractFirstXPostUrl(value) {
  const match = X_STATUS_URL_PATTERN.exec(String(value || ""));
  return match ? normalizeUrlToken(match[0]) : "";
}

export function extractXPostId(value) {
  const match = X_STATUS_URL_PATTERN.exec(String(value || ""));
  return match?.[1] ? String(match[1]).trim() : "";
}

export async function resolveXPost(xUrl) {
  const normalizedUrl = normalizeUrlToken(xUrl);
  const postId = extractXPostId(normalizedUrl);

  if (!postId) {
    const error = new Error("Paste a valid X post URL with /status/{id}.");
    error.statusCode = 400;
    throw error;
  }

  try {
    const payload = await requestJson(
      `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(postId)}&token=x`,
      "Public X parsing failed for this post."
    );

    return buildSyndicationSource(payload, normalizedUrl);
  } catch (syndicationError) {
    const oEmbedPayload = await requestJson(
      `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(normalizedUrl)}`,
      "Public X parsing failed for this post."
    );
    const source = buildOEmbedSource(oEmbedPayload, normalizedUrl);

    if (!source.text) {
      const error = new Error(
        "This X post could not be parsed automatically. Paste the post text manually to continue."
      );
      error.statusCode = 400;
      throw error;
    }

    return source;
  }
}

export { buildMediaSummary };
