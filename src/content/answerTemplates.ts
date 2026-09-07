// The four BPSC answer-structure templates.
//
// Source: "BPSC - Standard Answer Structure and Judging Rules.docx" (§1) and
// "BPSC - Answer Evaluation and Model-Answer Standard.docx" (§2 word limits).
//
// These live in code rather than the database because Stage B's scoring
// arithmetic reads them directly - the numbers and the code that applies them
// have to move together. Changing a template means changing behaviour, so it
// belongs in a reviewed commit, not a database row someone can edit silently.

export type SlotType = "compulsory_subpart" | "choice_essay" | "essay_paper" | "statistics_di";

export interface AnswerTemplate {
  slotType: SlotType;
  label: string;
  marks: { min: number; max: number };
  words: { min: number; max: number };
  /** Sections a well-formed answer of this type contains, in order. */
  structure: string[];
  /** Handed to Stage 0 so generated questions match the real paper's shape. */
  guidance: string;
  supported: boolean;
}

export const ANSWER_TEMPLATES: Record<SlotType, AnswerTemplate> = {
  compulsory_subpart: {
    slotType: "compulsory_subpart",
    label: "Compulsory sub-part (short note)",
    marks: { min: 6, max: 8 },
    words: { min: 100, max: 150 },
    structure: [
      "Direct opening statement (1 sentence) answering the question immediately",
      "2-4 supporting points, each carrying a specific named fact (scheme, Act, statistic, place, date)",
      "Optional one-line significance close, only when marks >= 7",
    ],
    guidance:
      "No formal introduction - at this length an introduction wastes marks per word. Point-form or short sentences, not flowing prose.",
    supported: true,
  },

  choice_essay: {
    slotType: "choice_essay",
    label: "Choice-of-2 essay-type GS answer",
    marks: { min: 36, max: 38 },
    words: { min: 500, max: 700 },
    structure: [
      "Introduction (~50-70 words): define the key term or frame the issue",
      "Body (~400-500 words) in 3-5 labelled dimensions, each with 2-3 specific facts",
      "Directive-specific closing (~60-80 words)",
    ],
    guidance:
      "A GS answer, not a literary essay - no anecdote, no padding. Examiners reward visible structure, so dimensions should be separated. Work Bihar-specific evidence into the body where the topic allows, since several syllabus lines carry an explicit Bihar focus.",
    supported: true,
  },

  essay_paper: {
    slotType: "essay_paper",
    label: "Essay Paper",
    marks: { min: 100, max: 100 },
    words: { min: 700, max: 800 },
    structure: [
      "Introduction (~100 words): hook ending in one clear thesis sentence",
      "3-4 body paragraphs (~150-200 words each), each a genuinely distinct angle",
      "Conclusion (~80-100 words): returns to the thesis, ends forward-looking",
    ],
    guidance:
      "Distinct angles commonly run psychological/individual, historical/biographical, socio-economic, and a counter-view - never four paragraphs restating one point. Judged on argument-building, so structure carries more weight here than in GS answers.",
    supported: true,
  },

  statistics_di: {
    slotType: "statistics_di",
    label: "Statistical Analysis / Data Interpretation",
    marks: { min: 36, max: 36 },
    words: { min: 0, max: 0 },
    structure: [
      "State the values read from the chart or table",
      "Show the calculation with working, not just a final number",
      "One or two sentences interpreting what the number means",
    ],
    guidance:
      "NOT SUPPORTED YET. Requires generating a chart or table alongside the question, which neither Stage 0 nor Stage B handles. Deliberately deferred.",
    supported: false,
  },
};

export const SUPPORTED_SLOT_TYPES = (Object.values(ANSWER_TEMPLATES) as AnswerTemplate[])
  .filter((t) => t.supported)
  .map((t) => t.slotType);

/** Marks actually awarded for a slot - the top of its range. */
export function maxMarksFor(slotType: SlotType): number {
  return ANSWER_TEMPLATES[slotType].marks.max;
}
