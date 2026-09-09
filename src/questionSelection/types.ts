export interface QuestionSelectionInput {
  subject_id: string; // e.g. 'BPSC-SUB-02' or 'Polity & Governance'
  question_type: "SHORT_ANSWER" | "LONG_ANSWER" | "ESSAY" | "DATA_INTERPRETATION" | "PRELIMS_MCQ" | "OTHER";
  marks: number;
  student_id?: string;
  exclude_question_ids?: string[];
  exclude_topic_ids?: string[];
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  language?: string;
}

export interface TopicHistoricalStats {
  topic_id: string;
  subject_id: string;
  topic_name: string;
  total_questions: number;
  unique_years: number;
  first_year: number | null;
  last_year: number | null;
  recent_question_count: number; // Questions in last 5 years (2020-2026)
  short_answer_count: number;
  long_answer_count: number;
  essay_count: number;
  average_marks: number;
  question_ids: string[];
}

export interface FactorScores {
  historical_frequency_score: number; // 0.0 to 1.0
  recency_score: number;              // 0.0 to 1.0
  question_type_fit_score: number;     // 0.0 to 1.0
  marks_fit_score: number;             // 0.0 to 1.0
  student_exposure_score: number;      // 0.0 to 1.0 (1.0 = no exposure, 0.0 = high exposure)
  repetition_penalty: number;          // 0.0 to 0.50 penalty
  diversity_score: number;             // 0.0 to 1.0
}

export interface CandidateTopicScore {
  topic_id: string;
  subject_id: string;
  topic_name: string;
  final_score: number;
  selection_reason: string;
  factors: FactorScores;
  statistics: TopicHistoricalStats;
}

export interface QuestionSelectionResult {
  subject_id: string;
  subject_name: string;
  target_topic_id: string;
  target_topic_name: string;
  question_type: string;
  marks: number;
  selection_score: number;
  selection_reason: string;
  factors: FactorScores;
  historical_statistics: TopicHistoricalStats;
  confidence: number;
  candidate_topics: CandidateTopicScore[];
  suggested_retrieval_query: string;
}

export interface SelectionWeights {
  historical_relevance: number; // 0.25
  recency: number;              // 0.20
  question_type_fit: number;    // 0.15
  marks_fit: number;            // 0.10
  student_exposure: number;     // 0.20
  diversity: number;            // 0.10
}
