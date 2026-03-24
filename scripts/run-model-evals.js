import { runCombinedModelEval } from "../src/modelEvalHarness.js";

const args = process.argv.slice(2);
const strictMode = args.includes("--strict");
const attemptsArgument = args.find((argument) => argument.startsWith("--attempts=")) || "";
const defaultAttempts = attemptsArgument ? Number(attemptsArgument.split("=")[1]) : Number.NaN;
const result = await runCombinedModelEval({
  trigger: "cli:model",
  defaultAttempts
});

console.log(
  JSON.stringify(
    {
      generatedAt: result.generatedAt,
      endpointProbe: result.endpointProbe,
      overall: result.overall,
      reasoning: {
        runId: result.reasoningRun.id,
        suiteName: result.reasoningRun.suiteName,
        promptVersion: result.reasoningRun.promptVersion,
        model: result.reasoningRun.model,
        summary: result.reasoningRun.summary,
        gate: result.reasoningRun.gate,
        failedCases: result.reasoningRun.failedCases
      },
      extraction: {
        runId: result.extractionRun.id,
        suiteName: result.extractionRun.suiteName,
        promptVersion: result.extractionRun.promptVersion,
        extractor: result.extractionRun.extractor,
        summary: result.extractionRun.summary,
        gate: result.extractionRun.gate,
        failedCases: result.extractionRun.failedCases
      }
    },
    null,
    2
  )
);

if (strictMode && !result.overall.passed) {
  process.exitCode = 1;
}
