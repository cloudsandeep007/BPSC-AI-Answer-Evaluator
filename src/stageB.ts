// Stage B - runs per submission, after the student has confirmed their
// transcript.
//
// The judging model **compares only**. What a correct answer contains was
// decided at Stage 0 and is fixed in `model_answers.expected_points`; the
// model's job here is to say which of those points the student made, how well
// they did on each rubric dimension, and what to tell them. It never decides
// the answer, and it never reports a mark.
//
// The mark is computed below, in code, from the model's band labels - see
// content/calibration.ts. That is deliberate: a model asked for a number
// anchors on plausible-looking scores, while the arithmetic here is auditable
// and reproduces BPSC's documented examiner behaviour (verified by
// scripts/verify-calibration.ts).

import { config } from "./config";
import { callGemini, extractJson } from "./gemini";
import { supabase } from "./supabase";
import { SlotType } from "./content/answerTemplates";
import { Band, DimensionScores, computeScore } from "./content/calibration";
import { RUBRIC_V1 } from "./content/rubric";

export const STAGE_B_PROMPT_VERSION = "stageB-v1";

interface ExpectedPoint {
  point: string;
  weight: number;
  cues: string[];
  source: "ncert" | "general_knowledge";
}

interface JudgeOutput {
  dimensions: DimensionScores;
  specificity: Band;
  points_found: Array<{ point: string; evidence: string }>;
  points_missed: Array<{ point: string; why_it_matters: string }>;
  feedback: string;
  todo: string[];
}

export interface EvaluationResult {
  evaluationId: string;
  totalMarks: number;
  maxMarks: number;
  band: Band;
  feedback: string;
  pointsFound: JudgeOutput["points_found"];
  pointsMissed: JudgeOutput["points_missed"];
  todo: string[];
  directiveCapApplied: boolean;
}

function judgePrompt(
  questionText: string,
  transcript: string,
  slotType: SlotType,
  directive: string,
  points: ExpectedPoint[],
  language: string,
): string {
  const pointList = points
    .map((p, i) => `${i + 1}. [${p.source}] ${p.point}\n   cues: ${p.cues.join(", ")}`)
    .join("\n");

  const rubricText = RUBRIC_V1.dimensions
    .map(
      (d) =>
        `### ${d.key} - ${d.label}\n${d.what_it_checks}\n` +
        `  strong: ${d.bands.strong}\n  average: ${d.bands.average}\n  weak: ${d.bands.weak}\n  negligible: ${d.bands.negligible}`,
    )
    .join("\n\n");

  const spec = RUBRIC_V1.specificity;

  return `Mark this BPSC answer by comparing it against the marking key below.

QUESTION: ${questionText}
Directive word: ${directive}
Answer type: ${slotType}

MARKING KEY - the points a full-marks answer contains. This was decided in
advance and is not open to revision. Do not add points to it, remove points
from it, or substitute your own view of what the answer should say:

${pointList}

THE STUDENT'S ANSWER (transcribed from handwriting, so minor spelling and OCR
noise should be ignored - judge the substance):

"""
${transcript}
"""

RUBRIC - assign exactly one band per dimension:

${rubricText}

### specificity - ${spec.label}
${spec.what_it_checks}
  strong: ${spec.bands.strong}
  average: ${spec.bands.average}
  weak: ${spec.bands.weak}
  negligible: ${spec.bands.negligible}

RULES:
1. Do NOT output a mark, score, percentage or grade. Bands only. The marks are
   computed elsewhere and any number you invent will be discarded.
2. Judge only against the key above. If the student writes something correct
   that isn't in the key, it does not earn credit here - note it in feedback.
3. For every point the student missed, say specifically what was missing and
   name the fact - "you never named Article 51A or the 42nd Amendment", not
   "add more detail".
4. Write feedback in ${language}, addressed to the student, in the voice of a
   subject professor returning a marked script. Be direct and specific. 3-5
   sentences.

Return ONLY JSON:
{
  "dimensions": {
    "content": "strong|average|weak|negligible",
    "directive": "strong|average|weak|negligible",
    "structure": "strong|average|weak|negligible",
    "relevance": "strong|average|weak|negligible"
  },
  "specificity": "strong|average|weak|negligible",
  "points_found": [{ "point": "which key point", "evidence": "the student's words that made it" }],
  "points_missed": [{ "point": "which key point", "why_it_matters": "what it was worth and why" }],
  "feedback": "3-5 sentences to the student",
  "todo": ["one concrete thing to do before the next attempt", "..."]
}`;
}

