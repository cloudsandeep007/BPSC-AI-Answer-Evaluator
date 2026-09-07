// Stage 0 - runs once per question, before any student sees it.
//
// Generates a fresh BPSC-style question and its answer key, then activates it.
// Nothing here runs per-submission: deciding what a correct answer contains
// happens once, so every student answering the same question is measured
// against the same key.

import { config } from "./config";
import { callGemini, extractJson } from "./gemini";
import { supabase } from "./supabase";
import { ANSWER_TEMPLATES, SlotType, SUPPORTED_SLOT_TYPES, maxMarksFor } from "./content/answerTemplates";
import patterns from "./content/question-patterns.json";
import ncert from "./content/ncert-knowledge.json";

export const STAGE0_PROMPT_VERSION = "stage0-v1";

const GENERATION_MODEL = process.env.GEMINI_GENERATION_MODEL ?? config.geminiModel;

// A generated question this similar to a historical one is treated as a copy
// and rejected. The question bank is style data; serving it back verbatim is
// explicitly not allowed.
const MAX_SIMILARITY_TO_HISTORICAL = 0.6;

interface ExpectedPoint {
  point: string;
  weight: number;
  cues: string[];
  source: "ncert" | "general_knowledge";
}

export interface GeneratedQuestion {
  questionId: string;
  modelAnswerId: string;
  questionText: string;
  topic: string;
  paper: string;
  slotType: SlotType;
  marks: number;
  wordLimit: number;
  expectedPoints: ExpectedPoint[];
}

// ------------------------------------------------------------- sampling

