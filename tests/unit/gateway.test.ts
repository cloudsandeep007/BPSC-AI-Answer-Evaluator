import { describe, it, expect } from "vitest";
import { AIGateway } from "../../src/ai/gateway";

describe("AI Gateway Interface", () => {
  it("forces mock provider and returns deterministic structured output for stage0", async () => {
    const gateway = new AIGateway({ forceMock: true });
    const response = await gateway.callStructured({
      feature: "stage0",
      system: "test system prompt",
      userPrompt: "generate question",
    });

    expect(response.provider).toBe("mock-provider");
    expect(response.data).toBeDefined();
    expect(response.data.question).toContain("पंचायती राज");
    expect(response.data.expected_points).toHaveLength(2);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
  });

  it("forces mock provider and returns deterministic structured output for stageB", async () => {
    const gateway = new AIGateway({ forceMock: true });
    const response = await gateway.callStructured({
      feature: "stageB",
      system: "test evaluator",
      userPrompt: "evaluate answer",
    });

    expect(response.provider).toBe("mock-provider");
    expect(response.data.dimensions.content).toBe("strong");
    expect(response.data.points_found).toHaveLength(1);
    expect(response.data.points_missed).toHaveLength(1);
  });

  it("forces mock provider and returns deterministic transcription for stageA", async () => {
    const gateway = new AIGateway({ forceMock: true });
    const response = await gateway.transcribe({
      base64Image: "fake-base64-data",
      mimeType: "image/jpeg",
    });

    expect(response.provider).toBe("mock-provider");
    expect(response.confidence).toBe(0.95);
    expect(response.transcript).toContain("पंचायती राज");
    expect(response.wordCount).toBeGreaterThan(10);
  });
});
