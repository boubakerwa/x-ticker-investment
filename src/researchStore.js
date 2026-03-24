import { getDatabase, parseJsonColumn } from "./database.js";

export const RESEARCH_DOSSIER_STORE_VERSION = 1;
export const RESEARCH_DOSSIER_STATUSES = [
  "discovery",
  "candidate",
  "validated",
  "approved",
  "dismissed",
  "expired",
  "archived"
];

const DEFAULT_RESEARCH_STATUS = "discovery";

function normalizeString(value, fallbackValue = "") {
  return String(value ?? fallbackValue).trim();
}

function normalizeStringArray(value, { uppercase = false } = {}) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : value && typeof value === "object"
        ? [value]
        : [];

  const normalizedItems = items
    .map((item) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        const nextValue = String(item).trim();
        return uppercase ? nextValue.toUpperCase() : nextValue;
      }

      if (item && typeof item === "object") {
        const nextValue = normalizeString(item.value || item.label || item.name || item.title || item.id);
        return uppercase ? nextValue.toUpperCase() : nextValue;
      }

      return "";
    })
    .filter(Boolean);

  return [...new Set(normalizedItems)];
}

function normalizeScore(value, fallbackValue = 0.5) {
  if (value === "" || value == null) {
    return Number(fallbackValue.toFixed(2));
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return Number(fallbackValue.toFixed(2));
  }

  const scaledValue = numericValue > 1 && numericValue <= 100 ? numericValue / 100 : numericValue;
  return Number(Math.min(1, Math.max(0, scaledValue)).toFixed(2));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStatus(value, fallbackValue = DEFAULT_RESEARCH_STATUS) {
  const normalizedValue = String(value || fallbackValue)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (RESEARCH_DOSSIER_STATUSES.includes(normalizedValue)) {
    return normalizedValue;
  }

  if (
    normalizedValue === "draft" ||
    normalizedValue === "intake" ||
    normalizedValue === "captured" ||
    normalizedValue === "new"
  ) {
    return "discovery";
  }

  if (
    normalizedValue === "in_review" ||
    normalizedValue === "review" ||
    normalizedValue === "reviewing"
  ) {
    return "candidate";
  }

  if (normalizedValue === "ready" || normalizedValue === "active") {
    return "validated";
  }

  if (normalizedValue === "rejected" || normalizedValue === "rejection") {
    return "dismissed";
  }

  if (normalizedValue === "stale") {
    return "expired";
  }

  return fallbackValue;
}

function normalizeEvidenceItem(input = {}, index = 0) {
  const summary = normalizeString(
    input.summary || input.text || input.label || input.title || input.note || input.value
  );

  return {
    id: normalizeString(input.id, `evidence-${index + 1}`),
    label: normalizeString(input.label || input.title || summary || `Evidence ${index + 1}`),
    summary,
    source: normalizeString(input.source || input.sourceName || input.publisher || input.origin),
    url: normalizeString(input.url || input.href),
    publishedAt: normalizeString(input.publishedAt || input.date || input.published || ""),
    capturedAt: normalizeString(input.capturedAt || input.createdAt || ""),
    weight: normalizeScore(input.weight, 0.5),
    note: normalizeString(input.note || input.notes)
  };
}

function normalizeCitation(input = {}, index = 0) {
  const summary = normalizeString(input.summary || input.text || input.label || input.title || input.note);

  return {
    id: normalizeString(input.id, `citation-${index + 1}`),
    label: normalizeString(input.label || input.title || summary || `Citation ${index + 1}`),
    summary,
    source: normalizeString(input.source || input.sourceName || input.publisher || input.origin),
    url: normalizeString(input.url || input.href),
    publishedAt: normalizeString(input.publishedAt || input.date || input.published || ""),
    capturedAt: normalizeString(input.capturedAt || input.createdAt || ""),
    note: normalizeString(input.note || input.notes)
  };
}

function normalizeEvidenceList(value, normalizer) {
  if (Array.isArray(value)) {
    return value
      .map((item, index) =>
        normalizer(
          item && typeof item === "object" ? item : { summary: String(item || "").trim() },
          index
        )
      )
      .filter((item) => item.summary || item.label);
  }

  if (value && typeof value === "object") {
    const item = normalizer(value, 0);
    return item.summary || item.label ? [item] : [];
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item, index) => normalizer({ summary: item }, index))
      .filter((item) => item.summary || item.label);
  }

  return [];
}

