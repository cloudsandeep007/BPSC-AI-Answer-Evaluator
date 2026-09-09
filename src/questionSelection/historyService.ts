import { supabase } from "../supabase";

export interface StudentPracticeHistory {
  student_id?: string;
  recentTopicIds: string[];
  topicCounts: Record<string, number>;
  attemptedQuestionIds: string[];
}

export async function getStudentPracticeHistory(
  studentId?: string,
  explicitRecentTopics?: string[]
): Promise<StudentPracticeHistory> {
  if (explicitRecentTopics && explicitRecentTopics.length > 0) {
    const counts: Record<string, number> = {};
    explicitRecentTopics.forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    });
    return {
      student_id: studentId,
      recentTopicIds: explicitRecentTopics,
      topicCounts: counts,
      attemptedQuestionIds: [],
    };
  }

  if (!studentId) {
    return {
      student_id: undefined,
      recentTopicIds: [],
      topicCounts: {},
      attemptedQuestionIds: [],
    };
  }

  try {
    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("question_id, created_at")
      .eq("user_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && submissions && submissions.length > 0) {
      const qIds = submissions.map((s: any) => s.question_id);
      
      // Look up topic_ids for these question_ids from bpsc_questions
      const { data: qData } = await supabase
        .from("bpsc_questions")
        .select("question_id, topic_id")
        .in("question_id", qIds);

      const qToTopicMap = new Map<string, string>();
      (qData || []).forEach((q: any) => qToTopicMap.set(q.question_id, q.topic_id));

      const recentTopics: string[] = [];
      const topicCounts: Record<string, number> = {};

      submissions.forEach((s: any) => {
        const topId = qToTopicMap.get(s.question_id);
        if (topId) {
          recentTopics.push(topId);
          topicCounts[topId] = (topicCounts[topId] || 0) + 1;
        }
      });

      return {
        student_id: studentId,
        recentTopicIds: recentTopics,
        topicCounts,
        attemptedQuestionIds: qIds,
      };
    }
  } catch (err: any) {
    // Fall back gracefully to empty history
  }

  return {
    student_id: studentId,
    recentTopicIds: [],
    topicCounts: {},
    attemptedQuestionIds: [],
  };
}
