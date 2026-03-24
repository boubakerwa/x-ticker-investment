import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runExtractionEval } from "./evalHarness.js";
import { persistEvalRun, readEvalStore } from "./evalStore.js";
import { requestStructuredResponse, resolveLlmConfig } from "./llmClient.js";

const SUITE_PATH = fileURLToPath(new URL("../data/model-eval-suite.json", import.meta.url));
const DEFAULT_MODEL = "gpt-4.1-mini";

function readModelEvalSuite() {
  if (!existsSync(SUITE_PATH)) {
    throw new Error("Model eval suite file is missing.");
  }

  const parsedSuite = JSON.parse(readFileSync(SUITE_PATH, "utf8"));

  if (
    !parsedSuite ||
    typeof parsedSuite !== "object" ||
    !Array.isArray(parsedSuite.cases) ||
    !parsedSuite.schema ||
    typeof parsedSuite.schema !== "object"
  ) {
    throw new Error("Model eval suite file is invalid.");
  }

  return parsedSuite;
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

function buildFieldSummary(attempts) {
  const perField = {};

  for (const attempt of attempts) {
    for (const field of attempt.fields) {
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

function buildGate(summary, suite) {
  const gates = suite.gates || {};
  const minimumJsonPassRate = Number(gates.minimumJsonPassRate ?? 0);
  const minimumAverageScore = Number(gates.minimumAverageScore ?? 0);
  const minimumExactMatchRate = Number(gates.minimumExactMatchRate ?? 0);
  const minimumStableCaseRate = Number(gates.minimumStableCaseRate ?? 0);
  const minimumPerFieldAccuracy = gates.minimumPerFieldAccuracy || {};
  const failures = [];

  if (summary.jsonPassRate < minimumJsonPassRate) {
    failures.push(`JSON pass rate ${summary.jsonPassRate} is below the gate ${minimumJsonPassRate}.`);
  }

  if (summary.averageScore < minimumAverageScore) {
    failures.push(`Average score ${summary.averageScore} is below the gate ${minimumAverageScore}.`);
  }

  if (summary.exactMatchRate < minimumExactMatchRate) {
    failures.push(`Exact match rate ${summary.exactMatchRate} is below the gate ${minimumExactMatchRate}.`);
  }

  if (summary.stableCaseRate < minimumStableCaseRate) {
    failures.push(`Stable case rate ${summary.stableCaseRate} is below the gate ${minimumStableCaseRate}.`);
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
    minimumJsonPassRate,
    minimumAverageScore,
    minimumExactMatchRate,
    minimumStableCaseRate,
    minimumPerFieldAccuracy
  };
}

function findPreviousSuiteRun(suiteName) {
  return readEvalStore().runs.find((run) => run.suiteName === suiteName) || null;
}

function truncateText(value, limit = 320) {
  const text = String(value || "").trim();

  if (!text || text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1)}...`;
}

function buildFailureList(caseResults, limit = 12) {
  return caseResults
    .filter((testCase) => !testCase.passed)
    .map((testCase) => ({
      id: testCase.id,
      label: testCase.label,
      exactMatchRate: testCase.exactMatchRate,
      jsonPassRate: testCase.jsonPassRate,
      stable: testCase.stable,
      misses: [...new Set(testCase.attempts.flatMap((attempt) => attempt.fields.filter((field) => !field.matched).map((field) => field.field)))],
      latestRequestError: testCase.attempts[testCase.attempts.length - 1]?.requestError || "",
      latestParseError: testCase.attempts[testCase.attempts.length - 1]?.parseError || "",
      latestRawOutput: testCase.attempts[testCase.attempts.length - 1]?.rawOutput || ""
    }))
    .slice(0, limit);
}

function normalizeAttemptCount(value, fallback) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return fallback;
  }

  return Math.max(1, Math.min(10, Math.floor(numericValue)));
}

async function probeModelEndpoint(config) {
  const headers = {};

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers
    });
    const payload = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? "" : String(payload?.error?.message || `Request failed with ${response.status}.`),
      modelCount: Array.isArray(payload?.data) ? payload.data.length : 0
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Model endpoint probe failed.",
      modelCount: 0
    };
  }
}

async function runDirectCase({
  testCase,
  sharedInstructions,
  schema,
  schemaName,
  config,
  defaultAttempts
}) {
  const attempts = [];
  const expectedEntries = Object.entries(testCase.expected || {});
  const attemptCount = normalizeAttemptCount(testCase.attempts, defaultAttempts);

  for (let index = 0; index < attemptCount; index += 1) {
    let rawOutput = "";
    let actual = null;
    let requestError = "";
    let parseError = "";
    let jsonValid = false;
    let fields = [];

    try {
      const response = await requestStructuredResponse({
        config,
        instructions: sharedInstructions,
        inputText: JSON.stringify(testCase.input || {}, null, 2),
        schema,
        schemaName,
        emptyOutputMessage: "Model response did not include structured output.",
        requestErrorMessage: "Model eval request failed."
      });

      rawOutput = response.outputText;

      try {
        actual = JSON.parse(rawOutput);
        jsonValid = Boolean(actual && typeof actual === "object" && !Array.isArray(actual));
      } catch (error) {
        parseError = error instanceof Error ? error.message : "JSON parse failed.";
      }
    } catch (error) {
      requestError = error instanceof Error ? error.message : "Model request failed.";
    }

    fields = expectedEntries.map(([field, expectedValue]) => {
      const actualValue = jsonValid ? actual[field] : null;

      return {
        field,
        expected: expectedValue,
        actual: actualValue,
        matched: jsonValid && compareField(expectedValue, actualValue)
      };
    });

    const matchedCount = fields.filter((field) => field.matched).length;
    const score = round(matchedCount / Math.max(fields.length, 1));

    attempts.push({
      attempt: index + 1,
      jsonValid,
      matched: jsonValid && matchedCount === fields.length,
      score,
      fields,
      actual,
      requestError,
      parseError,
      rawOutput: truncateText(rawOutput)
    });
  }

  const successfulAttempts = attempts.filter((attempt) => attempt.jsonValid);
  const exactMatchCount = attempts.filter((attempt) => attempt.matched).length;
  const stable =
    attempts.length <= 1
      ? attempts[0]?.jsonValid !== false
      : successfulAttempts.length === attempts.length &&
        new Set(successfulAttempts.map((attempt) => JSON.stringify(normalizeComparableValue(attempt.actual)))).size === 1;

  return {
    id: testCase.id,
    label: testCase.label,
    passed: exactMatchCount === attempts.length && stable,
    stable,
    jsonPassRate: round(successfulAttempts.length / Math.max(attempts.length, 1)),
    exactMatchRate: round(exactMatchCount / Math.max(attempts.length, 1)),
    averageScore: round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / Math.max(attempts.length, 1)),
    attempts
  };
}

export async function runModelReliabilityEval({
  trigger = "manual",
  suite = readModelEvalSuite(),
  generatedAt = new Date().toISOString(),
  defaultAttempts = Number.NaN
} = {}) {
  const config = resolveLlmConfig({
    modelEnvVar: "OPENAI_MODEL",
    defaultModel: DEFAULT_MODEL
  });

  if (config.provider !== "local_openai_compatible" && !config.apiKey) {
    throw new Error("Model evals require either LLM_PROVIDER=local_openai_compatible or a configured OPENAI_API_KEY.");
  }

  const sharedInstructions = [...(suite.sharedInstructions || [])].join(" ");
  const schemaName = String(suite.schemaName || "model_reliability_case");
  const attemptsPerCase = normalizeAttemptCount(defaultAttempts, normalizeAttemptCount(suite.defaultAttempts, 1));
  const previousRun = findPreviousSuiteRun(suite.suiteName || "default-model-reliability-suite");
  const caseResults = [];

  for (const testCase of suite.cases) {
    caseResults.push(
      await runDirectCase({
        testCase,
        sharedInstructions,
        schema: suite.schema,
        schemaName,
        config,
        defaultAttempts: attemptsPerCase
      })
    );
  }

  const attemptResults = caseResults.flatMap((testCase) => testCase.attempts);
  const jsonPassCount = attemptResults.filter((attempt) => attempt.jsonValid).length;
  const exactMatchCount = attemptResults.filter((attempt) => attempt.matched).length;
  const stableCaseCount = caseResults.filter((testCase) => testCase.stable).length;
  const requestFailureCount = attemptResults.filter((attempt) => attempt.requestError).length;
  const parseFailureCount = attemptResults.filter((attempt) => attempt.parseError).length;
  const summary = {
    caseCount: caseResults.length,
    attemptCount: attemptResults.length,
    jsonPassCount,
    jsonPassRate: round(jsonPassCount / Math.max(attemptResults.length, 1)),
    exactMatchCount,
    exactMatchRate: round(exactMatchCount / Math.max(attemptResults.length, 1)),
    stableCaseCount,
    stableCaseRate: round(stableCaseCount / Math.max(caseResults.length, 1)),
    requestFailureCount,
    parseFailureCount,
    averageScore: round(
      attemptResults.reduce((sum, attempt) => sum + attempt.score, 0) / Math.max(attemptResults.length, 1)
    ),
    perFieldAccuracy: buildFieldSummary(attemptResults)
  };
  const gate = buildGate(summary, suite);
  const run = {
    id: buildRunId(),
    generatedAt,
    trigger,
    suiteName: suite.suiteName || "default-model-reliability-suite",
    promptVersion: `model-reliability:${config.model}`,
    validationMode: "model-output",
    model: {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      attemptsPerCase
    },
    summary: {
      ...summary,
      deltaVsPreviousAverageScore: buildDelta(summary.averageScore, previousRun?.summary?.averageScore),
      deltaVsPreviousExactMatchRate: buildDelta(summary.exactMatchRate, previousRun?.summary?.exactMatchRate),
      deltaVsPreviousJsonPassRate: buildDelta(summary.jsonPassRate, previousRun?.summary?.jsonPassRate),
      deltaVsPreviousStableCaseRate: buildDelta(summary.stableCaseRate, previousRun?.summary?.stableCaseRate)
    },
    gate,
    failedCases: buildFailureList(caseResults),
    cases: caseResults
  };

  persistEvalRun(run);
  return run;
}

export async function runCombinedModelEval({
  trigger = "manual",
  generatedAt = new Date().toISOString(),
  defaultAttempts = Number.NaN
} = {}) {
  const config = resolveLlmConfig({
    modelEnvVar: "OPENAI_MODEL",
    defaultModel: DEFAULT_MODEL
  });
  const endpointProbe = await probeModelEndpoint(config);
  const reasoningRun = await runModelReliabilityEval({
    trigger,
    generatedAt,
    defaultAttempts
  });
  const extractionRun = await runExtractionEval({
    trigger,
    preferredMode: "openai",
    generatedAt,
    useCache: false
  });
  const failures = [
    ...((reasoningRun.gate?.failures || []).map((message) => `reasoning: ${message}`)),
    ...((extractionRun.gate?.failures || []).map((message) => `extraction: ${message}`))
  ];
  const liveExtractionRate = round(
    Number(extractionRun.extractor?.liveExtractions || 0) / Math.max(Number(extractionRun.summary?.postCaseCount || 0), 1)
  );

  if (Number(extractionRun.extractor?.fallbackCount || 0) > 0) {
    failures.push(
      `extraction: model fallback was used for ${Number(extractionRun.extractor?.fallbackCount || 0)} post cases.`
    );
  }

  if (Number(extractionRun.extractor?.liveExtractions || 0) === 0) {
    failures.push("extraction: the model produced zero live extraction results, so the run relied entirely on fallback behavior.");
  }

  if (!endpointProbe.ok) {
    failures.push(`endpoint: model endpoint probe failed (${endpointProbe.error || `status ${endpointProbe.status}`}).`);
  }

  return {
    generatedAt,
    endpointProbe,
    reasoningRun,
    extractionRun,
    overall: {
      passed:
        Boolean(reasoningRun.gate?.passed) &&
        Boolean(extractionRun.gate?.passed) &&
        failures.length === 0,
      failures,
      liveExtractionRate
    }
  };
}
