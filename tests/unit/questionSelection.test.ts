import { describe, it, expect } from "vitest";
import { selectTargetTopic } from "../../src/questionSelection/questionSelection";
import { resolveSubject } from "../../src/questionSelection/topicStatistics";

describe("Phase 5: BPSC Question Selection Intelligence Suite", () => {
  it("1. Subject resolution: handles subject IDs and human-readable names accurately", () => {
    const res1 = resolveSubject("BPSC-SUB-02");
    expect(res1.subject_id).toBe("BPSC-SUB-02");
    expect(res1.subject_name).toBe("Polity & Governance");

    const res2 = resolveSubject("Polity & Governance");
    expect(res2.subject_id).toBe("BPSC-SUB-02");
    expect(res2.subject_name).toBe("Polity & Governance");

    const res3 = resolveSubject("History, Art & Culture");
    expect(res3.subject_id).toBe("BPSC-SUB-01");
  });

  it("2. Cold-start selection for Polity & Governance returns top ranked topic with explainable reasons", async () => {
    const result = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 5,
    });

    expect(result.subject_id).toBe("BPSC-SUB-02");
    expect(result.target_topic_id).toBeTruthy();
    expect(result.selection_score).toBeGreaterThan(0.5);
    expect(result.selection_reason).toContain(result.target_topic_name);
    expect(result.candidate_topics.length).toBe(6); // 6 Polity topics in database
    expect(result.suggested_retrieval_query).toContain(result.target_topic_name);
  });

  it("3. Determinism: identical inputs produce identical target topic selections", async () => {
    const input = {
      subject_id: "BPSC-SUB-02",
      question_type: "LONG_ANSWER" as const,
      marks: 38,
    };

    const run1 = await selectTargetTopic(input);
    const run2 = await selectTargetTopic(input);

    expect(run1.target_topic_id).toBe(run2.target_topic_id);
    expect(run1.selection_score).toBe(run2.selection_score);
    expect(run1.suggested_retrieval_query).toBe(run2.suggested_retrieval_query);
  });

  it("4. Excluded topics: explicitly excluded topic IDs are filtered out", async () => {
    const result = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 5,
      exclude_topic_ids: ["POLITY-004", "POLITY-001"],
    });

    expect(result.target_topic_id).not.toBe("POLITY-004");
    expect(result.target_topic_id).not.toBe("POLITY-001");
    expect(result.candidate_topics.some((c) => c.topic_id === "POLITY-004")).toBe(false);
  });

  it("5. Panchayati Raj Over-Exposure & Anti-Repetition Penalty Simulation", async () => {
    // Simulate a student who practiced Panchayati Raj (POLITY-005) 3 times in a row
    const result = await selectTargetTopic(
      {
        subject_id: "BPSC-SUB-02",
        question_type: "SHORT_ANSWER",
        marks: 5,
      },
      ["POLITY-005", "POLITY-005", "POLITY-005"]
    );

    // Panchayati Raj MUST receive a strong repetition penalty and NOT win!
    const panchayatiRajCandidate = result.candidate_topics.find((c) => c.topic_id === "POLITY-005");
    expect(panchayatiRajCandidate).toBeDefined();
    expect(panchayatiRajCandidate?.factors.repetition_penalty).toBe(0.50);
    expect(result.target_topic_id).not.toBe("POLITY-005");
    expect(["POLITY-001", "POLITY-002", "POLITY-003", "POLITY-004", "POLITY-006"]).toContain(result.target_topic_id);
  });

  it("6. Polity 20-Run Simulation: verifies topic rotation and diversity across multiple runs", async () => {
    const selectedTopics: string[] = [];
    const history: string[] = [];

    for (let run = 0; run < 20; run++) {
      const res = await selectTargetTopic(
        {
          subject_id: "BPSC-SUB-02",
          question_type: "SHORT_ANSWER",
          marks: 5,
        },
        history
      );

      selectedTopics.push(res.target_topic_id);
      history.unshift(res.target_topic_id); // prepend recent selection
    }

    const uniqueSelected = new Set(selectedTopics);
    // At least 4 distinct Polity topics out of 6 should be selected across 20 runs
    expect(uniqueSelected.size).toBeGreaterThanOrEqual(4);
  });

  it("7. Multi-Subject Selection: History, Art & Culture (BPSC-SUB-01)", async () => {
    const result = await selectTargetTopic({
      subject_id: "BPSC-SUB-01",
      question_type: "LONG_ANSWER",
      marks: 38,
    });

    expect(result.subject_id).toBe("BPSC-SUB-01");
    expect(result.target_topic_id).toContain("HIST-");
    expect(result.candidate_topics.length).toBe(5); // 5 History topics
  });

  it("8. Multi-Subject Selection: Economy (BPSC-SUB-03)", async () => {
    const result = await selectTargetTopic({
      subject_id: "BPSC-SUB-03",
      question_type: "LONG_ANSWER",
      marks: 38,
    });

    expect(result.subject_id).toBe("BPSC-SUB-03");
    expect(result.target_topic_id).toContain("ECON-");
    expect(result.candidate_topics.length).toBe(3); // 3 Economy topics
  });

  it("9. Multi-Subject Selection: Science & Technology (BPSC-SUB-05)", async () => {
    const result = await selectTargetTopic({
      subject_id: "BPSC-SUB-05",
      question_type: "LONG_ANSWER",
      marks: 36,
    });

    expect(result.subject_id).toBe("BPSC-SUB-05");
    expect(result.target_topic_id).toContain("SCITECH-");
  });

  it("10. Multi-Subject Selection: Current Affairs & IR (BPSC-SUB-06)", async () => {
    const result = await selectTargetTopic({
      subject_id: "BPSC-SUB-06",
      question_type: "LONG_ANSWER",
      marks: 38,
    });

    expect(result.subject_id).toBe("BPSC-SUB-06");
    expect(result.target_topic_id).toContain("IR-");
  });

  it("11. Multi-Subject Selection: Essay (BPSC-SUB-08)", async () => {
    const result = await selectTargetTopic({
      subject_id: "BPSC-SUB-08",
      question_type: "ESSAY",
      marks: 100,
    });

    expect(result.subject_id).toBe("BPSC-SUB-08");
    expect(result.target_topic_id).toContain("ESSAY-");
  });

  it("12. Error handling: throws clear error for invalid or unknown subject", async () => {
    await expect(
      selectTargetTopic({
        subject_id: "BPSC-SUB-UNKNOWN-99",
        question_type: "SHORT_ANSWER",
        marks: 5,
      })
    ).rejects.toThrow();
  });
});
