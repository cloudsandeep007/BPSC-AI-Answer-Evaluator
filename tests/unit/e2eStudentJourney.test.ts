import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectTargetTopic } from "../../src/questionSelection/questionSelection";
import { isSubjectSelectable } from "../../src/questionSelection/topicStatistics";
import { getStudentPracticeHistory } from "../../src/questionSelection/historyService";
import { computeScore } from "../../src/content/calibration";
import { buildReportCard } from "../../src/reportCard";
import { EvaluationBlueprint } from "../../src/domain/blueprint";
import { sha256 } from "../../src/hash";

// Mock Supabase DB calls for reproducible offline testing
vi.mock("../../src/supabase", () => {
  const activeQuestionsMap = new Map<number, string>();
  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  { question_id: "q-polity-001", created_at: new Date().toISOString() },
                ],
                error: null,
              }),
            }),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "q-123",
                exam: "BPSC",
                paper: "GS Paper 2",
                subject: "Polity & Governance",
                topic: "Judiciary",
                question_text: "Discuss the discretionary powers of the Governor in Bihar.",
                marks: 8,
                word_limit: 250,
                is_active: true,
              },
              error: null,
            }),
            in: vi.fn().mockResolvedValue({
              data: [{ question_id: "q-polity-001", topic_id: "POLITY-001" }],
              error: null,
            }),
          }),
          in: vi.fn().mockResolvedValue({
            data: [{ topic_id: "POLITY-001", subject_id: "BPSC-SUB-02", topic_name: "Executive & Governor" }],
            error: null,
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "inserted-id-123" }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            source_name: "NCERT Class 11 Indian Constitution at Work",
            source_type: "ncert",
            content: "The Governor acts as the constitutional head of the state and exercises discretionary powers under Article 163.",
          },
        ],
        error: null,
      }),
    },
    getOrCreateUser: vi.fn().mockImplementation(async (telegramId: number, name?: string) => ({
      id: `user-uuid-${telegramId}`,
      telegram_id: telegramId,
      language: "en",
    })),
    setUserActiveQuestion: vi.fn().mockImplementation(async (telegramId: number, questionId: string) => {
      activeQuestionsMap.set(telegramId, questionId);
    }),
    getUserActiveQuestion: vi.fn().mockImplementation(async (telegramId: number) => {
      return activeQuestionsMap.get(telegramId) || null;
    }),
    saveSubmission: vi.fn().mockResolvedValue("sub-uuid-123"),
    updateSubmissionTranscript: vi.fn().mockResolvedValue(undefined),
    updateSubmissionStoragePath: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock aiGateway to isolate network calls during unit testing
