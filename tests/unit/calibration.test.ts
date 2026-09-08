import { describe, it, expect } from "vitest";
import { computeScore } from "../../src/content/calibration";

describe("Examiner Calibration Engine", () => {
  it("A1: vague 8-mark compulsory sub-part scores 1-2 marks", () => {
    const res = computeScore({
      slotType: "compulsory_subpart",
      dimensions: { content: "weak", directive: "weak", structure: "weak", relevance: "negligible" },
      specificity: "negligible",
    });
    expect(res.totalMarks).toBeGreaterThanOrEqual(1);
    expect(res.totalMarks).toBeLessThanOrEqual(2);
  });

  it("A2: solid but generic 8-mark sub-part scores 4-5 marks", () => {
    const res = computeScore({
      slotType: "compulsory_subpart",
      dimensions: { content: "average", directive: "strong", structure: "strong", relevance: "weak" },
      specificity: "weak",
    });
    expect(res.totalMarks).toBeGreaterThanOrEqual(4);
    expect(res.totalMarks).toBeLessThanOrEqual(5);
  });

  it("A3: precise factual 8-mark sub-part scores 7-8 marks", () => {
    const res = computeScore({
      slotType: "compulsory_subpart",
      dimensions: { content: "strong", directive: "strong", structure: "strong", relevance: "strong" },
      specificity: "strong",
    });
    expect(res.totalMarks).toBeGreaterThanOrEqual(7);
    expect(res.totalMarks).toBeLessThanOrEqual(8);
  });

  it("B1: strong/topper-tier 38-mark essay scores 20-26 marks", () => {
    const res = computeScore({
      slotType: "choice_essay",
      dimensions: { content: "strong", directive: "strong", structure: "strong", relevance: "strong" },
      specificity: "average",
    });
    expect(res.totalMarks).toBeGreaterThanOrEqual(20);
    expect(res.totalMarks).toBeLessThanOrEqual(26);
  });

  it("B2: average/pass-tier 38-mark essay scores 12-19 marks", () => {
    const res = computeScore({
      slotType: "choice_essay",
      dimensions: { content: "average", directive: "average", structure: "average", relevance: "weak" },
      specificity: "weak",
    });
    expect(res.totalMarks).toBeGreaterThanOrEqual(12);
    expect(res.totalMarks).toBeLessThanOrEqual(19);
  });

  it("B3: weak 38-mark essay scores 4-11 marks", () => {
    const res = computeScore({
      slotType: "choice_essay",
      dimensions: { content: "weak", directive: "weak", structure: "weak", relevance: "negligible" },
      specificity: "negligible",
    });
    expect(res.totalMarks).toBeGreaterThanOrEqual(4);
    expect(res.totalMarks).toBeLessThanOrEqual(11);
  });

  it("Realism ceiling: flawless discursive essay does not exceed 70%", () => {
    const flawless = computeScore({
      slotType: "choice_essay",
      dimensions: { content: "strong", directive: "strong", structure: "strong", relevance: "strong" },
      specificity: "strong",
    });
    expect(flawless.finalFraction).toBeLessThanOrEqual(0.7);
    expect(flawless.finalFraction).toBeGreaterThanOrEqual(0.55);
  });

  it("Directive failure cap: rich content with ignored directive is capped at 50%", () => {
    const ignored = computeScore({
      slotType: "choice_essay",
      dimensions: { content: "strong", directive: "negligible", structure: "strong", relevance: "strong" },
      specificity: "strong",
    });
    expect(ignored.finalFraction).toBeLessThanOrEqual(0.5);
    expect(ignored.directiveCapApplied).toBe(true);
  });
});