function weightedPick<T extends string>(counts: Record<T, number>): T {
  const entries = Object.entries(counts) as [T, number][];
  const total = entries.reduce((s, [, n]) => s + n, 0);
  let r = Math.random() * total;
  for (const [key, n] of entries) {
    r -= n;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/**
 * Picks a paper, topic and slot type in the proportions the real exam uses,
 * taken from the 237-question bank rather than invented.
 */
function pickSlot(): { paper: string; topic: string; slotType: SlotType; directive: string } {
  const byPaper = patterns.distribution.topic_by_paper as Record<string, Record<string, number>>;
  const paperCounts = Object.fromEntries(
    Object.entries(byPaper).map(([p, topics]) => [p, Object.values(topics).reduce((s, n) => s + n, 0)]),
  ) as Record<string, number>;

  const paper = weightedPick(paperCounts);
  const topic = weightedPick(byPaper[paper]);

  const slotType: SlotType = paper === "Essay Paper" ? "essay_paper" : Math.random() < 0.5 ? "compulsory_subpart" : "choice_essay";

  const directives = (patterns.distribution.directive_by_topic as Record<string, Record<string, number>>)[topic] ?? {
    Discuss: 1,
  };
  // "Other" is a catch-all in the source data, not a usable instruction.
  const usable = Object.fromEntries(Object.entries(directives).filter(([d]) => d !== "Other"));
  const directive = weightedPick(Object.keys(usable).length ? usable : { Discuss: 1 });

  return { paper, topic, slotType: SUPPORTED_SLOT_TYPES.includes(slotType) ? slotType : "choice_essay", directive };
}

// --------------------------------------------------- historical similarity

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Jaccard overlap of word sets - order-insensitive, cheap, good enough to catch a rephrased copy. */
function similarity(a: string, b: string): number {
  const sa = new Set(normalise(a).split(" ").filter((w) => w.length > 3));
  const sb = new Set(normalise(b).split(" ").filter((w) => w.length > 3));
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  return shared / (sa.size + sb.size - shared);
}

function closestHistorical(candidate: string, topic: string): { score: number; text: string } {
  let best = { score: 0, text: "" };
  for (const q of patterns.questions as Array<{ topic: string; text: string }>) {
    if (q.topic !== topic) continue;
    const score = similarity(candidate, q.text);
    if (score > best.score) best = { score, text: q.text };
  }
  return best;
}

// ------------------------------------------------------- NCERT retrieval

/** The first-priority fact source. Empty for topics NCERT doesn't reach. */
function ncertFor(topic: string): Array<{ heading: string; text: string }> {
  return (ncert.entries as Array<{ topic: string; heading: string; text: string }>)
    .filter((e) => e.topic === topic)
    .map(({ heading, text }) => ({ heading, text }));
}

// -------------------------------------------------------------- prompts

function questionPrompt(slot: ReturnType<typeof pickSlot>, template: (typeof ANSWER_TEMPLATES)[SlotType]): string {
  const examples = (patterns.questions as Array<{ topic: string; directive: string; text: string }>)
    .filter((q) => q.topic === slot.topic)
    .slice(0, 6)
    .map((q) => `- [${q.directive}] ${q.text}`)
    .join("\n");

  return `Write ONE new practice question for the BPSC Mains exam.

Paper: ${slot.paper}
Topic: ${slot.topic}
Answer type: ${template.label} (${template.marks.max} marks, ${template.words.min}-${template.words.max} words)
Directive word to use: ${slot.directive}

These are real past BPSC questions on this topic. They show you the house style,
phrasing and difficulty. They are NOT to be reused:

${examples}

RULES:
1. Write a genuinely NEW question. Do not reproduce, translate or lightly reword any question above. A different question about the same sub-topic is fine; the same question with synonyms swapped is not.
2. Use the directive word "${slot.directive}" so the answer type is unambiguous.
3. Match BPSC's register: plain, examiner-like, no rhetorical flourish.
4. Where the topic naturally allows it, give the question a Bihar focus - several BPSC syllabus lines carry one explicitly.
5. The question must be answerable in ${template.words.min}-${template.words.max} words by a candidate writing by hand.

Return ONLY JSON:
{
  "question": "the question text, in English",
  "question_hi": "the same question in Hindi",
  "sub_topic": "the specific sub-topic this covers, 2-5 words"
}`;
}

function expectedPointsPrompt(
  questionText: string,
  slot: ReturnType<typeof pickSlot>,
  template: (typeof ANSWER_TEMPLATES)[SlotType],
  ncertEntries: Array<{ heading: string; text: string }>,
): string {
  const ncertBlock = ncertEntries.length
    ? ncertEntries.map((e) => `### ${e.heading}\n${e.text}`).join("\n\n")
    : "(No NCERT content available for this topic - use your general knowledge, and mark every point as general_knowledge.)";

  return `Build the marking key for this BPSC question.

QUESTION: ${questionText}
Directive: ${slot.directive}
Answer type: ${template.label} - ${template.marks.max} marks, ${template.words.min}-${template.words.max} words
Expected structure: ${template.structure.join(" | ")}

NCERT SOURCE MATERIAL (highest-authority facts - prefer these over your own
knowledge wherever they overlap, and mark any point drawn from them as "ncert"):

${ncertBlock}

Produce the specific points a full-marks answer would contain. For each point:
- state the point as the specific fact itself, naming the Act, Article, scheme,
  figure, place or date - not a vague topic label
- give it a weight (all weights must sum to 1.0)
- list 2-4 "cues": words or phrases whose presence in a student's answer shows
  they made that point, including likely Hindi equivalents
- say whether it came from the NCERT material above ("ncert") or your own
  knowledge ("general_knowledge")

Aim for ${template.slotType === "compulsory_subpart" ? "4-6" : "7-10"} points.

Return ONLY JSON:
{
  "model_answer": "a model answer of ${template.words.min}-${template.words.max} words, in Hindi",
  "expected_points": [
    { "point": "...", "weight": 0.2, "cues": ["...", "..."], "source": "ncert" }
  ]
}`;
}

// ----------------------------------------------------------------- main

/**
 * Generates a question and its answer key, saving both. The question is only
 * marked active once the answer key exists - a live question with no key
 * would be ungradeable.
 */
export async function generateQuestion(): Promise<GeneratedQuestion> {
  const slot = pickSlot();
  const template = ANSWER_TEMPLATES[slot.slotType];

  // 1. Generate the question, rejecting anything too close to a real one.
  let questionText = "";
  let questionHi = "";
  let subTopic = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await callGemini({
      model: GENERATION_MODEL,
      system:
        "You are a BPSC Mains paper-setter. You write original exam questions in the commission's house style. You never reuse a past question.",
      parts: [{ text: questionPrompt(slot, template) }],
      maxOutputTokens: 1024,
    });
    const parsed = extractJson<{ question: string; question_hi: string; sub_topic: string }>(res.text);
    if (!parsed?.question) continue;

    const closest = closestHistorical(parsed.question, slot.topic);
    if (closest.score >= MAX_SIMILARITY_TO_HISTORICAL) {
      console.warn(
        `Stage 0: rejected generated question (similarity ${closest.score.toFixed(2)} to a historical one), retrying`,
      );
      continue;
    }

    questionText = parsed.question;
    questionHi = parsed.question_hi || parsed.question;
    subTopic = parsed.sub_topic || slot.topic;
    break;
  }

  if (!questionText) throw new Error("Stage 0: could not generate an original question after 3 attempts");

  // 2. Save it, inactive - it has no answer key yet.
  const marks = maxMarksFor(slot.slotType);
  const { data: questionRow, error: questionError } = await supabase
    .from("questions")
    .insert({
      exam: "BPSC",
      paper: slot.paper,
      subject: slot.topic,
      topic: subTopic,
      question_hi: questionHi,
      marks,
      word_limit: template.words.max,
      is_active: false,
    })
    .select("id")
    .single();
  if (questionError) throw questionError;
  const questionId = questionRow.id as string;

  // 3. Build the answer key, NCERT first.
  const ncertEntries = ncertFor(slot.topic);
  const keyRes = await callGemini({
    model: GENERATION_MODEL,
    system:
      "You are a BPSC subject expert building a marking key. You prefer NCERT-sourced facts over your own knowledge whenever both cover the same ground, and you label which is which honestly.",
    parts: [{ text: expectedPointsPrompt(questionText, slot, template, ncertEntries) }],
    maxOutputTokens: 4096,
  });

  const key = extractJson<{ model_answer: string; expected_points: ExpectedPoint[] }>(keyRes.text);
  if (!key?.expected_points?.length) {
    throw new Error(`Stage 0: no expected_points generated for question ${questionId}`);
  }

  const { data: answerRow, error: answerError } = await supabase
    .from("model_answers")
    .insert({
      question_id: questionId,
      version: 1,
      model_answer_hi: key.model_answer ?? null,
      expected_points: {
        slot_type: slot.slotType,
        directive: slot.directive,
        prompt_version: STAGE0_PROMPT_VERSION,
        model_name: GENERATION_MODEL,
        ncert_entries_used: ncertEntries.map((e) => e.heading),
        points: key.expected_points,
      },
    })
    .select("id")
    .single();
  if (answerError) throw answerError;

  // 4. Both rows exist - now it is safe to serve.
  const { error: activateError } = await supabase.from("questions").update({ is_active: true }).eq("id", questionId);
  if (activateError) throw activateError;

  return {
    questionId,
    modelAnswerId: answerRow.id as string,
    questionText,
    topic: slot.topic,
    paper: slot.paper,
    slotType: slot.slotType,
    marks,
    wordLimit: template.words.max,
    expectedPoints: key.expected_points,
  };
}

/** The question a student should be answering: the newest active real one. */
export async function getActiveQuestion(): Promise<{
  id: string;
  question_hi: string;
  marks: number;
  word_limit: number;
} | null> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, question_hi, marks, word_limit")
    .eq("is_active", true)
    .neq("id", config.placeholderQuestionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
