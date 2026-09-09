import { SelectionWeights } from "./types";

export const DEFAULT_SELECTION_WEIGHTS: SelectionWeights = {
  historical_relevance: 0.25,
  recency: 0.20,
  question_type_fit: 0.15,
  marks_fit: 0.10,
  student_exposure: 0.20,
  diversity: 0.10,
};

export const SELECTION_CONFIG = {
  currentYear: 2026,
  recentWindowYears: 5,
  maxRepetitionPenalty: 0.50,
  perExposurePenalty: 0.15,
  defaultConfidence: 0.95,
};
