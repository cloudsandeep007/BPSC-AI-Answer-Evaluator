import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

interface ProductionQuestion {
  question_id: string;
  year: number | string;
  exam_name: string;
  paper: string;
  section: string;
  question_number: string;
  marks: number | null;
  question_type: string;
  original_question_text: string;
  subject_id: string;
  subject_name: string;
  primary_topic_id: string;
  primary_topic: string;
  source_pdf_name: string;
  page_number: number;
  subject_confidence: number;
  classification_method: string;
  classification_reason: string;
  review_required: boolean;
}

interface TaxonomyTopic {
  topic_id: string;
  subject_id: string;
  topic_name: string;
  description: string;
}

interface TaxonomyTopic {
  topic_id: string;
  subject_id: string;
  topic_name: string;
  description: string;
  parent_subject: string;
}

interface TaxonomyRoot {
  version: string;
  topics: TaxonomyTopic[];
}

const prodQuestionsPath = path.join(process.cwd(), "data", "bpsc_question_bank", "production", "bpsc_questions_production.json");
const taxonomyPath = path.join(process.cwd(), "data", "bpsc_question_bank", "topic_analysis", "topic_taxonomy_v1.json");

describe("BPSC Historical Question Bank Database Query & Verification Suite (Phase 4A)", () => {
  const prodQuestions: ProductionQuestion[] = JSON.parse(fs.readFileSync(prodQuestionsPath, "utf-8"));
  const taxonomyData: TaxonomyRoot = JSON.parse(fs.readFileSync(taxonomyPath, "utf-8"));

  const validSubjectIds = new Set(["BPSC-SUB-01", "BPSC-SUB-02", "BPSC-SUB-03", "BPSC-SUB-04", "BPSC-SUB-05", "BPSC-SUB-06", "BPSC-SUB-07", "BPSC-SUB-08", "BPSC-SUB-09", "BPSC-SUB-10"]);
  const validTopicIds = new Set(taxonomyData.topics.map((t) => t.topic_id));
  const topicToSubjectMap = new Map<string, string>();
  taxonomyData.topics.forEach((t) => {
    topicToSubjectMap.set(t.topic_id, t.subject_id);
  });

  it("should contain exactly 603 valid production historical questions", () => {
    expect(prodQuestions.length).toBe(603);
  });

  it("A. Get all Polity & Governance questions", () => {
    const polityQuestions = prodQuestions.filter((q) => q.subject_id === "BPSC-SUB-02" || q.subject_name === "Polity & Governance");
    expect(polityQuestions.length).toBe(38);
  });

  it("B. Get all Panchayati Raj questions (POLITY-005)", () => {
    const panchayatiRajQuestions = prodQuestions.filter((q) => q.primary_topic_id === "POLITY-005");
    expect(panchayatiRajQuestions.length).toBeGreaterThan(0);
    expect(panchayatiRajQuestions.every((q) => q.primary_topic_id === "POLITY-005")).toBe(true);
  });

  it("C. Get all Judiciary questions (POLITY-002)", () => {
    const judiciaryQuestions = prodQuestions.filter((q) => q.primary_topic_id === "POLITY-002");
    expect(judiciaryQuestions.length).toBeGreaterThan(0);
    expect(judiciaryQuestions.every((q) => q.primary_topic_id === "POLITY-002")).toBe(true);
  });

  it("D. Get all questions from a specific year (2022 / 67th BPSC)", () => {
    const questions2022 = prodQuestions.filter((q) => Number(q.year) === 2022 || String(q.exam_name).includes("67th"));
    expect(questions2022.length).toBeGreaterThan(0);
  });

  it("E. Get all 38-mark questions", () => {
    const questions38 = prodQuestions.filter((q) => q.marks === 38);
    expect(questions38.length).toBeGreaterThan(0);
  });

  it("F. Get all SHORT_ANSWER questions", () => {
    const shortAnsQuestions = prodQuestions.filter((q) => q.question_type === "SHORT_ANSWER");
    expect(shortAnsQuestions.length).toBe(77);
  });

  it("G. Count questions by subject accurately", () => {
    const subjectCounts: Record<string, number> = {};
    prodQuestions.forEach((q) => {
      subjectCounts[q.subject_name] = (subjectCounts[q.subject_name] || 0) + 1;
    });

    expect(subjectCounts["Polity & Governance"]).toBe(38);
    expect(subjectCounts["History, Art & Culture"]).toBe(174);
    expect(Object.keys(subjectCounts).length).toBe(9);
  });

  it("H. Count questions by topic accurately", () => {
    const topicCounts: Record<string, number> = {};
    prodQuestions.forEach((q) => {
      topicCounts[q.primary_topic_id] = (topicCounts[q.primary_topic_id] || 0) + 1;
    });

    expect(Object.keys(topicCounts).length).toBe(29);
    expect(topicCounts["HIST-001"]).toBe(147);
  });

  it("I. Find questions containing a specific phrase ('Governor')", () => {
    const governorQuestions = prodQuestions.filter((q) =>
      q.original_question_text.toLowerCase().includes("governor")
    );
    expect(governorQuestions.length).toBeGreaterThan(0);
  });

  it("J. Retrieve one question and verify its source PDF and page traceability", () => {
    const sample = prodQuestions.find((q) => q.question_id === "BPSC-Q-000001");
    expect(sample).toBeDefined();
    expect(sample?.source_pdf_name).toBeTruthy();
    expect(sample?.page_number).toBeGreaterThan(0);
    expect(sample?.original_question_text).toBeTruthy();
    expect(sample?.year).toBeDefined();
    expect(sample?.paper).toBeDefined();
  });

  it("Database Integrity: No orphan subject or topic IDs, no invalid subject-topic relationships", () => {
    prodQuestions.forEach((q) => {
      expect(validSubjectIds.has(q.subject_id)).toBe(true);
      expect(validTopicIds.has(q.primary_topic_id)).toBe(true);

      const expectedSubject = topicToSubjectMap.get(q.primary_topic_id);
      expect(expectedSubject).toBe(q.subject_id);
    });
  });

  it("Database Integrity: No duplicate question_ids", () => {
    const seenIds = new Set<string>();
    prodQuestions.forEach((q) => {
      expect(seenIds.has(q.question_id)).toBe(false);
      seenIds.add(q.question_id);
    });
  });
});
