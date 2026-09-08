import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    if (process.env.NODE_ENV === "test") {
      if (name === "SUPABASE_URL") return "https://mock-test.supabase.co";
      return `mock-test-${name.toLowerCase()}`;
    }
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

// The Gemini model each stage uses. All three default to the same model;
// split them when one stage needs a stronger (or cheaper) model than another.
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  geminiApiKey: required("GEMINI_API_KEY"),

  /** Stage A - reading handwriting. */
  geminiModel: DEFAULT_MODEL,
  /** Stage 0 - generating questions and answer keys. */
  geminiGenerationModel: process.env.GEMINI_GENERATION_MODEL ?? DEFAULT_MODEL,
  /** Stage B - judging a transcript against the answer key. */
  geminiJudgeModel: process.env.GEMINI_JUDGE_MODEL ?? DEFAULT_MODEL,

  // Below this self-reported transcription confidence, skip the confirm
  // step and ask the student to reshoot instead. Tune here, no redeploy
  // of the model logic needed.
  confidenceThreshold: Number(process.env.TRANSCRIPT_CONFIDENCE_THRESHOLD ?? "0.6"),
  port: Number(process.env.PORT ?? "3000"),
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? null,
  useMockAi: process.env.USE_MOCK_AI === "true",

  // Bookkeeping row that exists only so submissions.question_id has a valid
  // target when a student submits before any real question has been served.
  // Real questions come from Stage 0; this is never shown to anyone.
  placeholderQuestionId: "00000000-0000-0000-0000-000000000001",
};

/** @deprecated use config.placeholderQuestionId */
export const PLACEHOLDER_QUESTION_ID = config.placeholderQuestionId;