function getResearchStatusRank(status) {
  const rank = {
    approved: 6,
    validated: 5,
    candidate: 4,
    discovery: 3,
    dismissed: 2,
    expired: 1,
    archived: 0
  };

  return rank[normalizeStatus(status)] ?? -1;
}

function compareResearchDossiers(left, right) {
  const rankDifference =
    getResearchStatusRank(right?.status) - getResearchStatusRank(left?.status);

  if (rankDifference !== 0) {
    return rankDifference;
  }

  return String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || ""));
}

function buildResearchDossierId(title) {
  const slug = slugify(title) || "dossier";
  return `research-${slug}-${Date.now().toString(36)}`;
}

function persistResearchDossier(dossier) {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO research_dossiers(id, created_at, updated_at, title, theme, status, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        title = excluded.title,
        theme = excluded.theme,
        status = excluded.status,
        payload = excluded.payload
    `
  ).run(
    dossier.id,
    dossier.createdAt,
    dossier.updatedAt,
    dossier.title,
    dossier.theme,
    dossier.status,
    JSON.stringify(dossier)
  );
}

function removeResearchDossier(id) {
  const db = getDatabase();
  db.prepare("DELETE FROM research_dossiers WHERE id = ?").run(id);
}

function mapRowToDossier(row) {
  const payload = parseJsonColumn(row.payload, {});
  return normalizeResearchDossier(payload, {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    theme: row.theme,
    status: row.status
  });
}

function validateLifecycleTransition(currentDossier, nextDossier) {
  const nextStatus = normalizeStatus(nextDossier.status);

  if (nextStatus !== "validated" && nextStatus !== "approved") {
    return;
  }

  const missingFields = [];

  if (!nextDossier.thesis) {
    missingFields.push("thesis");
  }

  if (!nextDossier.theme) {
    missingFields.push("theme");
  }

  if (!nextDossier.horizon) {
    missingFields.push("horizon");
  }

  if (!nextDossier.assets.length) {
    missingFields.push("assets");
  }

  if (!nextDossier.supportingEvidence.length) {
    missingFields.push("supporting evidence");
  }

  if (!nextDossier.contradictingEvidence.length) {
    missingFields.push("contradicting evidence");
  }

  if (!nextDossier.citations.length) {
    missingFields.push("citations");
  }

  if (missingFields.length) {
    throw new Error(
      `Complete the dossier before promoting it: ${missingFields.join(", ")}.`
    );
  }

  if (
    nextStatus === "approved" &&
    (!currentDossier ||
      !["validated", "approved"].includes(normalizeStatus(currentDossier.status)))
  ) {
    throw new Error("Validate the dossier before approving it.");
  }
}

function buildThemeScorecards(dossiers) {
  const themeMap = new Map();

  for (const dossier of dossiers) {
    const themeKey = dossier.theme || "General";
    const bucket = themeMap.get(themeKey) || {
      title: `Theme: ${themeKey}`,
      theme: themeKey,
      sourceQualityTotal: 0,
      timelinessTotal: 0,
      count: 0,
      supportingEvidenceCount: 0,
      contradictingEvidenceCount: 0,
      approvedCount: 0
    };

    bucket.sourceQualityTotal += dossier.sourceQualityScore || 0;
    bucket.timelinessTotal += dossier.timelinessScore || 0;
    bucket.count += 1;
    bucket.supportingEvidenceCount += dossier.supportingEvidence.length;
    bucket.contradictingEvidenceCount += dossier.contradictingEvidence.length;
    bucket.approvedCount += dossier.status === "approved" ? 1 : 0;
    themeMap.set(themeKey, bucket);
  }

  return [...themeMap.values()]
    .map((bucket) => ({
      type: "theme",
      title: bucket.title,
      theme: bucket.theme,
      score: Number(
        (((bucket.sourceQualityTotal / bucket.count) + (bucket.timelinessTotal / bucket.count)) / 2).toFixed(2)
      ),
      supportingEvidenceCount: bucket.supportingEvidenceCount,
      contradictingEvidenceCount: bucket.contradictingEvidenceCount,
      summary: `${bucket.count} dossiers tracked in ${bucket.theme}; ${bucket.approvedCount} already approved for downstream actioning.`
    }))
    .sort((left, right) => right.score - left.score);
}

function buildSourceScorecards(dossiers) {
  const sourceMap = new Map();

  for (const dossier of dossiers) {
    const evidenceEntries = [
      ...dossier.supportingEvidence.map((item) => ({ ...item, polarity: "supporting" })),
      ...dossier.contradictingEvidence.map((item) => ({ ...item, polarity: "contradicting" })),
      ...dossier.citations.map((item) => ({ ...item, polarity: "citation" }))
    ];

    for (const item of evidenceEntries) {
      const sourceKey = normalizeString(item.source || item.label || item.summary || "Unattributed source");
      const bucket = sourceMap.get(sourceKey) || {
        title: `Source: ${sourceKey}`,
        source: sourceKey,
        weightTotal: 0,
        count: 0,
        supportingEvidenceCount: 0,
        contradictingEvidenceCount: 0,
        dossierCount: 0,
        dossierIds: new Set()
      };

      bucket.weightTotal += item.weight || 0.5;
      bucket.count += 1;
      bucket.supportingEvidenceCount += item.polarity === "supporting" ? 1 : 0;
      bucket.contradictingEvidenceCount += item.polarity === "contradicting" ? 1 : 0;
      bucket.dossierIds.add(dossier.id);
      bucket.dossierCount = bucket.dossierIds.size;
      sourceMap.set(sourceKey, bucket);
    }
  }

  return [...sourceMap.values()]
    .map((bucket) => ({
      type: "source",
      title: bucket.title,
      source: bucket.source,
      score: Number((bucket.weightTotal / Math.max(bucket.count, 1)).toFixed(2)),
      supportingEvidenceCount: bucket.supportingEvidenceCount,
      contradictingEvidenceCount: bucket.contradictingEvidenceCount,
      summary: `${bucket.dossierCount} dossiers reference this source across the current research set.`
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.supportingEvidenceCount - left.supportingEvidenceCount;
    });
}

export function normalizeResearchDossier(input = {}, existingDossier = {}) {
  const title = normalizeString(input.title ?? existingDossier.title) || "Untitled research dossier";
  const theme = normalizeString(input.theme ?? existingDossier.theme) || "General";
  const createdAt =
    normalizeString(input.createdAt ?? existingDossier.createdAt) || new Date().toISOString();
  const updatedAt = normalizeString(input.updatedAt ?? existingDossier.updatedAt) || createdAt;
  const assets = normalizeStringArray(input.assets ?? input.asset ?? existingDossier.assets, {
    uppercase: true
  });
  const linkedClusterIds = normalizeStringArray(
    input.linkedClusterIds ?? input.clusterIds ?? existingDossier.linkedClusterIds
  );
  const riskFactors = normalizeStringArray(input.riskFactors ?? existingDossier.riskFactors);
  const supportingEvidence = normalizeEvidenceList(
    input.supportingEvidence ?? existingDossier.supportingEvidence,
    normalizeEvidenceItem
  );
  const contradictingEvidence = normalizeEvidenceList(
    input.contradictingEvidence ?? existingDossier.contradictingEvidence,
    normalizeEvidenceItem
  );
  const citations = normalizeEvidenceList(
    input.citations ?? existingDossier.citations,
    normalizeCitation
  );

  return {
    id: normalizeString(input.id ?? existingDossier.id),
    createdAt,
    updatedAt,
    title,
    theme,
    assets,
    thesis: normalizeString(input.thesis ?? existingDossier.thesis),
    summary: normalizeString(input.summary ?? existingDossier.summary),
    horizon: normalizeString(input.horizon ?? input.timeHorizon ?? existingDossier.horizon),
    supportingEvidence,
    contradictingEvidence,
    sourceQualityScore: normalizeScore(
      input.sourceQualityScore ?? existingDossier.sourceQualityScore,
      supportingEvidence.length || citations.length ? 0.65 : 0.5
    ),
    timelinessScore: normalizeScore(
      input.timelinessScore ?? existingDossier.timelinessScore,
      supportingEvidence.length ? 0.6 : 0.5
    ),
    edgeHypothesis: normalizeString(input.edgeHypothesis ?? existingDossier.edgeHypothesis),
    riskFactors,
    status: normalizeStatus(input.status ?? existingDossier.status),
    linkedClusterIds,
    citations,
    lastValidatedAt: normalizeString(input.lastValidatedAt ?? existingDossier.lastValidatedAt),
    lastApprovedAt: normalizeString(input.lastApprovedAt ?? existingDossier.lastApprovedAt)
  };
}

export function readResearchStore() {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT id, created_at, updated_at, title, theme, status, payload
        FROM research_dossiers
        ORDER BY updated_at DESC, created_at DESC, title COLLATE NOCASE ASC
      `
    )
    .all();

  const dossiers = rows.map((row) => mapRowToDossier(row));

  return {
    version: RESEARCH_DOSSIER_STORE_VERSION,
    updatedAt: dossiers[0]?.updatedAt || new Date().toISOString(),
    dossiers
  };
}

