import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildHeuristicPostAnalysis,
  buildNormalizedPostAnalysis,
  runAgenticEngine
} from "./agenticEngine.js";
import { persistEvalRun, readEvalStore } from "./evalStore.js";
import { buildMarketSnapshot } from "./marketDataProvider.js";
import { extractClaimsForPosts, getClaimExtractionPromptGuide } from "./modelClaimExtractor.js";
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

  return {
    ...parsedSuite,
    scenarioCases: Array.isArray(parsedSuite.scenarioCases) ? parsedSuite.scenarioCases : []
  };
}

function normalizeComparableValue(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => normalizeComparableValue(item)))]
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeComparableValue(nestedValue)])
    );
  }

  return value;
}

function compareField(expectedValue, actualValue) {
  return JSON.stringify(normalizeComparableValue(expectedValue)) === JSON.stringify(normalizeComparableValue(actualValue));
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
  const minimumScenarioExactMatchRate = Number(gates.minimumScenarioExactMatchRate ?? 0);
  const minimumPerFieldAccuracy = gates.minimumPerFieldAccuracy || {};
  const failures = [];

  if (summary.averageScore < minimumAverageScore) {
    failures.push(`Average score ${summary.averageScore} is below the gate ${minimumAverageScore}.`);
  }

  if (summary.exactMatchRate < minimumExactMatchRate) {
    failures.push(`Exact match rate ${summary.exactMatchRate} is below the gate ${minimumExactMatchRate}.`);
  }

  if (summary.scenarioCaseCount && summary.scenarioExactMatchRate < minimumScenarioExactMatchRate) {
    failures.push(
      `Scenario exact match rate ${summary.scenarioExactMatchRate} is below the gate ${minimumScenarioExactMatchRate}.`
    );
  }

  for (const [field, minimum] of Object.entries(minimumPerFieldAccuracy)) {
    const actual = summary.perFieldAccuracy[field] ?? 0;

    if (actual < Number(minimum)) {
      failures.push(`${field} accuracy ${actual} is below the gate ${Number(minimum)}.`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    minimumAverageScore,
    minimumExactMatchRate,
    minimumScenarioExactMatchRate,
    minimumPerFieldAccuracy
  };
}

function buildFieldSummary(results) {
  const perField = {};

  for (const testCase of results) {
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

  return Object.fromEntries(
    Object.entries(perField).map(([field, value]) => [
      field,
      round(value.matched / Math.max(value.total, 1))
    ])
  );
}

function buildCaseResult({
  id,
  label,
  type,
  fields,
  actual,
  extra = {}
}) {
  const matchedCount = fields.filter((field) => field.matched).length;
  const score = matchedCount / Math.max(fields.length, 1);

  return {
    id,
    label,
    type,
    matched: matchedCount === fields.length,
    score: round(score),
    fields,
    actual,
    ...extra
  };
}

function buildFailedCaseList(results, limit = 12) {
  return results
    .filter((testCase) => !testCase.matched)
    .map((testCase) => ({
      id: testCase.id,
      label: testCase.label,
      type: testCase.type,
      score: testCase.score,
      misses: testCase.fields.filter((field) => !field.matched).map((field) => field.field)
    }))
    .slice(0, limit);
}

function buildScenarioPosts(testCase) {
  return (testCase.posts || []).map((post, index) => ({
    id: post.id || `${testCase.id}-post-${index + 1}`,
    sourceId: post.sourceId,
    createdAt: post.createdAt,
    body: post.body
  }));
}

function pickDecisionActions(decisions, expectedDecisionActions) {
  return Object.fromEntries(
    Object.keys(expectedDecisionActions || {}).map((asset) => [
      asset,
      decisions.find((decision) => decision.asset === asset)?.action || "MISSING"
    ])
  );
}

export async function runExtractionEval({
  trigger = "manual",
  preferredMode = "heuristic",
  useCache = true,
  suite = readEvalSuite(),
  generatedAt = new Date().toISOString()
} = {}) {
  const sourceStore = readSourceStore();
  const sourceMap = new Map(sourceStore.sources.map((source) => [source.id, source]));
  const previousRun = readEvalStore().runs[0] || null;
  const promptGuide = getClaimExtractionPromptGuide();
  const postCases = suite.cases.map((testCase) => ({
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
            promptVersion: promptGuide.version,
            promptLabel: promptGuide.label,
            cacheHits: 0,
            liveExtractions: 0,
            cacheWrites: 0,
            fallbackCount: postCases.length
          },
          promptGuide,
          warnings: []
        }
      : await extractClaimsForPosts({
          posts: postCases.map((testCase) => testCase.post),
          sources: sourceStore.sources,
          generatedAt,
          useCache
        });

  const evaluatedPostCases = postCases.map((testCase) => {
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

    return buildCaseResult({
      id: testCase.id,
      label: testCase.label,
      type: "post",
      fields,
      actual,
      extra: {
        sourceId: testCase.sourceId,
        heuristicBaseline: heuristic
      }
    });
  });

  const scenarioMarketSnapshot = await buildMarketSnapshot({
    generatedAt,
    config: {
      requestedProvider: "mock",
      timeoutMs: 0
    }
  });
  const evaluatedScenarioCases = [];

  for (const testCase of suite.scenarioCases) {
    const scenarioPosts = buildScenarioPosts(testCase);
    const runtime = await runAgenticEngine({
      posts: scenarioPosts,
      sources: sourceStore.sources,
      generatedAt,
      marketSnapshot: scenarioMarketSnapshot
    });
    const expected = testCase.expected || {};
    const actual = {
      clusterCount: runtime.clusters.length,
      clusterIds: runtime.clusters.map((cluster) => cluster.id),
      actionableCount: runtime.summary.actionableCount,
      decisionActions: pickDecisionActions(runtime.decisions, expected.decisionActions),
      vetoedAssets: runtime.vetoedSignals.map((signal) => signal.asset)
    };
    const fields = Object.entries(expected).map(([field, expectedValue]) => {
      const actualValue = actual[field];
      const matched = compareField(expectedValue, actualValue);

      return {
        field,
        expected: expectedValue,
        actual: actualValue,
        matched
      };
    });

    evaluatedScenarioCases.push(
      buildCaseResult({
        id: testCase.id,
        label: testCase.label,
        type: "scenario",
        fields,
        actual,
        extra: {
          runtimeSummary: runtime.summary,
          decisions: runtime.decisions,
          clusters: runtime.clusters,
          vetoedSignals: runtime.vetoedSignals
        }
      })
    );
  }

  const allResults = [...evaluatedPostCases, ...evaluatedScenarioCases];
  const averageScore =
    allResults.reduce((sum, testCase) => sum + testCase.score, 0) / Math.max(allResults.length, 1);
  const exactMatchCount = allResults.filter((testCase) => testCase.matched).length;
  const exactMatchRate = exactMatchCount / Math.max(allResults.length, 1);
  const scenarioExactMatchCount = evaluatedScenarioCases.filter((testCase) => testCase.matched).length;
  const scenarioExactMatchRate =
    scenarioExactMatchCount / Math.max(evaluatedScenarioCases.length || 1, 1);
  const summary = {
    averageScore: round(averageScore),
    exactMatchRate: round(exactMatchRate),
    caseCount: allResults.length,
    exactMatchCount,
    postCaseCount: evaluatedPostCases.length,
    postExactMatchCount: evaluatedPostCases.filter((testCase) => testCase.matched).length,
    scenarioCaseCount: evaluatedScenarioCases.length,
    scenarioExactMatchCount,
    scenarioExactMatchRate: round(scenarioExactMatchRate),
    perFieldAccuracy: buildFieldSummary(allResults)
  };
  const gate = buildGate(summary, suite);
  const run = {
    id: buildRunId(),
    generatedAt,
    trigger,
    suiteName: suite.suiteName || "default-claim-eval-suite",
    promptVersion: extractionResult.promptGuide?.version || extractionResult.stats.promptVersion || promptGuide.version,
    promptGuide: extractionResult.promptGuide || promptGuide,
    validationMode:
      extractionResult.stats.activeMode === "heuristic" ? "heuristic-baseline" : "model-output",
    extractor: extractionResult.stats,
    summary: {
      ...summary,
      deltaVsPreviousAverageScore: buildDelta(summary.averageScore, previousRun?.summary?.averageScore),
      deltaVsPreviousExactMatchRate: buildDelta(summary.exactMatchRate, previousRun?.summary?.exactMatchRate)
    },
    gate,
    failedCases: buildFailedCaseList(allResults),
    warnings: extractionResult.warnings,
    cases: evaluatedPostCases,
    scenarioCases: evaluatedScenarioCases
  };

  persistEvalRun(run);
  return run;
}
