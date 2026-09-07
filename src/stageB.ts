// Stage B - runs per submission, after the student has confirmed their
// transcript.
//
// The judging model **compares only**. What a correct answer contains was
// decided at Stage 0 and is fixed in `model_answers.expected_points`; the
// model's job here is to say which of those points the student made, how well
// they did on each rubric dimension, and what to tell them. It never decides
// the answer, and it never reports a mark.
//
// v2: the stored expected_points list is a consistency guide, not a rigid
// ceiling - a correct, current, or differently-but-validly-argued point the
// student raises that isn't on the list is credited too, with its own
// citation. Points the model claims the student MISSED must reference a
// stored point by index rather than restate its citation from memory, so the
// citation shown to the student is always exactly what Stage 0 assigned, not
// a paraphrase that could drift.
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
import { Citation, asCitation } from "./citation";
import { needsCurrentInfo } from "./stage0";

export const STAGE_B_PROMPT_VERSION = "stageB-v2";

interface ExpectedPoint {
  point: string;
  weight: number;
  cues: string[];
  source: Citation;
}

interface RawFoundPoint {
  key_index?: number;
  point?: string;
  evidence: string;
  source?: unknown;
}
interface RawMissedPoint {
  key_index: number;
  why_it_matters: string;
}

interface JudgeOutput {
  dimensions: DimensionScores;
  dimension_notes: Record<keyof DimensionScores, string>;
  specificity: Band;
  points_found: RawFoundPoint[];
  points_missed: RawMissedPoint[];
  feedback: string;
  todo: string[];
}

export interface ResolvedPointFound {
  point: string;
  evidence: string;
  source: Citation;
}
export interface ResolvedPointMissed {
  point: string;
  why_it_matters: string;
  source: Citation;
}

export interface ScoreTrendPoint {
  date: Date;
  totalMarks: number;
  maxMarks: number;
}

export interface EvaluationResult {
  evaluationId: string;
  totalMarks: number;
  maxMarks: number;
  band: Band;
  feedback: string;
  dimensions: DimensionScores;
  dimensionNotes: Record<keyof DimensionScores, string>;
  pointsFound: ResolvedPointFound[];
  pointsMissed: ResolvedPointMissed[];
  todo: string[];
  directiveCapApplied: boolean;
  // The actual rubric/model/prompt that produced this evaluation - callers
  // should use these, not a hardcoded guess, since they're allowed to change.
  rubricVersion: number;
  modelName: string;
  promptVersion: string;
  // Everything the PDF report card needs about the question itself, so
  // callers don't have to re-fetch what Stage B already looked up.
  question: {
    text: string;
    paper: string;
    subject: string;
    slotType: SlotType;
    directive: string;
    marks: number;
  };
  /** Oldest first. Prior evaluations for this student on the same subject. */
  trend: ScoreTrendPoint[];
}

/**
 * Prior scores for this student on the same subject, oldest first, most
 * recent few only. Three round trips rather than a single joined query -
 * matches how the rest of this codebase queries Supabase (no PostgREST
 * embedding used elsewhere either), and this runs once per evaluation, not
 * in a hot loop.
 */
async function getScoreTrend(userId: string, subject: string, excludeSubmissionId: string): Promise<ScoreTrendPoint[]> {
  const { data: questionsInSubject, error: qErr } = await supabase.from("questions").select("id, marks").eq("subject", subject);
  if (qErr) throw qErr;
  const marksByQuestion = new Map((questionsInSubject ?? []).map((q) => [q.id as string, Number(q.marks)]));
  if (!marksByQuestion.size) return [];

  const { data: pastSubmissions, error: sErr } = await supabase
    .from("submissions")
    .select("id, question_id")
    .eq("user_id", userId)
    .in("question_id", [...marksByQuestion.keys()])
    .neq("id", excludeSubmissionId);
  if (sErr) throw sErr;
  const marksBySubmission = new Map((pastSubmissions ?? []).map((s) => [s.id as string, marksByQuestion.get(s.question_id as string) ?? 0]));
  if (!marksBySubmission.size) return [];

  const { data: pastEvaluations, error: eErr } = await supabase
    .from("evaluations")
    .select("total_marks, created_at, submission_id")
    .in("submission_id", [...marksBySubmission.keys()])
    .order("created_at", { ascending: true })
    .limit(10);
  if (eErr) throw eErr;

  return (pastEvaluations ?? []).map((e) => ({
    date: new Date(e.created_at),
    totalMarks: Number(e.total_marks),
    maxMarks: marksBySubmission.get(e.submission_id as string) ?? 1,
  }));
}

