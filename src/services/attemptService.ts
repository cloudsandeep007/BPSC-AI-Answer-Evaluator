// Multi-page Attempt Service.
// Manages student answer attempts spanning one or more handwritten pages.
// Handles page sequencing, page-level metadata persistence, and combined multi-page transcription.

import { supabase } from "../supabase";

export interface AttemptRow {
  id: string;
  user_id: string;
  question_id: string;
  status: "draft" | "completed" | "cancelled";
  total_pages: number;
  created_at: string;
  submitted_at: string | null;
}

export interface AttemptPageRow {
  id: string;
  attempt_id: string;
  page_number: number;
  image_sha256: string;
  image_storage_path: string | null;
  transcript: string | null;
  confidence: number | null;
  word_count: number;
  created_at: string;
}

export interface CompiledAttempt {
  combinedTranscript: string;
  totalWords: number;
  averageConfidence: number | null;
}

/**
 * Pure function: Compiles multiple page transcripts into a clean, structured transcript.
 */
export function compileAttemptTranscript(pages: AttemptPageRow[]): CompiledAttempt {
  if (!pages.length) {
    return { combinedTranscript: "", totalWords: 0, averageConfidence: null };
  }

  if (pages.length === 1) {
    const p = pages[0];
    return {
      combinedTranscript: p.transcript ?? "",
      totalWords: p.word_count || 0,
      averageConfidence: p.confidence,
    };
  }

  const sorted = [...pages].sort((a, b) => a.page_number - b.page_number);
  const blocks: string[] = [];
  let totalWords = 0;
  let totalConf = 0;
  let confCount = 0;

  for (const page of sorted) {
    const text = (page.transcript ?? "").trim();
    blocks.push(`--- पृष्ठ ${page.page_number} ---\n${text}`);
    totalWords += page.word_count || 0;
    if (page.confidence !== null && !isNaN(page.confidence)) {
      totalConf += Number(page.confidence);
      confCount++;
    }
  }

  const averageConfidence = confCount > 0 ? totalConf / confCount : null;

  return {
    combinedTranscript: blocks.join("\n\n"),
    totalWords,
    averageConfidence,
  };
}

export class AttemptService {
  /**
   * Retrieves an existing draft attempt for the user/question, or creates a new one.
   */
  public async getOrCreateDraftAttempt(userId: string, questionId: string): Promise<AttemptRow> {
    const { data: existing, error: selectError } = await supabase
      .from("attempts")
      .select("*")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (selectError) {
      console.warn("Could not query existing draft attempt:", selectError.message);
    }

    if (existing) {
      return existing as AttemptRow;
    }

    const { data: created, error: insertError } = await supabase
      .from("attempts")
      .insert({
        user_id: userId,
        question_id: questionId,
        status: "draft",
        total_pages: 0,
      })
      .select("*")
      .single();

    if (insertError) {
      // Ephemeral fallback if table is not yet migrated in Supabase
      console.warn("Attempt table insert fallback:", insertError.message);
      return {
        id: "ephemeral-attempt-id",
        user_id: userId,
        question_id: questionId,
        status: "draft",
        total_pages: 0,
        created_at: new Date().toISOString(),
        submitted_at: null,
      };
    }

    return created as AttemptRow;
  }

  /**
   * Appends an uploaded page to the attempt.
   */
  public async addAttemptPage(
    attemptId: string,
    pageData: {
      imageSha256: string;
      imageStoragePath?: string | null;
      transcript: string;
      confidence: number | null;
      wordCount: number;
    },
  ): Promise<{ page: AttemptPageRow; totalPages: number }> {
    const existingPages = await this.getAttemptPages(attemptId);
    const pageNumber = existingPages.length + 1;

    const newPage: Partial<AttemptPageRow> = {
      attempt_id: attemptId,
      page_number: pageNumber,
      image_sha256: pageData.imageSha256,
      image_storage_path: pageData.imageStoragePath ?? null,
      transcript: pageData.transcript,
      confidence: pageData.confidence,
      word_count: pageData.wordCount,
    };

    const { data, error } = await supabase
      .from("attempt_pages")
      .insert(newPage)
      .select("*")
      .single();

    if (error) {
      console.warn("Could not insert attempt_page:", error.message);
    }

    const pageRow: AttemptPageRow = (data as AttemptPageRow) ?? {
      id: `page-${pageNumber}`,
      attempt_id: attemptId,
      page_number: pageNumber,
      image_sha256: pageData.imageSha256,
      image_storage_path: pageData.imageStoragePath ?? null,
      transcript: pageData.transcript,
      confidence: pageData.confidence,
      word_count: pageData.wordCount,
      created_at: new Date().toISOString(),
    };

    // Update attempts total_pages
    await supabase.from("attempts").update({ total_pages: pageNumber }).eq("id", attemptId);

    return { page: pageRow, totalPages: pageNumber };
  }

  /**
   * Fetches all pages recorded for an attempt, ordered by page_number.
   */
  public async getAttemptPages(attemptId: string): Promise<AttemptPageRow[]> {
    const { data, error } = await supabase
      .from("attempt_pages")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("page_number", { ascending: true });

    if (error) {
      console.warn("Could not query attempt_pages:", error.message);
      return [];
    }

    return (data as AttemptPageRow[]) ?? [];
  }

  /**
   * Finalizes an attempt and compiles all page transcripts.
   */
  public async finalizeAttempt(attemptId: string): Promise<{
    attempt: AttemptRow | null;
    pages: AttemptPageRow[];
    compiled: CompiledAttempt;
  }> {
    const pages = await this.getAttemptPages(attemptId);
    const compiled = compileAttemptTranscript(pages);

    await supabase
      .from("attempts")
      .update({
        status: "completed",
        submitted_at: new Date().toISOString(),
        total_pages: pages.length,
      })
      .eq("id", attemptId);

    const { data: attempt } = await supabase
      .from("attempts")
      .select("*")
      .eq("id", attemptId)
      .maybeSingle();

    return {
      attempt: (attempt as AttemptRow) ?? null,
      pages,
      compiled,
    };
  }
}

export const attemptService = new AttemptService();
