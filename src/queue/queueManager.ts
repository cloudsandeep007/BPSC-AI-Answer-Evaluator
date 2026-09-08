// Asynchronous Queue Manager using BullMQ and Redis.
// Provides durable job scheduling for OCR and evaluation tasks.
// If REDIS_URL is not provided (local dev without Redis), seamlessly falls back
// to immediate asynchronous execution so developer workflows are never blocked.

import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { createJobLog, updateJobLog } from "../supabase";

export interface EvaluationJobPayload {
  submissionId: string;
  telegramId: number;
  languageLabel: string;
  lang: "hi" | "hinglish" | "en";
}

export type JobProcessor<T> = (data: T) => Promise<void>;

export class QueueManager {
  private redisClient: Redis | null = null;
  private evaluationQueue: Queue | null = null;
  private isRedisAvailable = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl && redisUrl.trim()) {
      try {
        this.redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          lazyConnect: true,
        });
        this.evaluationQueue = new Queue("evaluation-queue", { connection: this.redisClient });
        this.isRedisAvailable = true;
      } catch (err) {
        console.warn("Redis initialization failed, falling back to direct asynchronous mode:", err);
        this.isRedisAvailable = false;
      }
    }
  }

  public get isConnected(): boolean {
    return this.isRedisAvailable;
  }

  /**
   * Enqueues an evaluation job.
   * If Redis is available, pushes to BullMQ; otherwise invokes the processor in background.
   */
  public async enqueueEvaluation(
    payload: EvaluationJobPayload,
    processor: JobProcessor<EvaluationJobPayload>,
  ): Promise<{ jobId: string; mode: "queued" | "inline" }> {
    const jobLogId = await createJobLog("evaluation", payload.submissionId, payload);

    if (this.isRedisAvailable && this.evaluationQueue) {
      try {
        const job = await this.evaluationQueue.add("evaluate", payload, {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        });
        return { jobId: job.id ?? jobLogId, mode: "queued" };
      } catch (err) {
        console.warn("Failed to add job to BullMQ, executing inline:", err);
      }
    }

    // Fallback: execute in background asynchronously without blocking the caller
    setImmediate(async () => {
      await updateJobLog(jobLogId, "processing");
      try {
        await processor(payload);
        await updateJobLog(jobLogId, "completed");
      } catch (err: any) {
        console.error(`Evaluation job ${jobLogId} failed:`, err);
        await updateJobLog(jobLogId, "failed", err?.message ?? String(err));
      }
    });

    return { jobId: jobLogId, mode: "inline" };
  }
}

export const queueManager = new QueueManager();