export function listResearchDossiers(options = {}) {
  const store = readResearchStore();
  const statusFilter = normalizeStringArray(options.status)
    .map((item) => normalizeStatus(item))
    .filter((item) => RESEARCH_DOSSIER_STATUSES.includes(item));
  const themeFilter = normalizeStringArray(options.theme);
  const assetFilter = normalizeStringArray(options.asset, { uppercase: true });
  const clusterFilter = normalizeStringArray(options.clusterId || options.linkedClusterId);
  const searchValue = normalizeString(options.search).toLowerCase();

  let dossiers = store.dossiers;

  if (statusFilter.length) {
    dossiers = dossiers.filter((dossier) => statusFilter.includes(dossier.status));
  }

  if (themeFilter.length) {
    const normalizedThemes = themeFilter.map((item) => item.toLowerCase());
    dossiers = dossiers.filter((dossier) => normalizedThemes.includes(dossier.theme.toLowerCase()));
  }

  if (assetFilter.length) {
    dossiers = dossiers.filter((dossier) =>
      dossier.assets.some((asset) => assetFilter.includes(asset.toUpperCase()))
    );
  }

  if (clusterFilter.length) {
    dossiers = dossiers.filter((dossier) =>
      dossier.linkedClusterIds.some((clusterId) => clusterFilter.includes(clusterId))
    );
  }

  if (searchValue) {
    dossiers = dossiers.filter((dossier) => {
      const haystack = [
        dossier.title,
        dossier.theme,
        dossier.thesis,
        dossier.summary,
        dossier.edgeHypothesis,
        dossier.horizon,
        dossier.assets.join(" "),
        dossier.riskFactors.join(" "),
        dossier.linkedClusterIds.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchValue);
    });
  }

  const limit = Number(options.limit);

  if (Number.isFinite(limit) && limit >= 0) {
    dossiers = dossiers.slice(0, limit);
  }

  return dossiers.sort(compareResearchDossiers);
}

