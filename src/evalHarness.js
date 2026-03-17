import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildHeuristicPostAnalysis,
  buildNormalizedPostAnalysis
} from "./agenticEngine.js";
import { extractClaimsForPosts } from "./modelClaimExtractor.js";
import { persistEvalRun, readEvalStore } from "./evalStore.js";
import { readSourceStore } from "./sourceStore.js";

const SUITE_PATH = fileURLToPath(new URL("../data/eval-suite.json", import.meta.url));

function readEvalSuite() {
  if (!existsSync(SUITE_PATH)) {
    throw new Error("Eval suite file is missing.");
  }

  const parsedSuite = JSON.parse(readFileSync(SUITE_PATH, "utf8"));

  if (!parsedSuite || !Array.isArray(parsedSuite.cases)) {
    throw new Error("Eval suite file is invalid.");
  }

  return parsedSuite;
}

function arraysEqual(left, right) {
  const normalizedLeft = [...new Set((left || []).map((item) => String(item).trim()).filter(Boolean))].sort();
  const normalizedRight = [...new Set((right || []).map((item) => String(item).trim()).filter(Boolean))].sort();

  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function compareField(expectedValue, actualValue) {
  if (Array.isArray(expectedValue)) {
    return arraysEqual(expectedValue, actualValue);
  }

  return expectedValue === actualValue;
}

function buildRunId() {
  return `eval-${Date.now()}`;
}

function round(value) {
  return Number(value.toFixed(3));
}

function buildDelta(currentValue, previousValue) {
  if (typeof previousValue !== "number") {
    return null;
  }

  return round(currentValue - previousValue);
}

function buildGate(summary, suite) {
  const gates = suite.gates || {};
  const minimumAverageScore = Number(gates.minimumAverageScore ?? 0);
  const minimumExactMatchRate = Number(gates.minimumExactMatchRate ?? 0);
  const minimumPerFieldAccuracy = gates.minimumPerFieldAccuracy || {};
  const failures = [];

  if (summary.averageScore < minimumAverageScore) {
    failures.push(
      `Average score ${summary.averageScore} is below the gate ${minimumAverageScore}.`
    );
  }

  if (summary.exactMatchRate < minimumExactMatchRate) {
    failures.push(
      `Exact match rate ${summary.exactMatchRate} is below the gate ${minimumExactMatchRate}.`
    );
  }

  for (const [field, minimum] of Object.entries(minimumPerFieldAccuracy)) {
    const actual = summary.perFieldAccuracy[field] ?? 0;

    if (actual < Number(minimum)) {
      failures.push(
        `${field} accuracy ${actual} is below the gate ${Number(minimum)}.`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    minimumAverageScore,
    minimumExactMatchRate,
    minimumPerFieldAccuracy
  };
}

export async function runExtractionEval({
  trigger = "manual",
  preferredMode = "heuristic",
  suite = readEvalSuite(),
  generatedAt = new Date().toISOString()
} = {}) {
  const sourceStore = readSourceStore();
  const sourceMap = new Map(sourceStore.sources.map((source) => [source.id, source]));
  const previousRun = readEvalStore().runs[0] || null;
  const suiteCases = suite.cases.map((testCase) => ({
    ...testCase,
    post: {
      id: testCase.id,
      sourceId: testCase.sourceId,
      createdAt: testCase.createdAt,
      body: testCase.body
    }
  }));
  const extractionResult =
    preferredMode === "heuristic"
      ? {
          extractions: new Map(),
          stats: {
            requestedMode: "heuristic",
            activeMode: "heuristic",
            provider: "heuristic-fallback",
            model: "",
            cacheHits: 0,
            liveExtractions: 0,
            cacheWrites: 0,
            fallbackCount: suiteCases.length
          },
          warnings: []
        }
      : await extractClaimsForPosts({
          posts: suiteCases.map((testCase) => testCase.post),
          sources: sourceStore.sources,
          generatedAt
        });

  const cases = suiteCases.map((testCase) => {
    const source = sourceMap.get(testCase.sourceId);
    const heuristic = buildHeuristicPostAnalysis({
      post: testCase.post,
      source,
      generatedAt
    });
    const extractedClaim = extractionResult.extractions.get(testCase.id);
    const actual =
      extractionResult.stats.activeMode === "heuristic"
        ? heuristic
        : buildNormalizedPostAnalysis({
            post: testCase.post,
            source,
            generatedAt,
            extractedClaim,
            extractorMode: extractionResult.stats.activeMode
          });
    const fields = Object.entries(testCase.expected).map(([field, expectedValue]) => {
      const actualValue = actual[field];
      const matched = compareField(expectedValue, actualValue);

      return {
        field,
        expected: expectedValue,
        actual: actualValue,
        matched
      };
    });
    const matchedCount = fields.filter((field) => field.matched).length;
    const score = matchedCount / Math.max(fields.length, 1);

    return {
      id: testCase.id,
      label: testCase.label,
      sourceId: testCase.sourceId,
      matched: matchedCount === fields.length,
      score: round(score),
      fields,
      actual,
      heuristicBaseline: heuristic
    };
  });

  const perField = {};

  for (const testCase of cases) {
    for (const field of testCase.fields) {
      if (!perField[field.field]) {
        perField[field.field] = {
          total: 0,
          matched: 0
        };
      }

      perField[field.field].total += 1;
      perField[field.field].matched += field.matched ? 1 : 0;
    }
  }

  const averageScore =
    cases.reduce((sum, testCase) => sum + testCase.score, 0) / Math.max(cases.length, 1);
  const exactMatchCount = cases.filter((testCase) => testCase.matched).length;
  const failedCases = cases
    .filter((testCase) => !testCase.matched)
    .map((testCase) => ({
      id: testCase.id,
      label: testCase.label,
      score: testCase.score,
      misses: testCase.fields
        .filter((field) => !field.matched)
        .map((field) => field.field)
    }))
    .slice(0, 8);
  const summary = {
    averageScore: round(averageScore),
    exactMatchRate: round(exactMatchCount / Math.max(cases.length, 1)),
    caseCount: cases.length,
    exactMatchCount,
    perFieldAccuracy: Object.fromEntries(
      Object.entries(perField).map(([field, value]) => [
        field,
        round(value.matched / Math.max(value.total, 1))
      ])
    )
  };
  const gate = buildGate(summary, suite);
  const run = {
    id: buildRunId(),
    generatedAt,
    trigger,
    suiteName: suite.suiteName || "default-claim-eval-suite",
    promptVersion: extractionResult.stats.activeMode === "heuristic" ? "heuristic-baseline" : "claim-extractor-v1",
    extractor: extractionResult.stats,
    summary: {
      ...summary,
      deltaVsPreviousAverageScore: buildDelta(summary.averageScore, previousRun?.summary?.averageScore),
      deltaVsPreviousExactMatchRate: buildDelta(summary.exactMatchRate, previousRun?.summary?.exactMatchRate)
    },
    gate,
    failedCases,
    warnings: extractionResult.warnings,
    cases
  };

  persistEvalRun(run);
  return run;
}
