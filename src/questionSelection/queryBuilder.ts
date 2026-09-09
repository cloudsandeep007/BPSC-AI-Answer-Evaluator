import { QuestionSelectionInput, CandidateTopicScore } from "./types";

export function constructRetrievalQuery(
  subjectName: string,
  targetTopic: CandidateTopicScore,
  input: QuestionSelectionInput
): string {
  const typeLabel = input.question_type.toLowerCase().replace(/_/g, " ");
  const topicName = targetTopic.topic_name;
  const description = targetTopic.statistics.total_questions > 0
    ? `historical BPSC ${input.marks}-mark ${typeLabel} questions`
    : `BPSC Mains ${typeLabel} preparation`;

  return `${subjectName}: ${topicName} constitutional provisions, analytical themes, Bihar context, and core concepts relevant to ${description}.`;
}
