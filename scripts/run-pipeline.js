import { runPipeline } from "../src/pipelineRunner.js";

const run = await runPipeline({
  trigger: "cli"
});

console.log(
  JSON.stringify(
    {
      runId: run.id,
      generatedAt: run.generatedAt,
      trigger: run.trigger,
      summary: run.summary,
      extractor: run.extractor,
      market: run.market.summary
    },
    null,
    2
  )
);
