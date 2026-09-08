import { EvaluationBlueprint } from "../../domain/blueprint";
import { aiGateway } from "../gateway";

export interface QualityCheckResult {
  score: number; // 0-10
  feedback: string;
  passed: boolean; // score >= 8
}

export async function checkQuestionQuality(
  questionText: string,
  blueprint: EvaluationBlueprint,
  ncertTextContext: string
): Promise<QualityCheckResult> {
  const system = `You are the Chief Examiner for the BPSC Mains examination. Your job is to act as a quality gate for questions and evaluation blueprints drafted by junior paper-setters.
You must score the proposed question from 0 to 10.
Criteria:
1. Syllabus Alignment: Does it fit the requested BPSC syllabus topic?
2. Novelty: Is it original, or a cliché?
3. Directive Clarity: Is the directive word properly used?
4. Answerability: Can this actually be answered in the specified word limit?
5. Bihar Relevance: Does it test Bihar's context where appropriate?

Also review the Evaluation Blueprint. Are the dimensions logical? Are the expected points accurate according to the provided NCERT context?

You must output a JSON object with strictly these keys:
- "score": number between 0 and 10 (1 decimal place)
- "feedback": string containing your critique and specific improvements needed if it fails
- "passed": boolean (true if score is 8.0 or higher, false otherwise)`;

  const userPrompt = `
Topic: ${blueprint.topic}
Paper: ${blueprint.paper}
Slot Type: ${blueprint.slotType}
Marks: ${blueprint.marks}
Word Limit: ${blueprint.wordLimit}
Directive: ${blueprint.directive}

Question Text:
${questionText}

NCERT Context Available:
${ncertTextContext || "None provided"}

Proposed Evaluation Blueprint:
${JSON.stringify(blueprint, null, 2)}
`;

  const response = await aiGateway.callStructured<QualityCheckResult>({
    feature: "qualityChecker",
    system,
    userPrompt,
    search: false,
  });

  return response.data;
}
