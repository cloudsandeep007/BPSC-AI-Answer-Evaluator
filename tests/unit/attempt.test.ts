import { describe, it, expect } from "vitest";
import { compileAttemptTranscript, AttemptPageRow } from "../../src/services/attemptService";

describe("AttemptService - Multi-page Compiler", () => {
  it("compiles a single-page attempt without adding extra page headers", () => {
    const pages: AttemptPageRow[] = [
      {
        id: "p1",
        attempt_id: "att-1",
        page_number: 1,
        image_sha256: "hash1",
        image_storage_path: "path1.jpg",
        transcript: "बिहार में कृषि आधारित उद्योगों की अपार संभावनाएं हैं।",
        confidence: 0.94,
        word_count: 8,
        created_at: new Date().toISOString(),
      },
    ];

    const result = compileAttemptTranscript(pages);
    expect(result.combinedTranscript).toBe("बिहार में कृषि आधारित उद्योगों की अपार संभावनाएं हैं।");
    expect(result.totalWords).toBe(8);
    expect(result.averageConfidence).toBe(0.94);
  });

  it("compiles multi-page attempts with correct ordering and page headers", () => {
    // Deliberately unsorted in array to test sorting
    const pages: AttemptPageRow[] = [
      {
        id: "p2",
        attempt_id: "att-1",
        page_number: 2,
        image_sha256: "hash2",
        image_storage_path: "path2.jpg",
        transcript: "खाद्य प्रसंस्करण इकाइयाँ ग्रामीण अर्थव्यवस्था को सुदृढ़ करेंगी।",
        confidence: 0.90,
        word_count: 7,
        created_at: new Date().toISOString(),
      },
      {
        id: "p1",
        attempt_id: "att-1",
        page_number: 1,
        image_sha256: "hash1",
        image_storage_path: "path1.jpg",
        transcript: "बिहार में मखाना, लीची और आम के उत्पादन में अग्रणी स्थान है।",
        confidence: 0.96,
        word_count: 10,
        created_at: new Date().toISOString(),
      },
    ];

    const result = compileAttemptTranscript(pages);
    expect(result.totalWords).toBe(17);
    expect(result.averageConfidence).toBeCloseTo(0.93, 2);
    expect(result.combinedTranscript).toContain("--- पृष्ठ 1 ---");
    expect(result.combinedTranscript).toContain("--- पृष्ठ 2 ---");

    // Verify page 1 comes before page 2
    const idx1 = result.combinedTranscript.indexOf("--- पृष्ठ 1 ---");
    const idx2 = result.combinedTranscript.indexOf("--- पृष्ठ 2 ---");
    expect(idx1).toBeLessThan(idx2);
  });

  it("handles empty pages array safely", () => {
    const result = compileAttemptTranscript([]);
    expect(result.combinedTranscript).toBe("");
    expect(result.totalWords).toBe(0);
    expect(result.averageConfidence).toBeNull();
  });
});
