// How a graded answer becomes a number.
//
// Source: "BPSC - Answer Evaluation and Model-Answer Standard.docx" (SS3-5)
// and "BPSC - Standard Answer Structure and Judging Rules.docx" (SS2).
//
// The single most important thing encoded here: **BPSC examiners mark
// conservatively.** Real evidence from topper copies - the rank-1 candidate
// scored roughly 45-55% on most discursive GS answers, not 80-90%, while
// scoring 83-100% on precise statistical work. A grader that hands out 90%
// for well-written prose would be systematically more generous than BPSC
// itself and would leave students badly miscalibrated about where they stand.
//
// So the model never reports a final mark. It reports band labels per
// dimension plus how specific the content was; the arithmetic below - plain,
// auditable, testable code - turns that into marks.

import { SlotType, maxMarksFor } from "./answerTemplates";

/** What the judging model may return per dimension. Labels, never numbers. */
export type Band = "strong" | "average" | "weak" | "negligible";

/**
 * Quality achieved on a dimension, on its own merits - NOT a BPSC mark.
 *
 * "strong" is 0.95, not 0.9: it means the answer did this dimension about as
 * well as a real student answer ever does. BPSC's conservatism is applied
 * once, by REALISM_CEILING below - deliberately not baked in here as well,
 * which would double-penalise and made the source document's own worked
 * example (a precise 8-mark answer scoring 7-8) unreachable.
 */
export const BAND_QUALITY: Record<Band, number> = {
  strong: 0.95,
  average: 0.6,
  weak: 0.3,
  negligible: 0.05,
};

export const DIMENSIONS = ["content", "directive", "structure", "relevance"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Weights per dimension. From the Answer Evaluation Standard SS4 table:
 * content 55-60%, directive 15-20%, structure 10-15%, relevance 10%.
 * Essays are the documented exception - structure rises to ~30% because an
 * essay is judged on argument-building rather than point coverage.
 */
export const DIMENSION_WEIGHTS: Record<SlotType, Record<Dimension, number>> = {
  compulsory_subpart: { content: 0.58, directive: 0.18, structure: 0.14, relevance: 0.1 },
  choice_essay: { content: 0.58, directive: 0.18, structure: 0.14, relevance: 0.1 },
  essay_paper: { content: 0.45, directive: 0.15, structure: 0.3, relevance: 0.1 },
  statistics_di: { content: 0.58, directive: 0.18, structure: 0.14, relevance: 0.1 },
};

/**
 * The realism ceiling, as a fraction of max marks.
 *
 * `generic` is where a strong-but-unspecific answer tops out. `precise` is
 * reachable only when the content is checklist-matchable - named Acts,
 * correct Article numbers, real figures, named schemes. The gap between them
 * is what "reward specificity heavily" actually means in arithmetic.
 *
 * Short factual sub-parts can legitimately reach near-full marks (the
 * document's own worked example scores a precise answer 7-8 of 8). Discursive
 * answers cannot - 55-68% is topper-tier there, and the ceilings say so.
 */
export const REALISM_CEILING: Record<SlotType, { generic: number; precise: number }> = {
  compulsory_subpart: { generic: 0.62, precise: 0.95 },
  choice_essay: { generic: 0.62, precise: 0.72 },
  essay_paper: { generic: 0.62, precise: 0.7 },
  statistics_di: { generic: 0.7, precise: 1.0 },
};

/**
 * An answer that ignores its directive word is capped regardless of how
 * factually rich it is - "a response that only does one half cannot score
 * above ~50% regardless of quality" (Answer Evaluation Standard, Example A).
 */
export const DIRECTIVE_FAILURE_CAP = 0.5;

export interface DimensionScores {
  content: Band;
  directive: Band;
  structure: Band;
  relevance: Band;
}

export interface ScoreInput {
  slotType: SlotType;
  dimensions: DimensionScores;
  /** How named/precise the content was - drives the ceiling, not the raw score. */
  specificity: Band;
}

export interface ScoreResult {
  totalMarks: number;
  maxMarks: number;
  /** Weighted dimension quality before BPSC realism is applied, 0-1. */
  rawQuality: number;
  /** The realism ceiling that applied, 0-1. */
  ceiling: number;
  /** Fraction of max marks actually awarded. */
  finalFraction: number;
  directiveCapApplied: boolean;
  band: Band;
}

export function computeScore(input: ScoreInput): ScoreResult {
  const { slotType, dimensions, specificity } = input;
  const weights = DIMENSION_WEIGHTS[slotType];
  const maxMarks = maxMarksFor(slotType);

  const rawQuality = DIMENSIONS.reduce(
    (sum, d) => sum + weights[d] * BAND_QUALITY[dimensions[d]],
    0,
  );

  // Specificity slides the ceiling between "strong but generic" and
  // "precise and checklist-matchable".
  const { generic, precise } = REALISM_CEILING[slotType];
  const ceiling = generic + BAND_QUALITY[specificity] * (precise - generic);

  let finalFraction = rawQuality * ceiling;

  const directiveFailed = dimensions.directive === "weak" || dimensions.directive === "negligible";
  if (directiveFailed) finalFraction = Math.min(finalFraction, DIRECTIVE_FAILURE_CAP);

  const totalMarks = Math.round(finalFraction * maxMarks * 2) / 2; // nearest half mark

  return {
    totalMarks,
    maxMarks,
    rawQuality,
    ceiling,
    finalFraction,
    directiveCapApplied: directiveFailed && rawQuality * ceiling > DIRECTIVE_FAILURE_CAP,
    band: bandForFraction(finalFraction),
  };
}

/**
 * Descriptive band for the final mark, using the Answer Evaluation Standard's
 * own thresholds (Example B: strong 55-68%, average 32-50%, weak 11-29%).
 */
export function bandForFraction(fraction: number): Band {
  if (fraction >= 0.52) return "strong";
  if (fraction >= 0.3) return "average";
  if (fraction >= 0.1) return "weak";
  return "negligible";
}
