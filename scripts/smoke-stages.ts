// End-to-end check of Stage 0 -> Stage B against the live database and live
// Gemini, without going through Telegram.
//
//   npx tsx scripts/smoke-stages.ts
//
// Costs a few Gemini calls. It writes real rows (a question, an answer key, a
// submission and an evaluation) and cleans up the submission/evaluation it
// created, leaving the generated question in place.

import "dotenv/config";
import { generateQuestion } from "../src/stage0";
import { evaluateSubmission } from "../src/stageB";
import { supabase } from "../src/supabase";

async function main() {
  console.log("\n=== Stage 0: generate a question and its answer key ===\n");
  const q = await generateQuestion();
  console.log(`paper     : ${q.paper}`);
  console.log(`topic     : ${q.topic}`);
  console.log(`slot type : ${q.slotType}  (${q.marks} marks, ~${q.wordLimit} words)`);
  console.log(`question  : ${q.questionText}`);
  console.log(`\nexpected points (${q.expectedPoints.length}), weights sum ${q.expectedPoints.reduce((s, p) => s + p.weight, 0).toFixed(2)}:`);
  for (const p of q.expectedPoints) {
    console.log(`  [${p.source}] w=${p.weight}  ${p.point}`);
    console.log(`      cues: ${p.cues.join(", ")}`);
  }

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
    console.log(`--- ${a.label}`);
    console.log(`    ${result.totalMarks}/${result.maxMarks}  band=${result.band}` + (result.directiveCapApplied ? "  [directive cap applied]" : ""));
    console.log(`    found ${result.pointsFound.length}, missed ${result.pointsMissed.length}`);
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

  // Clean up the test submissions and their evaluations.
  await supabase.from("evaluations").delete().in("submission_id", created);
  await supabase.from("submissions").delete().in("id", created);
  console.log(`\ncleaned up ${created.length} test submission(s). Generated question ${q.questionId} left in place.`);
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
