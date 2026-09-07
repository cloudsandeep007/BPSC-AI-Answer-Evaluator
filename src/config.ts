import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  geminiApiKey: required("GEMINI_API_KEY"),
  // Below this self-reported transcription confidence, skip the confirm
  // step and ask the student to reshoot instead. Tune here, no redeploy
  // of the model logic needed.
  confidenceThreshold: Number(process.env.TRANSCRIPT_CONFIDENCE_THRESHOLD ?? "0.6"),
  port: Number(process.env.PORT ?? "3000"),
};

// TEMPORARY: Stage 0 (question generation) doesn't exist yet. Every
// submission this session is filed under this one placeholder row -
// see db/schema.sql. Remove once Stage 0 ships real questions.
export const PLACEHOLDER_QUESTION_ID = "00000000-0000-0000-0000-000000000001";
