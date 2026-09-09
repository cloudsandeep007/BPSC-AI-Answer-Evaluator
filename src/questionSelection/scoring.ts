import { CandidateTopicScore, FactorScores, QuestionSelectionInput, SelectionWeights, TopicHistoricalStats } from "./types";
import { DEFAULT_SELECTION_WEIGHTS, SELECTION_CONFIG } from "./config";
import { StudentPracticeHistory } from "./historyService";

export function scoreCandidateTopic(
  stats: TopicHistoricalStats,
  maxSubjectQuestions: number,
  input: QuestionSelectionInput,
  studentHistory: StudentPracticeHistory,
  weights: SelectionWeights = DEFAULT_SELECTION_WEIGHTS
): CandidateTopicScore {
  // Check explicit exclusion
  const isExcluded = Boolean(input.exclude_topic_ids && input.exclude_topic_ids.includes(stats.topic_id));

  // 1. Historical Frequency Score
  let freqScore = 0.30;
  if (stats.total_questions > 0 && maxSubjectQuestions > 0) {
    freqScore = Math.log(1 + stats.total_questions) / Math.log(1 + maxSubjectQuestions);
    freqScore = Math.min(1.0, Math.max(0.1, freqScore));
  }

  // 2. Recency Score
  let recencyScore = 0.60;
  if (stats.last_year) {
    const yearsAgo = SELECTION_CONFIG.currentYear - stats.last_year;
    if (yearsAgo >= 5) recencyScore = 1.0;
    else if (yearsAgo === 4) recencyScore = 0.85;
    else if (yearsAgo === 3) recencyScore = 0.70;
    else if (yearsAgo === 2) recencyScore = 0.55;
    else recencyScore = 0.40;
  }

  // 3. Question Type Fit Score
  let qTypeFit = 0.70;
  const targetType = input.question_type.toUpperCase();
  if (targetType === "SHORT_ANSWER") {
    if (stats.short_answer_count > 0 && stats.total_questions > 0) {
      qTypeFit = Math.min(1.0, 0.5 + (stats.short_answer_count / stats.total_questions) * 0.5);
    } else if (stats.total_questions > 0) {
      qTypeFit = 0.50;
    }
  } else if (targetType === "LONG_ANSWER") {
    if (stats.long_answer_count > 0 && stats.total_questions > 0) {
      qTypeFit = Math.min(1.0, 0.5 + (stats.long_answer_count / stats.total_questions) * 0.5);
    } else if (stats.total_questions > 0) {
      qTypeFit = 0.50;
    }
  } else if (targetType === "ESSAY") {
    if (stats.essay_count > 0) qTypeFit = 1.0;
    else qTypeFit = 0.40;
  }

  // 4. Marks Fit Score
  let marksFit = 0.70;
  if (stats.average_marks > 0) {
    const diffRatio = Math.abs(stats.average_marks - input.marks) / Math.max(input.marks, 1);
    marksFit = Math.max(0.20, 1.0 - diffRatio);
  }

  // 5. Student Exposure & Anti-Repetition Penalty
  const recentPractices = studentHistory.topicCounts[stats.topic_id] || 0;
  let exposureScore = 1.0;
  let repPenalty = 0.0;

  if (recentPractices === 1) {
    exposureScore = 0.70;
    repPenalty = SELECTION_CONFIG.perExposurePenalty; // 0.15
  } else if (recentPractices === 2) {
    exposureScore = 0.40;
    repPenalty = SELECTION_CONFIG.perExposurePenalty * 2; // 0.30
  } else if (recentPractices >= 3) {
    exposureScore = 0.10;
    repPenalty = SELECTION_CONFIG.maxRepetitionPenalty; // 0.50
  }

  // 6. Diversity Score
  let diversityScore = 0.70;
  const lastTopicPracticed = studentHistory.recentTopicIds[0];
  if (lastTopicPracticed && lastTopicPracticed === stats.topic_id) {
    diversityScore = 0.20;
  } else if (recentPractices === 0) {
    diversityScore = 1.0;
  }

  // Calculate Weighted Total Score
  const rawWeighted =
    freqScore * weights.historical_relevance +
    recencyScore * weights.recency +
    qTypeFit * weights.question_type_fit +
    marksFit * weights.marks_fit +
    exposureScore * weights.student_exposure +
    diversityScore * weights.diversity;

  let finalScore = isExcluded ? 0.0 : Math.max(0.01, Math.min(1.0, rawWeighted - repPenalty));
  finalScore = Math.round(finalScore * 1000) / 1000;

  const factors: FactorScores = {
    historical_frequency_score: Math.round(freqScore * 100) / 100,
    recency_score: Math.round(recencyScore * 100) / 100,
    question_type_fit_score: Math.round(qTypeFit * 100) / 100,
    marks_fit_score: Math.round(marksFit * 100) / 100,
    student_exposure_score: Math.round(exposureScore * 100) / 100,
    repetition_penalty: Math.round(repPenalty * 100) / 100,
    diversity_score: Math.round(diversityScore * 100) / 100,
  };

  const selection_reason = isExcluded
    ? `Topic explicitly excluded by input filter.`
    : generateExplanation(stats, factors, finalScore, recentPractices, targetType, input.marks);

  return {
    topic_id: stats.topic_id,
    subject_id: stats.subject_id,
    topic_name: stats.topic_name,
    final_score: finalScore,
    selection_reason,
    factors,
    statistics: stats,
  };
}

function generateExplanation(
  stats: TopicHistoricalStats,
  factors: FactorScores,
  finalScore: number,
  recentPractices: number,
  targetType: string,
  targetMarks: number
): string {
  const parts: string[] = [];

  if (stats.total_questions > 0) {
    parts.push(`High historical relevance (${stats.total_questions} past BPSC questions)`);
  } else {
    parts.push(`Standard taxonomy topic`);
  }

  if (factors.recency_score >= 0.85) {
    parts.push(`high recency priority (last asked in ${stats.last_year || "past exams"})`);
  }

  if (factors.question_type_fit_score >= 0.70) {
    parts.push(`strong fit for ${targetType} format`);
  }

  if (recentPractices > 0) {
    parts.push(`penalized for ${recentPractices} recent student practice attempts`);
  } else if (factors.diversity_score >= 0.90) {
    parts.push(`excellent topic diversity (0 recent student exposures)`);
  }

  return `Topic '${stats.topic_name}' scored ${finalScore.toFixed(2)}: ${parts.join("; ")}.`;
}
