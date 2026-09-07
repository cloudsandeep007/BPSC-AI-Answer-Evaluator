// End-to-end check of Stage 0 -> Stage B against the live database and live
// Gemini, without going through Telegram.
//
//   npx tsx scripts/smoke-stages.ts
//
// Costs a few Gemini calls. It writes real rows (a question, an answer key, a
// submission and an evaluation) and cleans up the submission/evaluation it
// created, leaving the generated question in place.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { generateQuestion } from "../src/stage0";
import { evaluateSubmission, EvaluationResult } from "../src/stageB";
import { supabase } from "../src/supabase";
import { buildReportCard } from "../src/reportCard";

async function main() {
  console.log("\n=== Stage 0: generate a question and its answer key ===\n");
  const q = await generateQuestion();
  console.log(`paper     : ${q.paper}`);
  console.log(`topic     : ${q.topic}`);
  console.log(`slot type : ${q.slotType}  (${q.marks} marks, ~${q.wordLimit} words)`);
  console.log(`question  : ${q.questionText}`);
  console.log(`\nexpected points (${q.expectedPoints.length}), weights sum ${q.expectedPoints.reduce((s, p) => s + p.weight, 0).toFixed(2)}:`);
  let bareCitations = 0;
  for (const p of q.expectedPoints) {
    console.log(`  [${p.source.kind}] w=${p.weight}  ${p.point}`);
    console.log(`      citation: ${p.source.label}${p.source.url ? "  " + p.source.url : ""}`);
    console.log(`      cues: ${p.cues.join(", ")}`);
    if (/^(ncert|general knowledge)$/i.test(p.source.label.trim())) bareCitations++;
  }
  console.log(bareCitations === 0 ? "\nok  every point has a specific citation, not a bare label" : `\nFAIL  ${bareCitations} point(s) have a bare, non-specific citation`);

  // Confirm it really was activated only after the key existed.
  const { data: qRow } = await supabase.from("questions").select("is_active").eq("id", q.questionId).single();
  console.log(`\nactivated after key written: ${qRow?.is_active === true ? "yes" : "NO - BUG"}`);

  console.log("\n=== Stage B: grade two contrasting answers ===\n");

  const answers: Array<{ label: string; text: string }> = [
    {
      label: "deliberately weak (vague, no specifics, ignores directive)",
      text: "This is an important topic for India. There are many problems and the government should do something about it. It affects many people in society and needs attention.",
    },
    {
      label: "deliberately strong (uses the key's own cues)",
      text: q.expectedPoints.map((p) => `${p.point}. ${p.cues.join(" ")}`).join(" "),
    },
  ];

  const created: string[] = [];
  const results: EvaluationResult[] = [];

  for (const a of answers) {
    const { data: sub, error } = await supabase
      .from("submissions")
      .insert({
        user_id: (await supabase.from("users").select("id").limit(1).single()).data!.id,
        question_id: q.questionId,
        image_sha256: "smoketest".padEnd(64, "0"),
        transcript: a.text,
        transcript_confidence: 0.95,
        word_count: a.text.split(/\s+/).length,
      })
      .select("id")
      .single();
    if (error) throw error;
    created.push(sub.id as string);

    const result = await evaluateSubmission(sub.id as string, "English");
    results.push(result);
    console.log(`--- ${a.label}`);
    console.log(`    ${result.totalMarks}/${result.maxMarks}  band=${result.band}` + (result.directiveCapApplied ? "  [directive cap applied]" : ""));
    console.log(`    found ${result.pointsFound.length}, missed ${result.pointsMissed.length}`);
    for (const p of [...result.pointsFound, ...result.pointsMissed]) {
      console.log(`      citation [${p.source.kind}]: ${p.source.label}`);
    }
    console.log(`    feedback: ${result.feedback.slice(0, 200)}`);
    console.log();
  }

  // Verify the evaluation rows carry all four provenance fields.
  const { data: evals } = await supabase
    .from("evaluations")
    .select("rubric_version, model_answer_version, model_name, prompt_version, total_marks")
    .in("submission_id", created);
  console.log("provenance recorded on each evaluation:");
  for (const e of evals ?? []) {
    const complete = e.rubric_version != null && e.model_answer_version != null && e.model_name && e.prompt_version;
    console.log(`  ${complete ? "ok  " : "MISSING"}  rubric v${e.rubric_version}, key v${e.model_answer_version}, ${e.model_name}, ${e.prompt_version} -> ${e.total_marks}`);
  }

  // Generate a real PDF from the "strong" answer's evaluation, from the same
  // live data the bot would send - proves the whole pipeline, not just Stage
  // 0/B in isolation.
  const strong = results[results.length - 1];
  const pdf = await buildReportCard({
    lang: "en",
    question: strong.question,
    result: {
      totalMarks: strong.totalMarks,
      maxMarks: strong.maxMarks,
      band: strong.band,
      feedback: strong.feedback,
      dimensionNotes: strong.dimensionNotes,
      pointsFound: strong.pointsFound,
      pointsMissed: strong.pointsMissed,
      todo: strong.todo,
    },
    dimensionBands: strong.dimensions,
    rubricVersion: strong.rubricVersion,
    modelName: strong.modelName,
    promptVersion: strong.promptVersion,
    generatedAt: new Date(),
    trend: strong.trend,
  });
  const pdfPath = path.resolve(__dirname, "..", "smoke-report-card.pdf");
  fs.writeFileSync(pdfPath, pdf);
  console.log(`\nwrote ${pdfPath} (${(pdf.length / 1024).toFixed(0)} KB) from live Stage 0/B output`);

  // Clean up the test submissions and their evaluations.
  await supabase.from("evaluations").delete().in("submission_id", created);
  await supabase.from("submissions").delete().in("id", created);
  console.log(`cleaned up ${created.length} test submission(s). Generated question ${q.questionId} left in place.`);
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
