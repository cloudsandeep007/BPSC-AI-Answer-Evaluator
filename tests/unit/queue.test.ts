import { describe, it, expect, vi } from "vitest";
import { QueueManager } from "../../src/queue/queueManager";

describe("QueueManager", () => {
  it("executes processor in inline mode when Redis is unconfigured", async () => {
    const queue = new QueueManager();
    expect(queue.isConnected).toBe(false);

    let processed = false;
    const result = await queue.enqueueEvaluation(
      {
        submissionId: "sub-123",
        telegramId: 99999,
        languageLabel: "English",
        lang: "en",
      },
      async (payload) => {
        expect(payload.submissionId).toBe("sub-123");
        processed = true;
      },
    );

    expect(result.mode).toBe("inline");
    expect(result.jobId).toBeDefined();

    // Give setImmediate a tick to execute
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(processed).toBe(true);
  });
});
