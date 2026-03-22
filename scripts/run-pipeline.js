import { executePipelineJob } from "../src/orchestrator.js";

const result = await executePipelineJob({
  trigger: "cli"
});
const run = result.run;

console.log(
  JSON.stringify(
    {
      jobId: result.jobId,
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
