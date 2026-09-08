import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// supabase-js's realtime client requires a global WebSocket constructor even
// though this bot only ever makes plain REST calls (.from().select/insert/
// update) - no channels or subscriptions. Node < 22 has no global WebSocket,
// so polyfill it; this is a no-op on Node 22+ (e.g. if Railway runs newer).
if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = require("ws");
}

// service_role client: bypasses RLS by design. RLS stays enabled on every
// table (see db/schema.sql) to lock out every other access path - this
// backend is the only thing that talks to the database right now.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export type Language = "hi" | "hinglish" | "en";

export interface UserRow {
  id: string;
  telegram_id: number;
  phone: string | null;
  display_name: string | null;
  language: Language | null;
  exam: string;
  credits: number;
  plan_expires_at: string | null;
  referred_by: string | null;
  active_question_id: string | null;
  edit_state: Record<string, any> | null;
  created_at: string;
}

export async function getOrCreateUser(
  telegramId: number,
  displayName: string | undefined,
): Promise<UserRow> {
  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing as UserRow;

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ telegram_id: telegramId, display_name: displayName ?? null, exam: "BPSC", credits: 0 })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created as UserRow;
}

export async function setUserLanguage(userId: string, language: Language): Promise<void> {
  const { error } = await supabase.from("users").update({ language }).eq("id", userId);
  if (error) throw error;
}

export async function setUserActiveQuestion(telegramId: number, questionId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ active_question_id: questionId })
    .eq("telegram_id", telegramId);
  if (error) throw error;
}

export async function getUserActiveQuestion(telegramId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("active_question_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (error) throw error;
  return data?.active_question_id ?? null;
}

export async function setUserEditState(telegramId: number, editState: Record<string, any> | null): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ edit_state: editState })
    .eq("telegram_id", telegramId);
  if (error) throw error;
}

export async function getUserEditState<T = any>(telegramId: number): Promise<T | null> {
  const { data, error } = await supabase
    .from("users")
    .select("edit_state")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (error) throw error;
  return (data?.edit_state as T) ?? null;
}

export interface SubmissionInsert {
  user_id: string;
  question_id: string;
  image_sha256: string;
  transcript: string;
  transcript_confidence: number | null;
  word_count: number;
  image_storage_path?: string | null;
  status?: string;
}

export async function saveSubmission(row: SubmissionInsert): Promise<string> {
  const { data, error } = await supabase.from("submissions").insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateSubmissionTranscript(
  submissionId: string,
  transcript: string,
  wordCount: number,
): Promise<void> {
  const { error } = await supabase
    .from("submissions")
    .update({ transcript, word_count: wordCount })
    .eq("id", submissionId);
  if (error) throw error;
}

export async function updateSubmissionStoragePath(
  submissionId: string,
  imageStoragePath: string,
): Promise<void> {
  const { error } = await supabase
    .from("submissions")
    .update({ image_storage_path: imageStoragePath })
    .eq("id", submissionId);
  if (error) throw error;
}

export async function createJobLog(queueName: string, entityId: string, payload?: any): Promise<string> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({ queue_name: queueName, entity_id: entityId, payload, status: "pending" })
    .select("id")
    .single();
  if (error) {
    console.warn(`Could not create job log: ${error.message}`);
    return "ephemeral-job-id";
  }
  return data.id as string;
}

export async function updateJobLog(
  jobId: string,
  status: "pending" | "processing" | "completed" | "failed",
  errorMessage?: string,
): Promise<void> {
  if (jobId === "ephemeral-job-id") return;
  const updateData: any = { status };
  if (status === "completed" || status === "failed") {
    updateData.completed_at = new Date().toISOString();
  }
  if (errorMessage) {
    updateData.error_message = errorMessage;
  }
  await supabase.from("jobs").update(updateData).eq("id", jobId);
}

