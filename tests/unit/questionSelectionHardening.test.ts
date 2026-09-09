import { describe, it, expect } from "vitest";
import { selectTargetTopic } from "../../src/questionSelection/questionSelection";
import { isSubjectSelectable } from "../../src/questionSelection/topicStatistics";

describe("Question Selection Intelligence — Hardening & Regression Suite (Phase 5.2.1)", () => {
  // TEST 1 — Panchayati Raj Overexposure Protection
  it("TEST 1: Panchayati Raj overexposure resistance — heavy history redirects selector", async () => {
    // Heavy Panchayati Raj (POLITY-004) history
    const history = ["POLITY-004", "POLITY-004", "POLITY-004", "POLITY-004", "POLITY-004"];
    const result = await selectTargetTopic(
      {
        subject_id: "BPSC-SUB-02",
        question_type: "SHORT_ANSWER",
        marks: 8,
        student_id: "test_student_pr_heavy",
      },
      history
    );

    expect(result.target_topic_id).not.toBe("POLITY-004");
    expect(result.target_topic_name).not.toContain("Panchayati Raj");
    expect(result.selection_score).toBeGreaterThan(0);
  });

  // TEST 2 — Six Polity Topics Reachability
  it("TEST 2: Six Polity topics reachability — cold-start 100 sequential runs reach all 6 Polity topics", async () => {
    const encounteredTopics = new Set<string>();
    const history: string[] = [];

    for (let i = 0; i < 100; i++) {
      const result = await selectTargetTopic(
        {
          subject_id: "BPSC-SUB-02",
          question_type: "SHORT_ANSWER",
          marks: 8,
          student_id: "test_student_polity_sequential",
        },
        history
      );

      encounteredTopics.add(result.target_topic_id);
      history.unshift(result.target_topic_id); // Most recent first
    }

    // Must encounter all 6 Polity topics (POLITY-001 to POLITY-006)
    expect(encounteredTopics.size).toBe(6);
    expect(encounteredTopics.has("POLITY-001")).toBe(true);
    expect(encounteredTopics.has("POLITY-002")).toBe(true);
    expect(encounteredTopics.has("POLITY-003")).toBe(true);
    expect(encounteredTopics.has("POLITY-004")).toBe(true);
    expect(encounteredTopics.has("POLITY-005")).toBe(true);
    expect(encounteredTopics.has("POLITY-006")).toBe(true);
  });

  // TEST 3 — Maximum Consecutive Repetition
  it("TEST 3: Maximum consecutive repetition bound — consecutive same-topic selections <= 1", async () => {
    const history: string[] = [];
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    let lastTopic = "";

    for (let i = 0; i < 100; i++) {
      const result = await selectTargetTopic(
        {
          subject_id: "BPSC-SUB-02",
          question_type: "SHORT_ANSWER",
          marks: 8,
          student_id: "test_student_consecutive",
        },
        history
      );

      if (result.target_topic_id === lastTopic) {
        currentConsecutive++;
      } else {
        currentConsecutive = 1;
        lastTopic = result.target_topic_id;
      }

      if (currentConsecutive > maxConsecutive) {
        maxConsecutive = currentConsecutive;
      }

      history.unshift(result.target_topic_id); // Most recent first
    }

    // Maximum consecutive repetition must be <= 1 (no consecutive back-to-back same topic)
    expect(maxConsecutive).toBeLessThanOrEqual(1);
  });

  // TEST 4 — Determinism
  it("TEST 4: Determinism — 100 identical runs produce 0 differing outputs", async () => {
    const history = ["POLITY-002", "POLITY-001"];
    const baseResult = await selectTargetTopic(
      {
        subject_id: "BPSC-SUB-02",
        question_type: "SHORT_ANSWER",
        marks: 8,
        student_id: "test_student_det",
      },
      history
    );

    for (let i = 0; i < 100; i++) {
      const runResult = await selectTargetTopic(
        {
          subject_id: "BPSC-SUB-02",
          question_type: "SHORT_ANSWER",
          marks: 8,
          student_id: "test_student_det",
        },
        history
      );

      expect(runResult.target_topic_id).toBe(baseResult.target_topic_id);
      expect(runResult.selection_score).toBe(baseResult.selection_score);
      expect(runResult.suggested_retrieval_query).toBe(baseResult.suggested_retrieval_query);
    }
  });

  // TEST 5 — Personalization Math Protection
  it("TEST 5: Personalization math — exposure score decay and repetition penalty growth", async () => {
    // 0 history -> exposure = 1.00, repetition penalty = 0.00
    const res0 = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "student_math_0",
    }, []);

    const topic0Score = res0.candidate_topics.find(c => c.topic_id === "POLITY-002")!;
    expect(topic0Score.factors.student_exposure_score).toBe(1.00);
    expect(topic0Score.factors.repetition_penalty).toBe(0.00);

    // 1 history -> exposure = 0.70, repetition penalty = 0.15 (if 1st most recent)
    const res1 = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "student_math_1",
    }, ["POLITY-002"]);

    const topic1Score = res1.candidate_topics.find(c => c.topic_id === "POLITY-002")!;
    expect(topic1Score.factors.student_exposure_score).toBe(0.70);
    expect(topic1Score.factors.repetition_penalty).toBe(0.15);

    // 2 history -> exposure = 0.40, repetition penalty = 0.30 (if 1st & 2nd most recent)
    const res2 = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "student_math_2",
    }, ["POLITY-002", "POLITY-002"]);

    const topic2Score = res2.candidate_topics.find(c => c.topic_id === "POLITY-002")!;
    expect(topic2Score.factors.student_exposure_score).toBe(0.40);
    expect(topic2Score.factors.repetition_penalty).toBe(0.30);

    // 3+ history -> exposure = 0.10, repetition penalty = 0.50 (if 1st, 2nd, & 3rd most recent)
    const res3 = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "student_math_3",
    }, ["POLITY-002", "POLITY-002", "POLITY-002"]);

    const topic3Score = res3.candidate_topics.find(c => c.topic_id === "POLITY-002")!;
    expect(topic3Score.factors.student_exposure_score).toBe(0.10);
    expect(topic3Score.factors.repetition_penalty).toBe(0.50);
  });

  // TEST 6 — Rare Topic Reachability
  it("TEST 6: Rare topic reachability — lower-frequency topics can surface", async () => {
    // When higher-frequency topics have recent practice history, rare topics like POLITY-006 or HIST-005 surface
    const polityHistory = ["POLITY-002", "POLITY-001", "POLITY-003", "POLITY-004", "POLITY-005"];
    const resPolity = await selectTargetTopic(
      {
        subject_id: "BPSC-SUB-02",
        question_type: "SHORT_ANSWER",
        marks: 8,
        student_id: "student_rare_polity",
      },
      polityHistory
    );

    expect(resPolity.target_topic_id).toBe("POLITY-006");

    const historyHistory = ["HIST-001", "HIST-002", "HIST-003", "HIST-004"];
    const resHistory = await selectTargetTopic(
      {
        subject_id: "BPSC-SUB-01",
        question_type: "SHORT_ANSWER",
        marks: 8,
        student_id: "student_rare_history",
      },
      historyHistory
    );

    expect(resHistory.target_topic_id).toBe("HIST-005");
  });

  // TEST 7 — Subject Coverage & BPSC-SUB-10 Hardening
  it("TEST 7: Subject coverage — subjects 01-09 succeed, BPSC-SUB-10 is rejected", async () => {
    const activeSubjects = [
      "BPSC-SUB-01",
      "BPSC-SUB-02",
      "BPSC-SUB-03",
      "BPSC-SUB-04",
      "BPSC-SUB-05",
      "BPSC-SUB-06",
      "BPSC-SUB-07",
      "BPSC-SUB-08",
      "BPSC-SUB-09",
    ];

    for (const subId of activeSubjects) {
      expect(isSubjectSelectable(subId)).toBe(true);
      const res = await selectTargetTopic({
        subject_id: subId,
        question_type: subId === "BPSC-SUB-08" ? "ESSAY" : "SHORT_ANSWER",
        marks: subId === "BPSC-SUB-08" ? 38 : 8,
      });
      expect(res.target_topic_id).toBeDefined();
      expect(res.target_topic_name).toBeDefined();
    }

    // BPSC-SUB-10 must be unselectable and throw clean error
    expect(isSubjectSelectable("BPSC-SUB-10")).toBe(false);
    expect(isSubjectSelectable("General & Miscellaneous")).toBe(false);

    await expect(
      selectTargetTopic({
        subject_id: "BPSC-SUB-10",
        question_type: "SHORT_ANSWER",
        marks: 8,
      })
    ).rejects.toThrow(/unavailable for practice/);
  });
});
