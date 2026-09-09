import "dotenv/config";
import { selectTargetTopic } from "../src/questionSelection/questionSelection";

async function main() {
  console.log("=== PHASE 5 SELECTION EXAMPLES ===");

  // Example 1: Polity Cold Start (SHORT_ANSWER 5 Marks)
  const ex1 = await selectTargetTopic({
    subject_id: "BPSC-SUB-02",
    question_type: "SHORT_ANSWER",
    marks: 5,
  });
  console.log("\nEXAMPLE 1: Cold Start Polity (5 Marks Short Answer)");
  console.log(`Input: Polity & Governance | SHORT_ANSWER | 5 Marks`);
  console.log(`Selected Topic: ${ex1.target_topic_name} (${ex1.target_topic_id})`);
  console.log(`Score: ${ex1.selection_score}`);
  console.log(`Explanation: ${ex1.selection_reason}`);

  // Example 2: Polity with Panchayati Raj Over-Exposure (SHORT_ANSWER 5 Marks)
  const ex2 = await selectTargetTopic(
    {
      subject_id: "BPSC-SUB-02",
      question_type: "SHORT_ANSWER",
      marks: 5,
    },
    ["POLITY-005", "POLITY-005", "POLITY-005"]
  );
  console.log("\nEXAMPLE 2: Student Over-Exposed to Panchayati Raj (3 Recent Practices)");
  console.log(`Input: Polity & Governance | SHORT_ANSWER | 5 Marks | Recent: [POLITY-005, POLITY-005, POLITY-005]`);
  console.log(`Selected Topic: ${ex2.target_topic_name} (${ex2.target_topic_id})`);
  console.log(`Score: ${ex2.selection_score}`);
  console.log(`Explanation: ${ex2.selection_reason}`);

  // Example 3: History Freedom Movement (LONG_ANSWER 38 Marks)
  const ex3 = await selectTargetTopic({
    subject_id: "BPSC-SUB-01",
    question_type: "LONG_ANSWER",
    marks: 38,
  });
  console.log("\nEXAMPLE 3: History & Culture (38 Marks Long Answer)");
  console.log(`Input: History, Art & Culture | LONG_ANSWER | 38 Marks`);
  console.log(`Selected Topic: ${ex3.target_topic_name} (${ex3.target_topic_id})`);
  console.log(`Score: ${ex3.selection_score}`);
  console.log(`Explanation: ${ex3.selection_reason}`);

  // Example 4: Economy MPI & Poverty (LONG_ANSWER 38 Marks)
  const ex4 = await selectTargetTopic({
    subject_id: "BPSC-SUB-03",
    question_type: "LONG_ANSWER",
    marks: 38,
  });
  console.log("\nEXAMPLE 4: Indian & Bihar Economy (38 Marks Long Answer)");
  console.log(`Input: Economy | LONG_ANSWER | 38 Marks`);
  console.log(`Selected Topic: ${ex4.target_topic_name} (${ex4.target_topic_id})`);
  console.log(`Score: ${ex4.selection_score}`);
  console.log(`Explanation: ${ex4.selection_reason}`);

  // Example 5: Science & Technology AI & E-Gov (SHORT_ANSWER 8 Marks)
  const ex5 = await selectTargetTopic({
    subject_id: "BPSC-SUB-05",
    question_type: "SHORT_ANSWER",
    marks: 8,
  });
  console.log("\nEXAMPLE 5: Science & Technology (8 Marks Short Answer)");
  console.log(`Input: Science & Technology | SHORT_ANSWER | 8 Marks`);
  console.log(`Selected Topic: ${ex5.target_topic_name} (${ex5.target_topic_id})`);
  console.log(`Score: ${ex5.selection_score}`);
  console.log(`Explanation: ${ex5.selection_reason}`);
}

main().catch(console.error);
