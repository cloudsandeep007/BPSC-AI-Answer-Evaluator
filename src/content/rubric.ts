// The v1 scoring rubric - the band descriptors the judging model reads when
// deciding how an answer did on each dimension.
//
// Source: the four checks in "BPSC - Standard Answer Structure and Judging
// Rules.docx" (SS2), with band wording drawn from the worked examples in
// "BPSC - Answer Evaluation and Model-Answer Standard.docx" (SS5).
//
// This is seeded into the `rubrics` table (npm run seed) rather than read from
// here at runtime, because every `evaluations` row records the
// `rubric_version` that produced it. A mark given today must stay explainable
// after the rubric is rewritten, so the version that graded it has to be
// retrievable from the database, not just from whatever the code says now.

export const RUBRIC_VERSION = 1;

export interface RubricDimension {
  key: string;
  label: string;
  what_it_checks: string;
  bands: { strong: string; average: string; weak: string; negligible: string };
}

export const RUBRIC_V1: {
  version: number;
  exam: string;
  description: string;
  dimensions: RubricDimension[];
  specificity: RubricDimension;
} = {
  version: RUBRIC_VERSION,
  exam: "BPSC",
  description:
    "Four-check BPSC marking rubric. The model assigns a band per dimension; the backend converts bands to marks and applies BPSC realism calibration.",

  dimensions: [
    {
      key: "content",
      label: "Content accuracy and depth",
      what_it_checks:
        "How many of the expected points appear, and how accurately. NCERT-sourced facts outrank general knowledge where the two could differ.",
      bands: {
        strong:
          "Covers nearly all expected points, with correct Article numbers, Act names, dates, figures and case names. Nothing materially wrong.",
        average:
          "Covers roughly half the expected points, or covers most but with vague phrasing instead of named facts. No serious factual errors.",
        weak: "Covers a small minority of expected points, or contains factual errors that would mislead a reader.",
        negligible: "Off-topic, or contains almost nothing the question asked for.",
      },
    },
    {
      key: "directive",
      label: "Directive compliance",
      what_it_checks:
        "Whether the answer actually performed the action its directive word ordered - discuss needs both sides, examine needs a judgement, comment needs an opinion, describe needs description.",
      bands: {
        strong: "Fully performs the directive - both sides where required, and a stated position where required.",
        average: "Partly performs it, e.g. presents both sides but never reaches the judgement the directive asked for.",
        weak: "Largely ignores the directive - describes when asked to evaluate, or covers only one half of a two-part question.",
        negligible: "No engagement with the directive at all.",
      },
    },
    {
      key: "structure",
      label: "Structure and coherence",
      what_it_checks:
        "Whether the answer matches the expected shape for its type - direct-opening-then-points for a short sub-part, intro/body/conclusion for essay-type answers. Graded independently of content: a well-organised but thin answer still scores here.",
      bands: {
        strong: "Follows the template for its type, with visibly separated points or dimensions and a proper close.",
        average: "Recognisable structure but with a missing or perfunctory section, or dimensions that blur together.",
        weak: "Little visible structure - undifferentiated prose where points or sections were expected.",
        negligible: "No structure; fragments or a single undifferentiated block.",
      },
    },
    {
      key: "relevance",
      label: "Relevance and examples",
      what_it_checks:
        "Whether examples are concrete and correctly chosen, including Bihar-specific evidence where the topic allows it.",
      bands: {
        strong: "Concrete, correctly-chosen examples, with Bihar-specific evidence where the topic invites it.",
        average: "Some examples, but generic or only loosely connected to the argument.",
        weak: "Almost no examples, or examples that don't support the point being made.",
        negligible: "No examples, or examples that are wrong.",
      },
    },
  ],

  // Reported alongside the dimensions. Drives the realism ceiling rather than
  // the raw score - this is the mechanism that stops fluent-but-vague writing
  // from scoring like precise, checklist-matchable content.
  specificity: {
    key: "specificity",
    label: "Specificity of content",
    what_it_checks:
      "How named and checkable the content is. Precise content is what BPSC examiners reward with near-full marks; generic-but-fluent writing is capped mid-band no matter how well written.",
    bands: {
      strong:
        "Densely specific - named Acts, correct Article numbers, real statistics, named schemes, dated events, named places.",
      average: "A few named specifics among otherwise general statements.",
      weak: "Almost entirely general - correct in theme but naming almost nothing checkable.",
      negligible: "No specifics whatsoever.",
    },
  },
};
