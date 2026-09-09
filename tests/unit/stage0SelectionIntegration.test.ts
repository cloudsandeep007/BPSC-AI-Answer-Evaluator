import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectTargetTopic } from "../../src/questionSelection/questionSelection";
import { isSubjectSelectable } from "../../src/questionSelection/topicStatistics";

// Mock Supabase DB calls for stage0 testing to run synchronously and reproducibly
vi.mock("../../src/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "test-q-id-123" }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          source_name: "NCERT Class 11 Indian Constitution at Work",
          source_type: "ncert",
          content: "The Judiciary in India is an independent organ protecting fundamental rights and interpreting the Constitution.",
        },
      ],
      error: null,
    }),
  },
}));

// Mock aiGateway to avoid network calls during integration testing
vi.mock("../../src/ai/gateway", () => ({
  aiGateway: {
    callStructured: vi.fn().mockImplementation(async (opts: any) => {
      const feature = opts?.feature;
      const system = opts?.system || "";
      const userPrompt = opts?.userPrompt || "";

      if (feature === "qualityChecker" || system.includes("Chief Examiner")) {
        return {
          data: { score: 9.5, feedback: "Excellent alignment and topic match.", passed: true },
          rawText: "",
          provider: "mock",
          model: "gemini-1.5-flash",
          latencyMs: 50,
          usage: { inputTokens: 50, outputTokens: 20 },
          groundingSources: [],
        };
      }
      if (system.includes("paper-setter") || userPrompt.includes("practice question")) {
        let topic = "Judiciary";
        const match = userPrompt.match(/Topic:\s*([^\n]+)/);
        if (match) topic = match[1].trim();
        return {
          data: {
            question: `Examine the constitutional role and discretionary powers of the ${topic} in ensuring democratic governance in Bihar.`,
            question_hi: `${topic} की संवैधानिक भूमिका की परीक्षा कीजिए।`,
            sub_topic: topic,
          },
          rawText: "",
          provider: "mock",
          model: "gemini-1.5-flash",
          latencyMs: 120,
          usage: { inputTokens: 100, outputTokens: 50 },
          groundingSources: [],
        };
      }
      // Blueprint key generation
      return {
        data: {
          model_answer: "यह एक आदर्श उत्तर है।",
          blueprint: {
            introductionMustCover: "Define constitutional framework and key provisions.",
            dimensions: [
              {
                heading: "Constitutional Provisions",
                expectedPoints: [
                  {
                    point: "Relevant articles and constitutional safeguards",
                    weight: 0.5,
                    cues: ["Articles", "Safeguards"],
                    source: { kind: "ncert", label: "NCERT Class 11" },
                  },
                ],
              },
              {
                heading: "Impact and Bihar Context",
                expectedPoints: [
                  {
                    point: "Application in Bihar governance",
                    weight: 0.5,
                    cues: ["Bihar", "Governance"],
                    source: { kind: "general_knowledge", label: "State Reports" },
                  },
                ],
              },
            ],
            conclusionMustCover: "Summarize key recommendations for reform.",
            minimumSpecifics: ["Must mention relevant Articles"],
            commonMistakesToPenalise: ["Generic answers without article numbers"],
          },
        },
        rawText: "",
        provider: "mock",
        model: "gemini-1.5-flash",
        latencyMs: 150,
        usage: { inputTokens: 200, outputTokens: 100 },
        groundingSources: [],
      };
    }),
  },
}));

// Mock gemini embedText
vi.mock("../../src/gemini", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
}));

import { generateQuestion } from "../../src/stage0";

