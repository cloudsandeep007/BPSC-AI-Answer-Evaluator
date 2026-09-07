// Renders a report card with realistic sample data so it can actually be
// looked at, not just typechecked.
//   npx tsx scripts/preview-report-card.ts
import fs from "node:fs";
import path from "node:path";
import { buildReportCard } from "../src/reportCard";

async function main() {
  const pdf = await buildReportCard({
    lang: "en",
    question: {
      text: "Critically examine the role of agro-based industries in accelerating rural industrialisation and employment generation in Bihar.",
      paper: "GS Paper 2",
      subject: "Geography & Economics",
      slotType: "compulsory_subpart",
      directive: "Critically examine",
      marks: 8,
    },
    result: {
      totalMarks: 6,
      maxMarks: 8,
      band: "strong",
      dimensionNotes: {
        content: "Covered agro-processing's role in absorbing disguised unemployment and named two real policy interventions with correct detail.",
        directive: "Mostly descriptive - listed benefits but did not weigh them against the named constraints to reach a critical judgement.",
        structure: "Points are run together as one paragraph rather than separated - the compulsory-subpart template expects distinct, visibly separated points.",
        relevance: "Used Bihar-specific examples (Mithila Makhana, Purnia ethanol unit) rather than generic national examples.",
      },
      pointsFound: [
        {
          point: "Agro-processing absorbs disguised and seasonal unemployment in rural Bihar by leveraging local produce like Mithila Makhana and Muzaffarpur Shahi Litchi.",
          evidence: "\"agro processing gives jobs to farmers in the off season using makhana and litchi\"",
          source: { kind: "ncert", label: "NCERT Class 11 Economics, Indian Economic Development, Ch. 6 — Employment: Growth, Informalisation and Other Issues" },
        },
        {
          point: "The Bihar Ethanol Production Promotion Policy (2021) and Mega Food Parks drive rural capital formation.",
          evidence: "\"the ethanol policy of 2021 and mega food park in khagaria helped rural industry\"",
          source: { kind: "general_knowledge", label: "Bihar Ethanol Production Promotion Policy, 2021 (Department of Industries, Govt. of Bihar)" },
        },
        {
          point: "Inadequate cold-chain infrastructure limits value addition and is a genuine current constraint.",
          evidence: "\"cold storage is not enough in bihar so fruits get wasted\"",
          source: { kind: "web", label: "Economic Survey of Bihar 2025-26, Ch. 4 — Agriculture and Allied Sectors", url: "https://state.bihar.gov.in/finance/economicsurvey" },
        },
      ],
      pointsMissed: [
        {
          point: "Promotion of micro-enterprises via JEEViKA SHGs and the PM-FME scheme empowers rural human capital.",
          why_it_matters: "Worth roughly a quarter of the marks here - JEEViKA is the single most-cited Bihar-specific institution for this exact question type, and its absence is the main reason this isn't a full-marks answer.",
          source: { kind: "general_knowledge", label: "PM Formalisation of Micro Food Processing Enterprises (PM-FME) Scheme, Ministry of Food Processing Industries" },
        },
      ],
      feedback:
        "This is a solid, specific answer that correctly names real Bihar institutions rather than writing generically - the Ethanol Policy and Makhana/Litchi examples are exactly the kind of precise content BPSC examiners reward. Two things held it back from full marks: you never mentioned JEEViKA or PM-FME, which is the point most answers on this topic are expected to cover, and \"critically examine\" asked you to weigh the constraints against the benefits and reach a judgement - you listed both but never actually weighed them against each other. Separate your points visibly rather than running them together; at 8 marks, structure is graded independently of content.",
      todo: [
        "Add JEEViKA SHGs and the PM-FME scheme by name next time this topic comes up.",
        "For \"critically examine\" questions, end with one sentence that actually weighs the pros against the cons - not just a list of both.",
      ],
    },
    dimensionBands: { content: "strong", directive: "average", structure: "weak", relevance: "strong" },
    rubricVersion: 1,
    modelName: "gemini-3.7-flash",
    promptVersion: "stageB-v2",
    generatedAt: new Date("2026-09-08"),
    trend: [
      { date: new Date("2026-08-20"), totalMarks: 3, maxMarks: 8 },
      { date: new Date("2026-08-27"), totalMarks: 4.5, maxMarks: 8 },
      { date: new Date("2026-09-02"), totalMarks: 5, maxMarks: 8 },
    ],
  });

  const out = path.resolve(__dirname, "..", "preview-report-card.pdf");
  fs.writeFileSync(out, pdf);
  console.log(`wrote ${out} (${(pdf.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
