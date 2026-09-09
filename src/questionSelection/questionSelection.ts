import { QuestionSelectionInput, QuestionSelectionResult, CandidateTopicScore } from "./types";
import { fetchTopicStatisticsForSubject, isSubjectSelectable, resolveSubject } from "./topicStatistics";
import { getStudentPracticeHistory } from "./historyService";
import { scoreCandidateTopic } from "./scoring";
import { constructRetrievalQuery } from "./queryBuilder";
import { SELECTION_CONFIG } from "./config";

export async function selectTargetTopic(
  input: QuestionSelectionInput,
  explicitRecentTopics?: string[]
): Promise<QuestionSelectionResult> {
  // Validate subject availability
  if (!isSubjectSelectable(input.subject_id)) {
    const { subject_id, subject_name } = resolveSubject(input.subject_id);
    throw new Error(`Subject '${subject_id}' (${subject_name}) is currently unavailable for practice because it has no production topic taxonomy.`);
  }

  // 1. Fetch Subject & Topic Statistics from Database / Staging Data
  const { subject_id, subject_name, statsMap } = await fetchTopicStatisticsForSubject(input.subject_id);

  if (!statsMap || statsMap.size === 0) {
    throw new Error(`No valid topics found for subject '${input.subject_id}' (${subject_name})`);
  }

  // Calculate max total_questions across topics in this subject for log-normalization
  let maxSubjectQuestions = 0;
  statsMap.forEach((stats) => {
    if (stats.total_questions > maxSubjectQuestions) {
      maxSubjectQuestions = stats.total_questions;
    }
  });

  // 2. Fetch Student Practice History
  const studentHistory = await getStudentPracticeHistory(input.student_id, explicitRecentTopics);

  // 3. Score all Candidate Topics
  const candidates: CandidateTopicScore[] = [];
  statsMap.forEach((stats) => {
    // Skip if explicitly excluded in input
    if (input.exclude_topic_ids && input.exclude_topic_ids.includes(stats.topic_id)) {
      return;
    }

    const candidateScore = scoreCandidateTopic(stats, maxSubjectQuestions, input, studentHistory);
    candidates.push(candidateScore);
  });

  if (candidates.length === 0) {
    throw new Error(`All candidate topics for subject '${subject_name}' were excluded by input filters.`);
  }

  // Sort candidates by final_score descending (with deterministic tie-breaker on topic_id)
  candidates.sort((a, b) => {
    if (b.final_score !== a.final_score) {
      return b.final_score - a.final_score;
    }
    return a.topic_id.localeCompare(b.topic_id);
  });

  const winner = candidates[0];
  const suggestedQuery = constructRetrievalQuery(subject_name, winner, input);

  return {
    subject_id,
    subject_name,
    target_topic_id: winner.topic_id,
    target_topic_name: winner.topic_name,
    question_type: input.question_type,
    marks: input.marks,
    selection_score: winner.final_score,
    selection_reason: winner.selection_reason,
    factors: winner.factors,
    historical_statistics: winner.statistics,
    confidence: SELECTION_CONFIG.defaultConfidence,
    candidate_topics: candidates,
    suggested_retrieval_query: suggestedQuery,
  };
}
