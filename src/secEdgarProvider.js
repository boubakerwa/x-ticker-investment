const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_BASE_URL = "https://data.sec.gov/submissions";
const SEC_TIMEOUT_MS = Number(process.env.SEC_API_TIMEOUT_MS || 8000);
const SEC_TICKER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SEC_FILINGS_CACHE_TTL_MS = 15 * 60 * 1000;

const tickerCache = {
  loadedAt: 0,
  byTicker: new Map()
};

const filingsCache = new Map();

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeString(value, fallbackValue = "") {
  return String(value ?? fallbackValue).trim();
}

function buildSecHeaders() {
  const userAgent = normalizeString(
    process.env.SEC_API_USER_AGENT || "x-ticker-investment/0.1 open-source-project"
  );

  return {
    Accept: "application/json",
    "User-Agent": userAgent
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: buildSecHeaders(),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      throw new Error(`SEC request failed with ${response.status}.`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function buildTickerEntry(rawEntry = {}) {
  const ticker = normalizeTicker(rawEntry.ticker);
  const cikNumber = Number(rawEntry.cik_str);

  if (!ticker || !Number.isFinite(cikNumber)) {
    return null;
  }

  return {
    ticker,
    title: normalizeString(rawEntry.title),
    cik: String(Math.trunc(cikNumber)),
    cikPadded: String(Math.trunc(cikNumber)).padStart(10, "0")
  };
}

async function loadTickerMap() {
  const now = Date.now();

  if (
    tickerCache.byTicker.size &&
    now - tickerCache.loadedAt < SEC_TICKER_CACHE_TTL_MS
  ) {
    return tickerCache.byTicker;
  }

  const payload = await fetchJson(SEC_TICKER_MAP_URL);
  const nextMap = new Map();

  for (const entry of Object.values(payload || {})) {
    const tickerEntry = buildTickerEntry(entry);

    if (tickerEntry) {
      nextMap.set(tickerEntry.ticker, tickerEntry);
    }
  }

  tickerCache.loadedAt = now;
  tickerCache.byTicker = nextMap;
  return tickerCache.byTicker;
}

function buildFilingUrl(cik, accessionNumber, primaryDocument) {
  const cleanAccession = normalizeString(accessionNumber).replace(/-/g, "");
  const cleanDocument = normalizeString(primaryDocument);

  if (!cik || !cleanAccession || !cleanDocument) {
    return "";
  }

  return `https://www.sec.gov/Archives/edgar/data/${cik}/${cleanAccession}/${cleanDocument}`;
}

function buildRecentFilings(payload, { forms = [], limit = 8 } = {}) {
  const recent = payload?.filings?.recent || {};
  const formsFilter = new Set(
    (Array.isArray(forms) ? forms : [])
      .map((item) => normalizeString(item).toUpperCase())
      .filter(Boolean)
  );
  const itemCount = Math.max(
    0,
    recent.form?.length || 0,
    recent.filingDate?.length || 0,
    recent.accessionNumber?.length || 0
  );
  const filings = [];

  for (let index = 0; index < itemCount; index += 1) {
    const form = normalizeString(recent.form?.[index]).toUpperCase();

    if (formsFilter.size && !formsFilter.has(form)) {
      continue;
    }

    const accessionNumber = normalizeString(recent.accessionNumber?.[index]);
    const filingDate = normalizeString(recent.filingDate?.[index]);
    const acceptanceDateTime = normalizeString(recent.acceptanceDateTime?.[index]);
    const primaryDocument = normalizeString(recent.primaryDocument?.[index]);
    const primaryDocDescription = normalizeString(recent.primaryDocDescription?.[index]);
    const reportDate = normalizeString(recent.reportDate?.[index]);

    filings.push({
      accessionNumber,
      form,
      filingDate,
      acceptanceDateTime,
      reportDate,
      primaryDocument,
      primaryDocDescription,
      isInlineXBRL: Boolean(recent.isInlineXBRL?.[index]),
      isXBRL: Boolean(recent.isXBRL?.[index])
    });
  }

  return filings.slice(0, limit);
}

export async function getRecentSecFilings({
  ticker,
  forms = ["8-K", "10-Q", "10-K", "6-K", "20-F"],
  limit = 8
} = {}) {
  const cleanTicker = normalizeTicker(ticker);

  if (!cleanTicker) {
    throw new Error("Ticker is required for SEC EDGAR lookup.");
  }

  const cacheKey = JSON.stringify({
    ticker: cleanTicker,
    forms: [...forms].sort(),
    limit
  });
  const cachedEntry = filingsCache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.loadedAt < SEC_FILINGS_CACHE_TTL_MS) {
    return cachedEntry.value;
  }

  const tickerMap = await loadTickerMap();
  const company = tickerMap.get(cleanTicker);

  if (!company) {
    return {
      available: true,
      supported: false,
      ticker: cleanTicker,
      filings: [],
      note: "No SEC ticker mapping was found for this asset."
    };
  }

  const payload = await fetchJson(
    `${SEC_SUBMISSIONS_BASE_URL}/CIK${company.cikPadded}.json`
  );
  const filings = buildRecentFilings(payload, {
    forms,
    limit
  }).map((filing) => ({
    ...filing,
    url: buildFilingUrl(company.cik, filing.accessionNumber, filing.primaryDocument)
  }));
  const result = {
    available: true,
    supported: true,
    ticker: cleanTicker,
    companyName: company.title,
    cik: company.cikPadded,
    forms,
    filings,
    loadedAt: new Date().toISOString(),
    note: filings.length
      ? "Official SEC filings are high-trust evidence. Use them to validate or contradict narrative claims."
      : "No recent filings matched the selected forms."
  };

  filingsCache.set(cacheKey, {
    loadedAt: Date.now(),
    value: result
  });
  return result;
}
