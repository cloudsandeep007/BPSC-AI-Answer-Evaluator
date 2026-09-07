// Proves the repetition bug is actually fixed: two /question requests for the
// SAME topic and marks-type must produce two DIFFERENT questions, not the
// same one served twice.
//
//   npx tsx scripts/smoke-question-selection.ts

import "dotenv/config";
import { generateQuestion, AVAILABLE_TOPICS, TOPIC_TO_PAPER } from "../src/stage0";

async function main() {
  console.log("Topics available for selection:", AVAILABLE_TOPICS.join(", "));
  console.log("Topic -> paper mapping:", JSON.stringify(TOPIC_TO_PAPER));

  const topic = "Polity";
  console.log(`\nGenerating two "${topic}" / compulsory_subpart questions back-to-back...\n`);

  const a = await generateQuestion({ topic, slotType: "compulsory_subpart" });
  console.log(`Q1: ${a.questionId}`);
  console.log(`    ${a.questionText}`);

  const b = await generateQuestion({ topic, slotType: "compulsory_subpart" });
  console.log(`Q2: ${b.questionId}`);
  console.log(`    ${b.questionText}`);

  const same = a.questionId === b.questionId;
  console.log(`\n${same ? "FAIL - same question returned twice (the bug)" : "ok - two distinct questions generated"}`);
  process.exit(same ? 1 : 0);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
