import fs from "fs";
import path from "path";
import { supabase } from "../supabase";
import { TopicHistoricalStats } from "./types";
import { SELECTION_CONFIG } from "./config";

const SUBJECT_MAP: Record<string, { id: string; name: string; selectable: boolean }> = {
  "BPSC-SUB-01": { id: "BPSC-SUB-01", name: "History, Art & Culture", selectable: true },
  "BPSC-SUB-02": { id: "BPSC-SUB-02", name: "Polity & Governance", selectable: true },
  "BPSC-SUB-03": { id: "BPSC-SUB-03", name: "Economy", selectable: true },
  "BPSC-SUB-04": { id: "BPSC-SUB-04", name: "Geography", selectable: true },
  "BPSC-SUB-05": { id: "BPSC-SUB-05", name: "Science & Technology", selectable: true },
  "BPSC-SUB-06": { id: "BPSC-SUB-06", name: "Current Affairs & IR", selectable: true },
  "BPSC-SUB-07": { id: "BPSC-SUB-07", name: "Statistics", selectable: true },
  "BPSC-SUB-08": { id: "BPSC-SUB-08", name: "Essay", selectable: true },
  "BPSC-SUB-09": { id: "BPSC-SUB-09", name: "Geography Optional", selectable: true },
  // General & Miscellaneous is currently not exposed for practice because it has no production topic taxonomy.
  "BPSC-SUB-10": { id: "BPSC-SUB-10", name: "General & Miscellaneous", selectable: false },
};

// Also map by human-readable subject name
Object.values(SUBJECT_MAP).forEach((val) => {
  SUBJECT_MAP[val.name.toLowerCase()] = val;
});

export function resolveSubject(inputSubject: string): { subject_id: string; subject_name: string } {
  const norm = inputSubject.trim().toLowerCase();
  if (SUBJECT_MAP[norm]) {
    return { subject_id: SUBJECT_MAP[norm].id, subject_name: SUBJECT_MAP[norm].name };
  }
  const match = Object.values(SUBJECT_MAP).find((s) => s.id.toLowerCase() === norm || s.name.toLowerCase().includes(norm));
  if (match) {
    return { subject_id: match.id, subject_name: match.name };
  }
  return { subject_id: inputSubject, subject_name: inputSubject };
}

export function isSubjectSelectable(inputSubject: string): boolean {
  const { subject_id } = resolveSubject(inputSubject);
  const match = SUBJECT_MAP[subject_id];
  if (!match) return true;
  return match.selectable !== false;
}

const prodQuestionsPath = path.resolve(process.cwd(), "data", "bpsc_question_bank", "production", "bpsc_questions_production.json");
const taxonomyPath = path.resolve(process.cwd(), "data", "bpsc_question_bank", "topic_analysis", "topic_taxonomy_v1.json");

const statsCache = new Map<string, { subject_id: string; subject_name: string; statsMap: Map<string, TopicHistoricalStats> }>();

export async function fetchTopicStatisticsForSubject(subjectIdOrName: string): Promise<{
  subject_id: string;
  subject_name: string;
  statsMap: Map<string, TopicHistoricalStats>;
}> {
  const { subject_id, subject_name } = resolveSubject(subjectIdOrName);
  if (statsCache.has(subject_id)) {
    return statsCache.get(subject_id)!;
  }
  const statsMap = new Map<string, TopicHistoricalStats>();

  // Attempt DB query first
  try {
    const { data: topicsData, error: topicsErr } = await supabase
      .from("bpsc_topics")
      .select("topic_id, subject_id, topic_name, description")
      .eq("subject_id", subject_id);

    if (!topicsErr && topicsData && topicsData.length > 0) {
      const topicIds = topicsData.map((t: any) => t.topic_id);
      const { data: questionsData, error: qErr } = await supabase
        .from("bpsc_questions")
        .select("question_id, year, marks, question_type, topic_id")
        .in("topic_id", topicIds);

      if (!qErr && questionsData) {
        topicsData.forEach((t: any) => {
          const qList = questionsData.filter((q: any) => q.topic_id === t.topic_id);
          const stats = calculateStatsFromList(t.topic_id, t.subject_id, t.topic_name, qList);
          statsMap.set(t.topic_id, stats);
        });
        const resObj = { subject_id, subject_name, statsMap };
        if (statsMap.size > 0) statsCache.set(subject_id, resObj);
        return resObj;
      }
    }
  } catch (err: any) {
    // Fall back to production JSON dataset
  }

  // Fallback using data/bpsc_question_bank/ JSON files
  if (fs.existsSync(taxonomyPath) && fs.existsSync(prodQuestionsPath)) {
    const taxonomyData = JSON.parse(fs.readFileSync(taxonomyPath, "utf-8"));
    const prodQuestions = JSON.parse(fs.readFileSync(prodQuestionsPath, "utf-8"));

    const topicNodes = (taxonomyData.topics || []).filter((t: any) => t.subject_id === subject_id || t.parent_subject === subject_name);
    
    topicNodes.forEach((t: any) => {
      const qList = prodQuestions.filter((q: any) => q.primary_topic_id === t.topic_id || q.topic_id === t.topic_id);
      const stats = calculateStatsFromList(t.topic_id, subject_id, t.topic_name, qList);
      statsMap.set(t.topic_id, stats);
    });
  }

  const resObj = { subject_id, subject_name, statsMap };
  if (statsMap.size > 0) statsCache.set(subject_id, resObj);
  return resObj;

}

function calculateStatsFromList(
  topic_id: string,
  subject_id: string,
  topic_name: string,
  qList: any[]
): TopicHistoricalStats {
  const total = qList.length;
  const years = Array.from(new Set(qList.map((q) => Number(q.year)).filter((y) => !isNaN(y) && y > 0)));
  const firstYear = years.length > 0 ? Math.min(...years) : null;
  const lastYear = years.length > 0 ? Math.max(...years) : null;

  const currentYear = SELECTION_CONFIG.currentYear;
  const recentWindow = SELECTION_CONFIG.recentWindowYears;
  const recentCount = qList.filter((q) => Number(q.year) >= currentYear - recentWindow).length;

  const shortAnsCount = qList.filter((q) => String(q.question_type).toUpperCase() === "SHORT_ANSWER").length;
  const longAnsCount = qList.filter((q) => String(q.question_type).toUpperCase() === "LONG_ANSWER").length;
  const essayCount = qList.filter((q) => String(q.question_type).toUpperCase() === "ESSAY").length;

  const marksList = qList.map((q) => Number(q.marks)).filter((m) => !isNaN(m) && m > 0);
  const avgMarks = marksList.length > 0 ? marksList.reduce((a, b) => a + b, 0) / marksList.length : 0;
  const qIds = qList.map((q) => String(q.question_id));

  return {
    topic_id,
    subject_id,
    topic_name,
    total_questions: total,
    unique_years: years.length,
    first_year: firstYear,
    last_year: lastYear,
    recent_question_count: recentCount,
    short_answer_count: shortAnsCount,
    long_answer_count: longAnsCount,
    essay_count: essayCount,
    average_marks: Math.round(avgMarks * 10) / 10,
    question_ids: qIds,
  };
}
