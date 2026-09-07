// Checks the scoring arithmetic against the worked examples in
// "BPSC - Answer Evaluation and Model-Answer Standard.docx".
//
//   npx tsx scripts/verify-calibration.ts
//
// That document scores real sample answers by hand and states the marks a BPSC
// examiner would give. If our computeScore() disagrees with those numbers, the
// calibration is wrong - this catches that rather than trusting it.

import { computeScore, Band } from "../src/content/calibration";
import { SlotType } from "../src/content/answerTemplates";

interface Case {
  name: string;
  slotType: SlotType;
  dimensions: { content: Band; directive: Band; structure: Band; relevance: Band };
  specificity: Band;
  /** Marks the source document says a BPSC examiner would award. */
  expected: [number, number];
}

const CASES: Case[] = [
  // --- Example A: 8-mark compulsory sub-part (nuclear energy) ---
  {
    name: "A1 vague: 'nuclear is clean, build more carefully'",
    slotType: "compulsory_subpart",
    dimensions: { content: "weak", directive: "weak", structure: "weak", relevance: "negligible" },
    specificity: "negligible",
    expected: [1, 2],
  },
  {
    name: "A2 solid but generic: right themes, no named scheme or figures",
    slotType: "compulsory_subpart",
    dimensions: { content: "average", directive: "strong", structure: "strong", relevance: "weak" },
    specificity: "weak",
    expected: [4, 5],
  },
  {
    name: "A3 precise: ~3% share, SMRs, AERB, IAEA safeguards, both halves",
    slotType: "compulsory_subpart",
    dimensions: { content: "strong", directive: "strong", structure: "strong", relevance: "strong" },
    specificity: "strong",
    expected: [7, 8],
  },

  // --- Example B: 38-mark choice essay (employment vs employability) ---
  {
    name: "B1 strong/topper-tier: distinction drawn, 2-3 schemes, reaches a view",
    slotType: "choice_essay",
    dimensions: { content: "strong", directive: "strong", structure: "strong", relevance: "strong" },
    specificity: "average",
    expected: [20, 26],
  },
  {
    name: "B2 average/pass-tier: generic, at most one scheme, concepts not separated",
    slotType: "choice_essay",
    dimensions: { content: "average", directive: "average", structure: "average", relevance: "weak" },
    specificity: "weak",
    expected: [12, 19],
  },
  {
    name: "B3 weak: descriptive only, no analysis of employability",
    slotType: "choice_essay",
    dimensions: { content: "weak", directive: "weak", structure: "weak", relevance: "negligible" },
    specificity: "negligible",
    expected: [4, 11],
  },
];

let failures = 0;

console.log("\nCalibration vs. the source document's own worked examples\n");
for (const c of CASES) {
  const r = computeScore({ slotType: c.slotType, dimensions: c.dimensions, specificity: c.specificity });
  const [lo, hi] = c.expected;
  const pass = r.totalMarks >= lo && r.totalMarks <= hi;
  if (!pass) failures++;
  console.log(
    `${pass ? "ok  " : "FAIL"}  ${String(r.totalMarks).padStart(5)}/${r.maxMarks}` +
      `  (doc says ${lo}-${hi})  ${(r.finalFraction * 100).toFixed(0)}%  ${c.name}`,
  );
}

// The headline calibration claim: a technically excellent discursive answer
// must NOT score like a naive rubric would give it.
console.log("\nRealism guard: a flawless discursive answer must stay in the 55-68% band\n");
const flawless = computeScore({
  slotType: "choice_essay",
  dimensions: { content: "strong", directive: "strong", structure: "strong", relevance: "strong" },
  specificity: "strong",
});
const inBand = flawless.finalFraction <= 0.7;
if (!inBand) failures++;
console.log(
  `${inBand ? "ok  " : "FAIL"}  flawless choice_essay -> ${flawless.totalMarks}/${flawless.maxMarks} ` +
    `(${(flawless.finalFraction * 100).toFixed(0)}%) - must not exceed ~70%`,
);

// Directive failure cap: factually rich but ignored the directive word.
const ignoredDirective = computeScore({
  slotType: "choice_essay",
  dimensions: { content: "strong", directive: "negligible", structure: "strong", relevance: "strong" },
  specificity: "strong",
});
const capped = ignoredDirective.finalFraction <= 0.5;
if (!capped) failures++;
console.log(
  `${capped ? "ok  " : "FAIL"}  rich content but directive ignored -> ` +
    `${ignoredDirective.totalMarks}/${ignoredDirective.maxMarks} ` +
    `(${(ignoredDirective.finalFraction * 100).toFixed(0)}%) - must be capped at 50%`,
);

console.log(failures ? `\n${failures} FAILURE(S)\n` : "\nall calibration checks passed\n");
process.exit(failures ? 1 : 0);
