import { getDatabase, parseJsonColumn } from "./database.js";

const DEFAULT_PROFILE_ID = "default-profile";

function toNumber(value, fallbackValue = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}

function normalizeString(value, fallbackValue = "") {
  return String(value ?? fallbackValue).trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeHolding(input = {}, index = 0) {
  return {
    id: normalizeString(input.id, `holding-${index + 1}`),
    label: normalizeString(input.label || input.name, `Holding ${index + 1}`),
    ticker: normalizeString(input.ticker).toUpperCase(),
    category: normalizeString(input.category || input.assetType || "Other"),
    accountType: normalizeString(input.accountType || "Brokerage"),
    currentValue: Number(toNumber(input.currentValue, 0).toFixed(2)),
    costBasis: Number(toNumber(input.costBasis, 0).toFixed(2)),
    notes: normalizeString(input.notes)
  };
}

function normalizeLiability(input = {}, index = 0) {
  return {
    id: normalizeString(input.id, `liability-${index + 1}`),
    label: normalizeString(input.label || input.name, `Liability ${index + 1}`),
    category: normalizeString(input.category || "Loan"),
    balance: Number(toNumber(input.balance, 0).toFixed(2)),
    interestRate: Number(toNumber(input.interestRate, 0).toFixed(2)),
    monthlyPayment: Number(toNumber(input.monthlyPayment, 0).toFixed(2)),
    notes: normalizeString(input.notes)
  };
}

function normalizeRetirementProduct(input = {}, index = 0) {
  return {
    id: normalizeString(input.id, `retirement-${index + 1}`),
    label: normalizeString(input.label || input.name, `Retirement product ${index + 1}`),
    type: normalizeString(input.type || input.category || "Pension / Insurance"),
    provider: normalizeString(input.provider || input.insurer || ""),
    currentValue: Number(toNumber(input.currentValue, 0).toFixed(2)),
    monthlyContribution: Number(toNumber(input.monthlyContribution, 0).toFixed(2)),
    notes: normalizeString(input.notes)
  };
}

function normalizeDocument(input = {}, index = 0) {
  return {
    id: normalizeString(input.id, `document-${index + 1}`),
    name: normalizeString(input.name || input.fileName, `Document ${index + 1}`),
    category: normalizeString(input.category || "General"),
    sizeBytes: Math.max(0, Number(toNumber(input.sizeBytes, 0).toFixed(0))),
    lastModified: normalizeString(input.lastModified || ""),
    notes: normalizeString(input.notes)
  };
}

export function normalizeFinancialProfile(input = {}, existingProfile = {}) {
  return {
    id: DEFAULT_PROFILE_ID,
    updatedAt: normalizeString(input.updatedAt || existingProfile.updatedAt || new Date().toISOString()),
    investorName: normalizeString(input.investorName || existingProfile.investorName || "Operator"),
    riskTolerance: normalizeString(input.riskTolerance || existingProfile.riskTolerance || "Moderate"),
    investmentHorizon: normalizeString(input.investmentHorizon || existingProfile.investmentHorizon || "3-5 years"),
    liquidityNeeds: normalizeString(input.liquidityNeeds || existingProfile.liquidityNeeds || "Medium"),
    monthlyNetIncome: Number(toNumber(input.monthlyNetIncome ?? existingProfile.monthlyNetIncome, 0).toFixed(2)),
    monthlyExpenses: Number(toNumber(input.monthlyExpenses ?? existingProfile.monthlyExpenses, 0).toFixed(2)),
    emergencyFund: Number(toNumber(input.emergencyFund ?? existingProfile.emergencyFund, 0).toFixed(2)),
    targetEmergencyFundMonths: Number(
      toNumber(input.targetEmergencyFundMonths ?? existingProfile.targetEmergencyFundMonths, 6).toFixed(1)
    ),
    goals: normalizeStringArray(input.goals ?? existingProfile.goals),
    notes: normalizeString(input.notes ?? existingProfile.notes),
    holdings: (input.holdings ?? existingProfile.holdings ?? []).map((item, index) =>
      normalizeHolding(item, index)
    ),
    retirementProducts: (input.retirementProducts ?? existingProfile.retirementProducts ?? []).map((item, index) =>
      normalizeRetirementProduct(item, index)
    ),
    liabilities: (input.liabilities ?? existingProfile.liabilities ?? []).map((item, index) =>
      normalizeLiability(item, index)
    ),
    documents: (input.documents ?? existingProfile.documents ?? []).map((item, index) =>
      normalizeDocument(item, index)
    )
  };
}

function createDefaultProfile() {
  return normalizeFinancialProfile({
    investorName: "Operator",
    riskTolerance: "Moderate",
    investmentHorizon: "3-5 years",
    liquidityNeeds: "Medium",
    monthlyNetIncome: 0,
    monthlyExpenses: 0,
    emergencyFund: 0,
    targetEmergencyFundMonths: 6,
    goals: ["Preserve liquidity", "Compound long-term capital"],
    notes: "",
    holdings: [],
    retirementProducts: [],
    liabilities: [],
    documents: []
  });
}

function ensureProfileRow() {
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM financial_profiles WHERE id = ?").get(DEFAULT_PROFILE_ID);

  if (row) {
    return;
  }

  const profile = createDefaultProfile();
  db.prepare(
    `
      INSERT INTO financial_profiles(id, updated_at, payload)
      VALUES (?, ?, ?)
    `
  ).run(DEFAULT_PROFILE_ID, profile.updatedAt, JSON.stringify(profile));
}

export function readFinancialProfile() {
  ensureProfileRow();
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM financial_profiles WHERE id = ?").get(DEFAULT_PROFILE_ID);
  return normalizeFinancialProfile(parseJsonColumn(row?.payload, createDefaultProfile()));
}

export function updateFinancialProfile(input) {
  const currentProfile = readFinancialProfile();
  const nextProfile = normalizeFinancialProfile(
    {
      ...currentProfile,
      ...input,
      updatedAt: new Date().toISOString()
    },
    currentProfile
  );
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO financial_profiles(id, updated_at, payload)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `
  ).run(DEFAULT_PROFILE_ID, nextProfile.updatedAt, JSON.stringify(nextProfile));

  return nextProfile;
}