export function getResearchDossier(id) {
  const dossierId = normalizeString(id);

  if (!dossierId) {
    return null;
  }

  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT id, created_at, updated_at, title, theme, status, payload
        FROM research_dossiers
        WHERE id = ?
      `
    )
    .get(dossierId);

  return row ? mapRowToDossier(row) : null;
}

export function createResearchDossier(input = {}) {
  const normalizedInput = normalizeResearchDossier(input, {
    status: DEFAULT_RESEARCH_STATUS
  });
  const now = new Date().toISOString();
  const id = normalizeString(normalizedInput.id) || buildResearchDossierId(normalizedInput.title);
  const existing = getResearchDossier(id);

  if (existing) {
    throw new Error("A research dossier with that id already exists.");
  }

  const nextDossier = normalizeResearchDossier({
    ...normalizedInput,
    id,
    createdAt: normalizedInput.createdAt || now,
    updatedAt: now
  });

  validateLifecycleTransition(null, nextDossier);
  persistResearchDossier(nextDossier);
  return nextDossier;
}

export function updateResearchDossier(id, input = {}) {
  const currentDossier = getResearchDossier(id);

  if (!currentDossier) {
    throw new Error("Research dossier not found.");
  }

  const nextStatus = normalizeStatus(input.status ?? currentDossier.status);
  const now = new Date().toISOString();
  const nextDossier = normalizeResearchDossier(
    {
      ...currentDossier,
      ...input,
      id: currentDossier.id,
      createdAt: currentDossier.createdAt,
      updatedAt: now,
      lastValidatedAt:
        nextStatus === "validated" || nextStatus === "approved"
          ? currentDossier.lastValidatedAt || now
          : currentDossier.lastValidatedAt,
      lastApprovedAt:
        nextStatus === "approved" ? now : nextStatus === "dismissed" ? "" : currentDossier.lastApprovedAt
    },
    currentDossier
  );

  validateLifecycleTransition(currentDossier, nextDossier);
  persistResearchDossier(nextDossier);
  return nextDossier;
}

export function deleteResearchDossier(id) {
  const currentDossier = getResearchDossier(id);

  if (!currentDossier) {
    throw new Error("Research dossier not found.");
  }

  removeResearchDossier(currentDossier.id);
  return currentDossier;
}

export function setResearchDossierStatus(id, status) {
  return updateResearchDossier(id, { status });
}

export function buildResearchSummary(dossiers = listResearchDossiers()) {
  const totals = dossiers.reduce(
    (accumulator, dossier) => {
      accumulator.totalCount += 1;
      accumulator.sourceQualityTotal += dossier.sourceQualityScore || 0;
      accumulator.timelinessTotal += dossier.timelinessScore || 0;

      if (accumulator[`${dossier.status}Count`] != null) {
        accumulator[`${dossier.status}Count`] += 1;
      }

      if (!["dismissed", "expired", "archived"].includes(dossier.status) && dossier.theme) {
        accumulator.activeThemes.add(dossier.theme);
      }

      return accumulator;
    },
    {
      totalCount: 0,
      discoveryCount: 0,
      candidateCount: 0,
      validatedCount: 0,
      approvedCount: 0,
      dismissedCount: 0,
      expiredCount: 0,
      archivedCount: 0,
      sourceQualityTotal: 0,
      timelinessTotal: 0,
      activeThemes: new Set()
    }
  );

  return {
    totalCount: totals.totalCount,
    dossierCount: totals.totalCount,
    discoveryCount: totals.discoveryCount,
    candidateCount: totals.candidateCount,
    validatedCount: totals.validatedCount,
    approvedCount: totals.approvedCount,
    dismissedCount: totals.dismissedCount,
    expiredCount: totals.expiredCount,
    archivedCount: totals.archivedCount,
    activeThemeCount: totals.activeThemes.size,
    averageSourceQualityScore: totals.totalCount
      ? Number((totals.sourceQualityTotal / totals.totalCount).toFixed(2))
      : 0,
    averageTimelinessScore: totals.totalCount
      ? Number((totals.timelinessTotal / totals.totalCount).toFixed(2))
      : 0,
    nextDossierId: "",
    latestUpdatedAt: dossiers[0]?.updatedAt || ""
  };
}

export function buildResearchScorecards(dossiers = listResearchDossiers()) {
  const themeScorecards = buildThemeScorecards(dossiers);
  const sourceScorecards = buildSourceScorecards(dossiers).slice(0, 6);
  return [...themeScorecards, ...sourceScorecards].slice(0, 10);
}

export function buildResearchDashboardState(options = {}) {
  const dossiers = listResearchDossiers(options);
  const summary = buildResearchSummary(dossiers);
  const scorecards = buildResearchScorecards(dossiers);

  return {
    summary,
    dossiers,
    scorecards,
    inbox: dossiers.filter((dossier) => ["discovery", "candidate"].includes(dossier.status)).slice(0, 12),
    statusOptions: RESEARCH_DOSSIER_STATUSES
  };
}
