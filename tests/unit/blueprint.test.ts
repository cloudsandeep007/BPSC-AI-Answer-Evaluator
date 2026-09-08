import { describe, it, expect, vi } from "vitest";
import { checkQuestionQuality } from "../../src/ai/agents/qualityChecker";
import { EvaluationBlueprint } from "../../src/domain/blueprint";
import { aiGateway } from "../../src/ai/gateway";

vi.mock("../../src/ai/gateway", () => ({
  aiGateway: {
    callStructured: vi.fn(),
  },
}));

describe("Quality Checker Agent", () => {
  it("should pass a valid question", async () => {
    vi.mocked(aiGateway.callStructured).mockResolvedValueOnce({
      data: { score: 9.0, feedback: "Good question", passed: true },
      rawText: "",
      provider: "mock",
      model: "mock",
      latencyMs: 100,
      usage: { inputTokens: 0, outputTokens: 0 },
      groundingSources: [],
    });

    const bp = { topic: "Polity", slotType: "choice_essay", directive: "Discuss", marks: 38, wordLimit: 600 } as EvaluationBlueprint;
    const res = await checkQuestionQuality("Discuss Article 14.", bp, "");
    
    expect(res.passed).toBe(true);
    expect(res.score).toBe(9.0);
  });

  it("should reject a poor question", async () => {
    vi.mocked(aiGateway.callStructured).mockResolvedValueOnce({
      data: { score: 4.5, feedback: "Too generic", passed: false },
      rawText: "",
      provider: "mock",
      model: "mock",
      latencyMs: 100,
      usage: { inputTokens: 0, outputTokens: 0 },
      groundingSources: [],
    });

    const bp = { topic: "Polity", slotType: "choice_essay", directive: "Discuss", marks: 38, wordLimit: 600 } as EvaluationBlueprint;
    const res = await checkQuestionQuality("What is constitution?", bp, "");
    
    expect(res.passed).toBe(false);
    expect(res.score).toBe(4.5);
    expect(res.feedback).toBe("Too generic");
  });
});
