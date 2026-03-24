import { runExtractionEval } from "../src/evalHarness.js";

const args = process.argv.slice(2);
const strictMode = args.includes("--strict");
const useCache = !args.includes("--live") && !args.includes("--no-cache");
const preferredMode = args.find((argument) => !argument.startsWith("--")) || "heuristic";
const run = await runExtractionEval({
  trigger: "cli",
  preferredMode,
  useCache
});

console.log(
  JSON.stringify(
    {
      runId: run.id,
      generatedAt: run.generatedAt,
      suiteName: run.suiteName,
      validationMode: run.validationMode,
      promptVersion: run.promptVersion,
      extractor: run.extractor,
      summary: run.summary,
      gate: run.gate,
      failedCases: run.failedCases
    },
    null,
    2
  )
);

if (strictMode && !run.gate?.passed) {
  process.exitCode = 1;
}