const VALID_BANDS = new Set<Band>(["strong", "average", "weak", "negligible"]);
const asBand = (v: unknown): Band => (VALID_BANDS.has(v as Band) ? (v as Band) : "weak");

/**
 * Grades one confirmed submission and records the result.
 *
 * @param languageLabel the language to write feedback in, e.g. "Hindi"
 */
export async function evaluateSubmission(submissionId: string, languageLabel: string): Promise<EvaluationResult> {
  // 1. Everything the judgement depends on.
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("id, question_id, transcript")
    .eq("id", submissionId)
    .single();
  if (submissionError) throw submissionError;
  if (!submission.transcript) throw new Error(`Submission ${submissionId} has no transcript to grade`);

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id, question_hi, marks")
    .eq("id", submission.question_id)
    .single();
  if (questionError) throw questionError;

  const { data: modelAnswer, error: modelAnswerError } = await supabase
    .from("model_answers")
    .select("version, expected_points")
    .eq("question_id", submission.question_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (modelAnswerError) throw modelAnswerError;
  if (!modelAnswer) throw new Error(`No answer key exists for question ${submission.question_id}`);

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("version")
    .eq("exam", "BPSC")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rubricError) throw rubricError;
  if (!rubric) throw new Error("No active rubric - run `npm run seed`");

  const key = modelAnswer.expected_points as {
    slot_type: SlotType;
    directive: string;
    points: ExpectedPoint[];
  };

  // 2. Ask the model to compare, not to decide.
  const res = await callGemini({
    model: config.geminiJudgeModel,
    system:
      "You are a BPSC examiner marking a script against a fixed marking key. You compare the answer to the key. You never decide what the correct answer is - that was settled before you saw this - and you never award a numeric mark.",
    parts: [
      {
        text: judgePrompt(
          question.question_hi ?? "",
          submission.transcript,
          key.slot_type,
          key.directive,
          key.points ?? [],
          languageLabel,
        ),
      },
    ],
    maxOutputTokens: 4096,
  });

  const judged = extractJson<JudgeOutput>(res.text);
  if (!judged?.dimensions) throw new Error("Stage B: judging model returned no usable dimensions");

  const dimensions: DimensionScores = {
    content: asBand(judged.dimensions.content),
    directive: asBand(judged.dimensions.directive),
    structure: asBand(judged.dimensions.structure),
    relevance: asBand(judged.dimensions.relevance),
  };

  // 3. The mark is ours to compute, not the model's to report.
  const score = computeScore({
    slotType: key.slot_type,
    dimensions,
    specificity: asBand(judged.specificity),
  });

  // 4. Record everything needed to explain this mark later, including which
  //    rubric, key, model and prompt produced it.
  const { data: evaluation, error: evaluationError } = await supabase
    .from("evaluations")
    .insert({
      submission_id: submissionId,
      rubric_version: rubric.version,
      model_answer_version: modelAnswer.version,
      model_name: config.geminiJudgeModel,
      prompt_version: STAGE_B_PROMPT_VERSION,
      dimension_scores: {
        bands: dimensions,
        specificity: asBand(judged.specificity),
        raw_quality: score.rawQuality,
        ceiling: score.ceiling,
        final_fraction: score.finalFraction,
        directive_cap_applied: score.directiveCapApplied,
      },
      points_found: judged.points_found ?? [],
      points_missed: judged.points_missed ?? [],
      total_marks: score.totalMarks,
      feedback_hi: judged.feedback ?? "",
      todo: judged.todo ?? [],
      // A directive cap means the answer was strong but answered the wrong
      // question - worth a human eye before students see many of these.
      flagged_for_human: score.directiveCapApplied,
      latency_ms: res.latencyMs,
      cost_paise: null,
    })
    .select("id")
    .single();
  if (evaluationError) throw evaluationError;

  return {
    evaluationId: evaluation.id as string,
    totalMarks: score.totalMarks,
    maxMarks: score.maxMarks,
    band: score.band,
    feedback: judged.feedback ?? "",
    pointsFound: judged.points_found ?? [],
    pointsMissed: judged.points_missed ?? [],
    todo: judged.todo ?? [],
    directiveCapApplied: score.directiveCapApplied,
  };
}
