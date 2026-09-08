// Stage 0 - runs once per question, before any student sees it.
//
// Generates a fresh BPSC-style question and its answer key, then activates it.
// Nothing here runs per-submission: deciding what a correct answer contains
// happens once, so every student answering the same question is measured
// against the same key.

import { config } from "./config";
import { aiGateway } from "./ai/gateway";
import { supabase } from "./supabase";
import { ANSWER_TEMPLATES, SlotType, SUPPORTED_SLOT_TYPES, maxMarksFor } from "./content/answerTemplates";
import { Citation, asCitation } from "./citation";
import patterns from "./content/question-patterns.json";
import ncert from "./content/ncert-knowledge.json";
import { EvaluationBlueprint, BlueprintDimension } from "./domain/blueprint";
import { checkQuestionQuality } from "./ai/agents/qualityChecker";

// v2: the model now reasons as a subject professor deciding what an ideal
// answer requires (NCERT first, own knowledge second, live search third for
// topics where current developments matter) rather than filling a template,
// and every point carries a real citation instead of a bare "ncert" /
// "general_knowledge" tag.
export const STAGE0_PROMPT_VERSION = "stage0-v3-blueprint";

const GENERATION_MODEL = process.env.GEMINI_GENERATION_MODEL ?? config.geminiModel;

// A generated question this similar to a historical one is treated as a copy
// and rejected. The question bank is style data; serving it back verbatim is
// explicitly not allowed.
const MAX_SIMILARITY_TO_HISTORICAL = 0.6;

// Topics where a frozen training-data answer would go stale fast enough to
// matter. Deliberately a fixed list rather than a per-question classifier
// call - the brief names these two explicitly ("almost always true for
// Current Affairs... sometimes true elsewhere - e.g. Science & Tech"), and a
// classifier would add a second Gemini round-trip to every generated
// question. Revisit if finer-grained judgement turns out to be worth that
// cost.
const GROUNDED_TOPICS = new Set(["Current Affairs", "Science & Technology"]);
export function needsCurrentInfo(topic: string): boolean {
  return GROUNDED_TOPICS.has(topic);
}

export interface ExpectedPoint {
  point: string;
  weight: number;
  cues: string[];
  source: Citation;
}

