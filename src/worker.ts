// Standalone worker process for BullMQ background jobs.
// Can be run independently in a separate container or process:
//   npm run worker

import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { EvaluationJobPayload } from "./queue/queueManager";
import { evaluateSubmission } from "./stageB";
import { updateJobLog } from "./supabase";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.log("REDIS_URL not configured. Standalone worker is idle.");
  process.exit(0);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const evaluationWorker = new Worker<EvaluationJobPayload>(
  "evaluation-queue",
  async (job: Job<EvaluationJobPayload>) => {
    console.log(`Worker processing evaluation job ${job.id} for submission ${job.data.submissionId}`);
    await updateJobLog(job.id ?? "unknown", "processing");

    try {
      const result = await evaluateSubmission(job.data.submissionId, job.data.languageLabel);
      console.log(`Evaluation complete for submission ${job.data.submissionId}: ${result.totalMarks}/${result.maxMarks}`);
      await updateJobLog(job.id ?? "unknown", "completed");
    } catch (err: any) {
      console.error(`Worker failed processing submission ${job.data.submissionId}:`, err);
      await updateJobLog(job.id ?? "unknown", "failed", err?.message ?? String(err));
      throw err;
    }
  },
  { connection },
);

evaluationWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully.`);
});

evaluationWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed with error:`, err);
});

console.log("BullMQ evaluation worker process started and listening.");
