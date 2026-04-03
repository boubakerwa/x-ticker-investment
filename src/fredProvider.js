const FRED_API_BASE_URL = "https://api.stlouisfed.org/fred";
const FRED_TIMEOUT_MS = Number(process.env.FRED_API_TIMEOUT_MS || 8000);
const FRED_SERIES_CACHE_TTL_MS = 15 * 60 * 1000;

const seriesCache = new Map();

const FRED_SERIES_PRESETS = {
  general: [
    { id: "DGS10", label: "US 10Y Treasury", unit: "yield" },
    { id: "DGS2", label: "US 2Y Treasury", unit: "yield" },
    { id: "T10Y2Y", label: "10Y minus 2Y", unit: "spread" },
    { id: "VIXCLS", label: "VIX", unit: "volatility" }
  ],
  crypto: [
    { id: "DGS10", label: "US 10Y Treasury", unit: "yield" },
    { id: "DGS2", label: "US 2Y Treasury", unit: "yield" },
    { id: "VIXCLS", label: "VIX", unit: "volatility" },
    { id: "NFCI", label: "Chicago Fed NFCI", unit: "financial-conditions" }
  ]
};

function normalizeString(value, fallbackValue = "") {
  return String(value ?? fallbackValue).trim();
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function getFredApiKey() {
  return normalizeString(process.env.FRED_API_KEY || "");
}

function getSeriesPreset(asset = null) {
  return asset?.ticker === "BTC" ? FRED_SERIES_PRESETS.crypto : FRED_SERIES_PRESETS.general;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FRED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      throw new Error(`FRED request failed with ${response.status}.`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function buildSeriesUrl(seriesId, apiKey) {
  const url = new URL(`${FRED_API_BASE_URL}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "4");
  return url.toString();
}

function parseObservationValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

async function getFredSeriesSummary(seriesConfig) {
  const apiKey = getFredApiKey();

  if (!apiKey) {
    throw new Error("FRED_API_KEY is not configured.");
  }

  const cacheKey = seriesConfig.id;
  const cachedEntry = seriesCache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.loadedAt < FRED_SERIES_CACHE_TTL_MS) {
    return cachedEntry.value;
  }

  const payload = await fetchJson(buildSeriesUrl(seriesConfig.id, apiKey));
  const observations = Array.isArray(payload?.observations) ? payload.observations : [];
  const usableObservations = observations
    .map((item) => ({
      date: normalizeString(item.date),
      value: parseObservationValue(item.value)
    }))
    .filter((item) => item.value != null);
  const latest = usableObservations[0] || null;
  const previous = usableObservations[1] || null;
  const value = latest?.value ?? null;
  const previousValue = previous?.value ?? null;
  const delta =
    value != null && previousValue != null ? round(value - previousValue, 3) : null;
  const summary = {
    id: seriesConfig.id,
    label: seriesConfig.label,
    unit: seriesConfig.unit,
    latestValue: value,
    previousValue,
    delta,
    date: latest?.date || ""
  };

  seriesCache.set(cacheKey, {
    loadedAt: Date.now(),
    value: summary
  });
  return summary;
}

export async function getFredMacroPreview(asset = null) {
  const apiKey = getFredApiKey();

  if (!apiKey) {
    return {
      available: false,
      configured: false,
      series: [],
      note: "Set FRED_API_KEY to enable the free macro regime overlay."
    };
  }

  const preset = getSeriesPreset(asset);
  const results = await Promise.allSettled(preset.map((seriesConfig) => getFredSeriesSummary(seriesConfig)));
  const series = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => String(result.reason?.message || result.reason || "FRED lookup failed."));

  return {
    available: true,
    configured: true,
    series,
    loadedAt: new Date().toISOString(),
    note: errors.length
      ? errors[0]
      : "FRED is a macro overlay only. It should tune conviction and sizing, not originate single-name ideas."
  };
}