describe("Stage 0 Question Selection Intelligence Integration Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CASE 1: Polity Short Answer — Selector chooses valid Polity topic and passes to Stage 0", async () => {
    const selection = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "student_case_1",
    });

    expect(selection.subject_id).toBe("BPSC-SUB-02");
    expect(selection.target_topic_id).toBe("POLITY-002");
    expect(selection.target_topic_name).toContain("Judiciary");
    expect(selection.suggested_retrieval_query).toContain("Judiciary");

    const generated = await generateQuestion({
      subjectId: "BPSC-SUB-02",
      slotType: "compulsory_subpart",
      studentId: "student_case_1",
    });

    expect(generated.selectionResult).toBeDefined();
    expect(generated.selectionResult?.target_topic_id).toBe("POLITY-002");
    expect(generated.slotType).toBe("compulsory_subpart");
    expect(generated.marks).toBe(8);
    expect(generated.questionText).toContain("Judiciary");
  });

  it("CASE 2: Polity Long Answer — Question type and marks are preserved", async () => {
    const selection = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "LONG_ANSWER",
      marks: 38,
      student_id: "student_case_2",
    });

    expect(selection.question_type).toBe("LONG_ANSWER");
    expect(selection.marks).toBe(38);

    const generated = await generateQuestion({
      subjectId: "BPSC-SUB-02",
      slotType: "choice_essay",
      studentId: "student_case_2",
    });

    expect(generated.slotType).toBe("choice_essay");
    expect(generated.marks).toBe(38);
  });

  it("CASE 3: Panchayati Raj-Heavy History — Selector chooses alternative topic and Stage 0 follows", async () => {
    const history = ["POLITY-004", "POLITY-004", "POLITY-004", "POLITY-004", "POLITY-004"];

    const selection = await selectTargetTopic(
      {
        subject_id: "BPSC-SUB-02",
        question_type: "SHORT_ANSWER",
        marks: 8,
        student_id: "student_pr_heavy",
      },
      history
    );

    expect(selection.target_topic_id).not.toBe("POLITY-004");

    const generated = await generateQuestion({
      subjectId: "BPSC-SUB-02",
      slotType: "compulsory_subpart",
      studentId: "student_pr_heavy",
      recentTopics: history,
    });

    expect(generated.selectionResult?.target_topic_id).not.toBe("POLITY-004");
  });

  it("CASE 4: BPSC-SUB-10 Rejection — Rejected before Stage 0 with clean error", async () => {
    expect(isSubjectSelectable("BPSC-SUB-10")).toBe(false);

    await expect(
      generateQuestion({
        subjectId: "BPSC-SUB-10",
        slotType: "compulsory_subpart",
      })
    ).rejects.toThrow(/unavailable for practice/);
  });

  it("CASE 5: Dynamic Student History — Selection adapts dynamically", async () => {
    const history1 = ["POLITY-002", "POLITY-001"];
    const history2 = ["POLITY-004", "POLITY-003", "POLITY-002"];

    const sel1 = await selectTargetTopic(
      { subject_id: "BPSC-SUB-02", question_type: "SHORT_ANSWER", marks: 8 },
      history1
    );

    const sel2 = await selectTargetTopic(
      { subject_id: "BPSC-SUB-02", question_type: "SHORT_ANSWER", marks: 8 },
      history2
    );

    expect(sel1.target_topic_id).not.toBe(sel2.target_topic_id);
  });

  it("CASE 6: Same Request + History — 100% Deterministic selection and Stage 0 parameters", async () => {
    const history = ["POLITY-002"];

    const selA = await selectTargetTopic(
      { subject_id: "BPSC-SUB-02", question_type: "SHORT_ANSWER", marks: 8 },
      history
    );
    const selB = await selectTargetTopic(
      { subject_id: "BPSC-SUB-02", question_type: "SHORT_ANSWER", marks: 8 },
      history
    );

    expect(selA.target_topic_id).toBe(selB.target_topic_id);
    expect(selA.selection_score).toBe(selB.selection_score);
    expect(selA.suggested_retrieval_query).toBe(selB.suggested_retrieval_query);
  });

  it("AUDIT: Topic & Question Type Drift Check across 20 End-to-End Simulation Runs", async () => {
    const activeSubjects = [
      { id: "BPSC-SUB-01", name: "History, Art & Culture", defaultType: "SHORT_ANSWER", marks: 8, slot: "compulsory_subpart" },
      { id: "BPSC-SUB-02", name: "Polity & Governance", defaultType: "SHORT_ANSWER", marks: 8, slot: "compulsory_subpart" },
      { id: "BPSC-SUB-03", name: "Economy", defaultType: "LONG_ANSWER", marks: 38, slot: "choice_essay" },
      { id: "BPSC-SUB-04", name: "Geography", defaultType: "SHORT_ANSWER", marks: 8, slot: "compulsory_subpart" },
      { id: "BPSC-SUB-05", name: "Science & Technology", defaultType: "LONG_ANSWER", marks: 38, slot: "choice_essay" },
      { id: "BPSC-SUB-06", name: "Current Affairs & IR", defaultType: "SHORT_ANSWER", marks: 8, slot: "compulsory_subpart" },
      { id: "BPSC-SUB-07", name: "Statistics", defaultType: "SHORT_ANSWER", marks: 8, slot: "compulsory_subpart" },
      { id: "BPSC-SUB-08", name: "Essay", defaultType: "ESSAY", marks: 100, slot: "essay_paper" },
      { id: "BPSC-SUB-09", name: "Geography Optional", defaultType: "LONG_ANSWER", marks: 38, slot: "choice_essay" },
    ];

    let topicDriftCount = 0;
    let typeDriftCount = 0;

    for (let run = 1; run <= 20; run++) {
      const sub = activeSubjects[(run - 1) % activeSubjects.length];

      const selection = await selectTargetTopic({
        subject_id: sub.id,
        question_type: sub.defaultType as any,
        marks: sub.marks,
        student_id: `e2e_student_${run}`,
      });

      const generated = await generateQuestion({
        subjectId: sub.id,
        slotType: sub.slot as any,
        studentId: `e2e_student_${run}`,
      });

      // Verify no topic drift
      if (generated.selectionResult && generated.selectionResult.target_topic_id !== selection.target_topic_id) {
        topicDriftCount++;
      }

      // Verify no question type or marks drift
      if (generated.marks !== sub.marks) {
        typeDriftCount++;
      }
    }

    expect(topicDriftCount).toBe(0);
    expect(typeDriftCount).toBe(0);
  });
});