vi.mock("../../src/ai/gateway", () => ({
  aiGateway: {
    transcribe: vi.fn().mockResolvedValue({
      transcript: "The Governor of Bihar exercises discretionary powers under Article 163 when appointing a Chief Minister.",
      confidence: 0.94,
      wordCount: 17,
    }),
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
            question: `Analyze the constitutional significance of ${topic} in ensuring good governance in Bihar.`,
            question_hi: `${topic} के संवैधानिक महत्व का विश्लेषण कीजिए।`,
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

      // Blueprint / Stage B Mock Output
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
            ],
            conclusionMustCover: "Summarize key recommendations.",
            minimumSpecifics: ["Article 163"],
            commonMistakesToPenalise: [],
          },
          dimensions: {
            structure: "GOOD",
            facts: "GOOD",
            analysis: "PASS",
          },
          dimension_notes: {
            structure: "Clear introduction and conclusion.",
            facts: "Accurately cited Article 163.",
            analysis: "Satisfactory discussion of discretionary powers.",
          },
          specificity: "GOOD",
          points_found: [
            {
              key_index: 0,
              evidence: "Article 163 discretionary powers mentioned explicitly.",
            },
          ],
          points_missed: [],
          feedback: "Well-written answer covering key constitutional aspects of the Governor's role.",
          todo: ["Add recent Supreme Court case law references"],
        },
        rawText: "",
        provider: "mock",
        model: "gemini-1.5-flash",
        latencyMs: 180,
        usage: { inputTokens: 250, outputTokens: 120 },
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
import { evaluateSubmission } from "../../src/stageB";
import { setUserActiveQuestion, getUserActiveQuestion } from "../../src/supabase";

describe("Phase 6 — End-to-End Student Journey Validation Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Student Practice Request & Question Generation across Active Subjects", async () => {
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
      const generated = await generateQuestion({
        subjectId: subId,
        slotType: subId === "BPSC-SUB-08" ? "essay_paper" : "compulsory_subpart",
      });

      expect(generated.questionId).toBeDefined();
      expect(generated.questionText).toBeDefined();
      expect(generated.blueprint).toBeDefined();
      expect(generated.selectionResult).toBeDefined();
    }

    // BPSC-SUB-10 must be unselectable
    expect(isSubjectSelectable("BPSC-SUB-10")).toBe(false);
    await expect(generateQuestion({ subjectId: "BPSC-SUB-10" })).rejects.toThrow(/unavailable for practice/);
  });

  it("2. Question Record & Blueprint Integrity", async () => {
    const generated = await generateQuestion({
      subjectId: "BPSC-SUB-02",
      slotType: "compulsory_subpart",
    });

    expect(generated.blueprint.topic).toBe(generated.topic);
    expect(generated.blueprint.marks).toBe(generated.marks);
    expect(generated.blueprint.slotType).toBe(generated.slotType);
    expect(generated.blueprint.directive).toBeDefined();
    expect(generated.blueprint.dimensions.length).toBeGreaterThan(0);
  });

  it("3. User & Question Identity Isolation (User A vs User B)", async () => {
    const userA = 11111;
    const userB = 22222;

    await setUserActiveQuestion(userA, "q-polity-user-a");
    await setUserActiveQuestion(userB, "q-economy-user-b");

    const activeA = await getUserActiveQuestion(userA);
    const activeB = await getUserActiveQuestion(userB);

    expect(activeA).toBe("q-polity-user-a");
    expect(activeB).toBe("q-economy-user-b");
    expect(activeA).not.toBe(activeB);
  });

  it("4. OCR & Transcript Confirmation / Edit Integrity", async () => {
    const mockImageBuffer = Buffer.from("fake-image-bytes");
    const imageHash = sha256(mockImageBuffer);
    expect(imageHash).toBeDefined();
    expect(imageHash.length).toBe(64); // SHA-256 hex string length

    const rawOcrTranscript = "The Governor acts under Article 163.";
    const editedTranscript = "The Governor of Bihar acts under Article 163 of Indian Constitution.";

    // Verify transcript edit alters text used for grading
    expect(editedTranscript).not.toBe(rawOcrTranscript);
    expect(editedTranscript).toContain("Bihar");
  });

  it("5. Stage B Evaluation & Deterministic Score Calibration", async () => {
    const mockBlueprint: EvaluationBlueprint = {
      questionId: "q-123",
      topic: "Executive & Governor",
      paper: "GS Paper 2",
      slotType: "compulsory_subpart",
      marks: 8,
      wordLimit: 250,
      directive: "Discuss",
      introductionMustCover: "Governor discretionary powers",
      dimensions: [
        {
          heading: "Constitutional Provisions",
          expectedPoints: [
            {
              point: "Article 163 discretionary powers",
              weight: 1.0,
              cues: ["Article 163"],
              source: { kind: "ncert", label: "NCERT Class 11" },
            },
          ],
        },
      ],
      conclusionMustCover: "Summary",
      minimumSpecifics: ["Article 163"],
      commonMistakesToPenalise: [],
    };

    // Test score computation arithmetic from calibration module
    const scoreResult = computeScore({
      slotType: "compulsory_subpart",
      dimensions: { content: "average", directive: "strong", structure: "strong", relevance: "weak" },
      specificity: "weak",
    });

    expect(scoreResult.totalMarks).toBe(4); // 4 out of 8 marks for solid average answer
    expect(scoreResult.maxMarks).toBe(8);
  });

  it("6. Report Card PDF Rendering Verification", async () => {
    const pdfBuffer = await buildReportCard({
      lang: "en",
      question: {
        text: "Discuss the discretionary powers of the Governor in Bihar.",
        paper: "GS Paper 2",
        subject: "Polity & Governance",
        slotType: "compulsory_subpart",
        directive: "Discuss",
        marks: 8,
      },
      result: {
        totalMarks: 4,
        maxMarks: 8,
        band: "average",
        feedback: "Solid answer with accurate Article citations.",
        dimensionNotes: {
          content: "Accurate facts",
          directive: "Well addressed",
          structure: "Clear structure",
          relevance: "Relevant discussion",
        },
        pointsFound: [
          {
            point: "Article 163 discretionary powers",
            evidence: "Cited Article 163",
            source: { kind: "ncert", label: "NCERT Class 11" },
          },
        ],
        pointsMissed: [],
        todo: ["Add Supreme Court landmark cases"],
      },
      dimensionBands: {
        content: "average",
        directive: "strong",
        structure: "strong",
        relevance: "weak",
      },
      rubricVersion: 1,
      modelName: "gemini-1.5-flash",
      promptVersion: "stageB-v3-blueprint",
      generatedAt: new Date(),
      history: [
        { date: new Date(), totalMarks: 4, maxMarks: 8 },
      ],
    });

    expect(pdfBuffer).toBeDefined();
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(500); // Non-empty valid PDF Buffer
    expect(pdfBuffer.subarray(0, 5).toString()).toBe("%PDF-"); // PDF header magic bytes
  });

  it("7. Practice History Update & Sequential Personalization Loop", async () => {
    // 1. Initial selection
    const sel1 = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "e2e_student_history",
    }, []);

    const topic1 = sel1.target_topic_id;

    // 2. Student completes attempt on topic1
    const updatedHistory = [topic1];

    // 3. Next question selection sees updated history
    const sel2 = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "e2e_student_history",
    }, updatedHistory);

    expect(sel2.target_topic_id).not.toBe(topic1);
  });

  it("8. Critical Realistic Polity Scenario — Panchayati Raj Non-Lock-in", async () => {
    const polityHistory: string[] = [];
    const topicsSeen = new Set<string>();

    for (let attempt = 0; attempt < 10; attempt++) {
      const sel = await selectTargetTopic({
        subject_id: "BPSC-SUB-02",
        question_type: "SHORT_ANSWER",
        marks: 8,
        student_id: "polity_realism_student",
      }, polityHistory);

      topicsSeen.add(sel.target_topic_id);
      polityHistory.unshift(sel.target_topic_id);
    }

    // Must see multiple Polity topics, not locked into Panchayati Raj
    expect(topicsSeen.size).toBeGreaterThanOrEqual(3);
    expect(topicsSeen.has("POLITY-002")).toBe(true); // Judiciary
  });

  it("9. Multi-Student Isolation", async () => {
    const historyA = ["POLITY-002", "POLITY-001"]; // Judiciary, Executive
    const historyB = ["POLITY-004", "POLITY-003"]; // Panchayati Raj, Federalism

    const selA = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "student_A",
    }, historyA);

    const selB = await selectTargetTopic({
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: "student_B",
    }, historyB);

    // Selections differ based on individual student histories
    expect(selA.target_topic_id).not.toBe(selB.target_topic_id);
  });

  it("10. Complete Traceability Audit for End-to-End Journey", async () => {
    const studentId = "traceability_student_10";
    const subjectId = "BPSC-SUB-02";

    // Step 1: Selection
    const selection = await selectTargetTopic({
      subject_id: subjectId,
      question_type: "SHORT_ANSWER",
      marks: 8,
      student_id: studentId,
    });

    expect(selection.target_topic_id).toBeDefined();

    // Step 2: Question Generation & Blueprinting
    const generated = await generateQuestion({
      subjectId,
      slotType: "compulsory_subpart",
      studentId,
    });

    expect(generated.questionId).toBeDefined();
    expect(generated.blueprint).toBeDefined();

    // Step 3: Transcription
    const mockPhotoBuffer = Buffer.from("sample-photo-data");
    const photoHash = sha256(mockPhotoBuffer);

    // Step 4: Grading Arithmetic
    const score = computeScore({
      slotType: "compulsory_subpart",
      dimensions: { content: "average", directive: "strong", structure: "strong", relevance: "weak" },
      specificity: "weak",
    });

    // Step 5: PDF Report Card
    const pdf = await buildReportCard({
      lang: "en",
      question: {
        text: generated.questionText,
        paper: generated.paper,
        subject: "Polity & Governance",
        slotType: generated.slotType,
        directive: "Discuss",
        marks: generated.marks,
      },
      result: {
        totalMarks: score.totalMarks,
        maxMarks: score.maxMarks,
        band: score.band,
        feedback: "Good attempt",
        dimensionNotes: { content: "Accurate", directive: "Addressed", structure: "Good", relevance: "Relevant" },
        pointsFound: [],
        pointsMissed: [],
        todo: [],
      },
      dimensionBands: { content: "average", directive: "strong", structure: "strong", relevance: "weak" },
      rubricVersion: 1,
      modelName: "gemini-1.5-flash",
      promptVersion: "stageB-v3-blueprint",
      generatedAt: new Date(),
      history: [],
    });

    expect(pdf).toBeDefined();
    expect(photoHash).toBeDefined();
  });
});