export interface GeneratedQuestion {
  questionId: string;
  modelAnswerId: string;
  blueprintId: string;
  blueprint: EvaluationBlueprint;
  questionText: string;
  topic: string;
  paper: string;
  slotType: SlotType;
  marks: number;
  wordLimit: number;
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
/** Every topic the ingested question bank covers, and which paper it belongs to. */
export const TOPIC_TO_PAPER: Record<string, string> = Object.fromEntries(
  Object.entries(patterns.distribution.topic_by_paper as Record<string, Record<string, number>>).flatMap(
    ([paper, topics]) => Object.keys(topics).map((topic) => [topic, paper]),
  ),
);
export const AVAILABLE_TOPICS = Object.keys(TOPIC_TO_PAPER);

function pickDirective(topic: string): string {
  const directives = (patterns.distribution.directive_by_topic as Record<string, Record<string, number>>)[topic] ?? {
    Discuss: 1,
  };
  // "Other" is a catch-all in the source data, not a usable instruction.
  const usable = Object.fromEntries(Object.entries(directives).filter(([d]) => d !== "Other"));
  return weightedPick(Object.keys(usable).length ? usable : { Discuss: 1 });
}

/** Random topic/slot, weighted by how often that combination appears in the real exam. */
function pickSlot(): { paper: string; topic: string; slotType: SlotType; directive: string } {
  const byPaper = patterns.distribution.topic_by_paper as Record<string, Record<string, number>>;
  const paperCounts = Object.fromEntries(
    Object.entries(byPaper).map(([p, topics]) => [p, Object.values(topics).reduce((s, n) => s + n, 0)]),
  ) as Record<string, number>;

  const paper = weightedPick(paperCounts);
  const topic = weightedPick(byPaper[paper]);
  const slotType: SlotType = paper === "Essay Paper" ? "essay_paper" : Math.random() < 0.5 ? "compulsory_subpart" : "choice_essay";

  return { paper, topic, slotType: SUPPORTED_SLOT_TYPES.includes(slotType) ? slotType : "choice_essay", directive: pickDirective(topic) };
}

/** A student-chosen topic/slot, rather than a random one. Essay topic forces essay_paper. */
function fixedSlot(topic: string, slotType: SlotType): { paper: string; topic: string; slotType: SlotType; directive: string } {
  const paper = TOPIC_TO_PAPER[topic];
  if (!paper) throw new Error(`Unknown topic: ${topic}`);
  return { paper, topic, slotType, directive: pickDirective(topic) };
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
function ncertFor(topic: string): Array<{ heading: string; citation: string; text: string }> {
  return (ncert.entries as Array<{ topic: string; heading: string; citation: string; text: string }>)
    .filter((e) => e.topic === topic)
    .map(({ heading, citation, text }) => ({ heading, citation, text }));
}

// -------------------------------------------------------------- prompts

function questionPrompt(
  slot: ReturnType<typeof pickSlot>,
  template: (typeof ANSWER_TEMPLATES)[SlotType],
  grounded: boolean,
): string {
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
${grounded ? `6. This is a ${slot.topic} question - use live search to ground it in a genuinely current, real development (a recent scheme, event, report or policy). A generic evergreen framing that ignores anything current defeats the point of this being a Current Affairs / Science & Tech question.` : ""}

Return ONLY JSON:
{
  "question": "the question text, in English",
  "question_hi": "the same question in Hindi",
  "sub_topic": "the specific sub-topic this covers, 2-5 words"
}`;
}

function blueprintPrompt(
  questionText: string,
  slot: ReturnType<typeof pickSlot>,
  template: (typeof ANSWER_TEMPLATES)[SlotType],
  ncertEntries: Array<{ heading: string; citation: string; text: string }>,
  grounded: boolean,
): string {
  const ncertBlock = ncertEntries.length
    ? ncertEntries
        .map((e) => `### ${e.heading}\nCitation to use verbatim if you draw on this: ${e.citation}\n${e.text}`)
        .join("\n\n")
    : "(No NCERT content available for this topic.)";

  return `You are an experienced BPSC subject professor deciding, from first principles, what a genuinely ideal answer to this question requires. You are building an Evaluation Blueprint.

QUESTION: ${questionText}
Directive: ${slot.directive}
Answer type: ${template.label} - ${template.marks.max} marks, ${template.words.min}-${template.words.max} words
Expected structure: ${template.structure.join(" | ")}

Reason in this order:
1. Check the NCERT material below first for anything it covers on this topic.
2. For anything NCERT doesn't reach, use your own broader subject knowledge.
3. ${
    grounded
      ? `Live web search is available for this call - use it to bring in genuinely current developments.`
      : "This question does not need live search."
  }
4. Produce a structured blueprint an examiner would use to grade this answer.

NCERT SOURCE MATERIAL:
${ncertBlock}

For each expected point:
- state the point as the specific fact itself
- give it a weight (weights across all dimensions must sum to 1.0)
- list 2-4 cues
- give it a REAL, SPECIFIC citation (kind "ncert", "web", or "general_knowledge"). If web, include URL. If general_knowledge, name the specific report/dataset.

Return ONLY JSON matching this structure:
{
  "model_answer": "a model answer in Hindi",
  "blueprint": {
    "introductionMustCover": "What the intro must define or frame",
    "dimensions": [
      {
        "heading": "Dimension 1 (e.g., Constitutional Framework)",
        "expectedPoints": [
          { "point": "...", "weight": 0.2, "cues": ["..."], "source": { "kind": "ncert", "label": "..." } }
        ]
      }
    ],
    "conclusionMustCover": "What the conclusion must resolve based on the directive",
    "minimumSpecifics": ["Must mention Article 14", "Must mention scheme XYZ"],
    "commonMistakesToPenalise": ["Confusing X with Y", "Not covering the second half of the question"]
  }
}`;
}

// ----------------------------------------------------------------- main

export interface QuestionChoice {
  topic: string;
  slotType: SlotType;
}

/**
 * Generates a question and its answer key, saving both. The question is only
 * marked active once the answer key exists - a live question with no key
 * would be ungradeable.
 *
 * Always generates a NEW question - it does not check for or reuse any
 * existing active one. Callers decide when a fresh question is wanted;
 * reusing "whatever is already active" was the earlier bug that served every
 * student the same question forever after the first generation.
 *
 * @param choice omit for a random topic/slot weighted by the real exam's
 *   distribution; pass one to generate for a student-chosen topic and marks
 *   type instead.
 */
export async function generateQuestion(choice?: QuestionChoice): Promise<GeneratedQuestion> {
  const slot = choice ? fixedSlot(choice.topic, choice.slotType) : pickSlot();
  const template = ANSWER_TEMPLATES[slot.slotType];
  const grounded = needsCurrentInfo(slot.topic);

  // 1. Generate the question and its blueprint, validating both.
  let questionText = "";
  let questionHi = "";
  let subTopic = "";
  let validBlueprint: EvaluationBlueprint | null = null;
  let modelAnswerString = "";
  let ncertEntriesUsed: string[] = [];
  let groundingSourcesFound: any[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await aiGateway.callStructured<{ question: string; question_hi: string; sub_topic: string }>({
      feature: "stage0",
      model: GENERATION_MODEL,
      system:
        "You are a BPSC Mains paper-setter. You write original exam questions in the commission's house style. You never reuse a past question.",
      userPrompt: questionPrompt(slot, template, grounded),
      maxOutputTokens: 1024,
      search: grounded,
    });
    const parsed = res.data;
    if (!parsed?.question) continue;

    const closest = closestHistorical(parsed.question, slot.topic);
    if (closest.score >= MAX_SIMILARITY_TO_HISTORICAL) {
      console.warn(
        `Stage 0: rejected generated question (similarity ${closest.score.toFixed(2)} to a historical one), retrying`,
      );
      continue;
    }

    const draftQuestion = parsed.question;
    const ncertEntries = ncertFor(slot.topic);
    ncertEntriesUsed = ncertEntries.map(e => e.citation);

    // Build the blueprint
    const keyRes = await aiGateway.callStructured<{
      model_answer: string;
      blueprint: Omit<EvaluationBlueprint, "questionId" | "topic" | "paper" | "slotType" | "marks" | "wordLimit" | "directive">;
    }>({
      feature: "stage0",
      model: GENERATION_MODEL,
      system:
        "You are a BPSC subject expert building a marking key. You prefer NCERT-sourced facts over your own knowledge whenever both cover the same ground, and every point you produce carries a real, checkable citation.",
      userPrompt: blueprintPrompt(draftQuestion, slot, template, ncertEntries, grounded),
      maxOutputTokens: 4096,
      search: grounded,
    });

    const key = keyRes.data;
    if (!key?.blueprint?.dimensions?.length) continue;

    groundingSourcesFound = keyRes.groundingSources;

    const draftBlueprint: EvaluationBlueprint = {
      ...key.blueprint,
      questionId: "pending",
      topic: slot.topic,
      paper: slot.paper,
      slotType: slot.slotType,
      marks: maxMarksFor(slot.slotType),
      wordLimit: template.words.max,
      directive: slot.directive,
    };

    // Quality check
    const ncertContextStr = ncertEntries.map(e => e.text).join("\\n");
    const quality = await checkQuestionQuality(draftQuestion, draftBlueprint, ncertContextStr);
    
    if (!quality.passed) {
      console.warn(`Stage 0: rejected question by Quality Checker (score ${quality.score}): ${quality.feedback}. Retrying...`);
      continue;
    }

    // Passed!
    questionText = draftQuestion;
    questionHi = parsed.question_hi || draftQuestion;
    subTopic = parsed.sub_topic || slot.topic;
    validBlueprint = draftBlueprint;
    modelAnswerString = key.model_answer;
    break;
  }

  if (!questionText || !validBlueprint) {
    throw new Error("Stage 0: could not generate a quality question and blueprint after 3 attempts");
  }

  // 2. Save the question, inactive.
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
  validBlueprint.questionId = questionId;

  // 3. Save the blueprint and the legacy model_answer
  const blueprintId = crypto.randomUUID();
  const { error: bpError } = await supabase.from("evaluation_blueprints").insert({
    id: blueprintId,
    question_id: questionId,
    topic: validBlueprint.topic,
    paper: validBlueprint.paper,
    slot_type: validBlueprint.slotType,
    marks: validBlueprint.marks,
    word_limit: validBlueprint.wordLimit,
    directive: validBlueprint.directive,
    introduction_must_cover: validBlueprint.introductionMustCover || "",
    dimensions_json: JSON.stringify(validBlueprint.dimensions),
    conclusion_must_cover: validBlueprint.conclusionMustCover || "",
    minimum_specifics_json: JSON.stringify(validBlueprint.minimumSpecifics || []),
    common_mistakes_to_penalise_json: JSON.stringify(validBlueprint.commonMistakesToPenalise || [])
  });
  if (bpError) throw bpError;

  // Re-flatten expectedPoints for backward compatibility in model_answers table
  const flattenedPoints: ExpectedPoint[] = [];
  for (const dim of validBlueprint.dimensions) {
    for (const p of dim.expectedPoints) {
      flattenedPoints.push({
        point: p.point,
        weight: p.weight,
        cues: p.cues ?? [],
        source: asCitation(p.source)
      });
    }
  }

  const { data: answerRow, error: answerError } = await supabase
    .from("model_answers")
    .insert({
      question_id: questionId,
      version: 1,
      model_answer_hi: modelAnswerString ?? null,
      expected_points: {
        slot_type: slot.slotType,
        directive: slot.directive,
        prompt_version: STAGE0_PROMPT_VERSION,
        model_name: GENERATION_MODEL,
        grounded,
        ncert_entries_used: ncertEntriesUsed,
        grounding_sources: groundingSourcesFound,
        points: flattenedPoints,
      },
    })
    .select("id")
    .single();
  if (answerError) throw answerError;

  // 4. Activate question
  const { error: activateError } = await supabase.from("questions").update({ is_active: true }).eq("id", questionId);
  if (activateError) throw activateError;

  return {
    questionId,
    modelAnswerId: answerRow.id as string,
    blueprintId,
    blueprint: validBlueprint,
    questionText,
    topic: slot.topic,
    paper: slot.paper,
    slotType: slot.slotType,
    marks,
    wordLimit: template.words.max,
  };
}