function judgePrompt(
  questionText: string,
  transcript: string,
  slotType: SlotType,
  directive: string,
  points: ExpectedPoint[],
  language: string,
  grounded: boolean,
): string {
  const pointList = points
    .map((p, i) => `${i + 1}. ${p.point}\n   cues: ${p.cues.join(", ")}\n   citation: [${p.source.kind}] ${p.source.label}`)
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

MARKING KEY - numbered so you can reference entries by index. This is the
primary basis for marking, and the reason two students answering the same
question get consistent scores. It is a strong guide, not a rigid ceiling:
if the student makes a point that is correct, more current than what's
listed here, or a validly argued angle the key doesn't cover, credit it too
(see points_found rule 2 below) - do not penalise a good answer just because
it isn't on this list.

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

${grounded ? "Live web search is available - use it to verify or credit anything current the student cites, and to double-check any current-affairs fact yourself before judging it wrong." : ""}

RULES:
1. Do NOT output a mark, score, percentage or grade. Bands only. The marks are
   computed elsewhere and any number you invent will be discarded.
2. points_found: for a stored key point the student made, reference it by
   "key_index" (its number above) plus the "evidence" - the student's own
   words that made it. For a point the student made that ISN'T on the list
   but is correct, current, or a validly argued angle, omit "key_index" and
   instead give "point" (state it) and "source" (a real citation - see the
   citation rules below) - do not silently drop a good point just because
   it's not on the list.
3. points_missed: only for stored key points the student did not make.
   Reference each by "key_index" and explain specifically what was missing
   and why it mattered - "you never named Article 51A or the 42nd
   Amendment", not "add more detail".
4. If you credit a new point not on the list, its citation must be real and
   specific - a named report, ministry, dataset or event (kind
   "general_knowledge"), or an actual source you found via search (kind
   "web", with its real url) - never an invented or vague citation.
5. dimension_notes: one specific sentence per dimension explaining THIS
   answer's band - not a generic description of the band itself.
6. Write feedback in ${language}, addressed to the student, in the voice of a
   subject professor returning a marked script. Weave in citations naturally
   where relevant - e.g. "you didn't mention the 89% informal-sector figure
   (NCERT Class 11 Economics, Indian Economic Development, Ch. 6 -
   Employment)" - not a bare fact list with no reference to check it against.
   3-5 sentences.

Return ONLY JSON:
{
  "dimensions": { "content": "strong|average|weak|negligible", "directive": "...", "structure": "...", "relevance": "..." },
  "dimension_notes": { "content": "...", "directive": "...", "structure": "...", "relevance": "..." },
  "specificity": "strong|average|weak|negligible",
  "points_found": [
    { "key_index": 2, "evidence": "the student's words" },
    { "point": "a valid point not on the list", "evidence": "the student's words", "source": { "kind": "web", "label": "...", "url": "https://..." } }
  ],
  "points_missed": [{ "key_index": 1, "why_it_matters": "what it was worth and why" }],
  "feedback": "3-5 sentences to the student",
  "todo": ["one concrete thing to do before the next attempt", "..."]
}`;
}

const VALID_BANDS = new Set<Band>(["strong", "average", "weak", "negligible"]);
const asBand = (v: unknown): Band => (VALID_BANDS.has(v as Band) ? (v as Band) : "weak");

function resolveFound(raw: RawFoundPoint[], key: ExpectedPoint[]): ResolvedPointFound[] {
  return raw
    .map((r) => {
      if (typeof r.key_index === "number" && key[r.key_index - 1]) {
        const kp = key[r.key_index - 1];
        return { point: kp.point, evidence: r.evidence, source: kp.source };
      }
      if (r.point) return { point: r.point, evidence: r.evidence, source: asCitation(r.source) };
      return null;
    })
    .filter((p): p is ResolvedPointFound => p !== null);
}

function resolveMissed(raw: RawMissedPoint[], key: ExpectedPoint[]): ResolvedPointMissed[] {
  return raw
    .map((r) => {
      const kp = key[r.key_index - 1];
      if (!kp) return null;
      return { point: kp.point, why_it_matters: r.why_it_matters, source: kp.source };
    })
    .filter((p): p is ResolvedPointMissed => p !== null);
}

/**
 * Grades one confirmed submission and records the result.
 *
 * @param languageLabel the language to write feedback in, e.g. "Hindi"
 */
export async function evaluateSubmission(submissionId: string, languageLabel: string): Promise<EvaluationResult> {
  // 1. Everything the judgement depends on.
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("id, question_id, transcript, user_id")
    .eq("id", submissionId)
    .single();
  if (submissionError) throw submissionError;
  if (!submission.transcript) throw new Error(`Submission ${submissionId} has no transcript to grade`);

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id, question_hi, marks, subject, paper")
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

  const rawKey = modelAnswer.expected_points as {
    slot_type: SlotType;
    directive: string;
    points: Array<Omit<ExpectedPoint, "source"> & { source: unknown }>;
  };
  const key: ExpectedPoint[] = (rawKey.points ?? []).map((p) => ({ ...p, source: asCitation(p.source) }));
  const grounded = needsCurrentInfo(question.subject ?? "");

  // 2. Ask the model to compare, not to decide.
  const res = await callGemini({
    model: config.geminiJudgeModel,
    system:
      "You are a BPSC examiner marking a script. The marking key is your primary consistency guide, not a rigid ceiling - a correct, current, or validly argued point beyond it still earns credit, with its own real citation. You never award a numeric mark.",
    parts: [
      {
        text: judgePrompt(
          question.question_hi ?? "",
          submission.transcript,
          rawKey.slot_type,
          rawKey.directive,
          key,
          languageLabel,
          grounded,
        ),
      },
    ],
    maxOutputTokens: 4096,
    search: grounded,
  });

  const judged = extractJson<JudgeOutput>(res.text);
  if (!judged?.dimensions) throw new Error("Stage B: judging model returned no usable dimensions");

  const dimensions: DimensionScores = {
    content: asBand(judged.dimensions.content),
    directive: asBand(judged.dimensions.directive),
    structure: asBand(judged.dimensions.structure),
    relevance: asBand(judged.dimensions.relevance),
  };
  const dimensionNotes = {
    content: judged.dimension_notes?.content ?? "",
    directive: judged.dimension_notes?.directive ?? "",
    structure: judged.dimension_notes?.structure ?? "",
    relevance: judged.dimension_notes?.relevance ?? "",
  };

  const pointsFound = resolveFound(judged.points_found ?? [], key);
  const pointsMissed = resolveMissed(judged.points_missed ?? [], key);

  // 3. The mark is ours to compute, not the model's to report.
  const score = computeScore({
    slotType: rawKey.slot_type,
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
        notes: dimensionNotes,
        specificity: asBand(judged.specificity),
        raw_quality: score.rawQuality,
        ceiling: score.ceiling,
        final_fraction: score.finalFraction,
        directive_cap_applied: score.directiveCapApplied,
        grounded,
      },
      points_found: pointsFound,
      points_missed: pointsMissed,
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

  const trend = await getScoreTrend(submission.user_id, question.subject ?? "", submissionId);

  return {
    evaluationId: evaluation.id as string,
    totalMarks: score.totalMarks,
    maxMarks: score.maxMarks,
    band: score.band,
    feedback: judged.feedback ?? "",
    dimensions,
    dimensionNotes,
    pointsFound,
    pointsMissed,
    todo: judged.todo ?? [],
    directiveCapApplied: score.directiveCapApplied,
    rubricVersion: rubric.version,
    modelName: config.geminiJudgeModel,
    promptVersion: STAGE_B_PROMPT_VERSION,
    question: {
      text: question.question_hi ?? "",
      paper: question.paper ?? "",
      subject: question.subject ?? "",
      slotType: rawKey.slot_type,
      directive: rawKey.directive,
      marks: question.marks ?? score.maxMarks,
    },
    trend,
  };
}
