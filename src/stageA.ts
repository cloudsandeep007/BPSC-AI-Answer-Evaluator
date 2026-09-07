// Stage A - reads a photographed handwritten answer into text.
//
// The prompt and request shape come from the Week 0 OCR diagnostic
// (../week0-ocr-test/), where three independent Gemini flash models agreed on
// 97-98% of content words transcribing real handwritten Devanagari. The
// production reader behaves like the one that was actually evaluated.

import { config } from "./config";
import { callGemini, extractJson } from "./gemini";

export const STAGE_A_PROMPT_VERSION = "stageA-v1";

const SYSTEM_PROMPT =
  "You are a precise transcription engine for handwritten answer sheets from Indian competitive exams " +
  "(BPSC / UPSC Mains). You transcribe what is on the page. You never evaluate, correct, improve, " +
  "complete or comment on the answer's content.";

const USER_PROMPT = `Transcribe the handwritten answer in this image exactly as it is written.

RULES:
1. EXACT transcription. Reproduce the writer's spelling, grammar, punctuation and word choice, including mistakes. Never correct anything.
2. Do not summarise, paraphrase, translate or shorten. Every legible word must appear.
3. Keep the original script - Devanagari stays Devanagari, English stays English, mixed stays mixed.
4. Mark anything genuinely unreadable as [illegible] inline at that position. A partial guess is [illegible: best guess?]. Never invent words to fill a gap.
5. If the image has no handwriting at all, return an empty transcript.

Return ONLY a JSON object, no markdown fence, no commentary:
{
  "transcript": "the full transcription, with \\n for line breaks",
  "confidence": <number 0.00-1.00: your honest estimate of the fraction of words you transcribed correctly - be conservative, do not inflate it>
}`;

export interface TranscriptionResult {
  transcript: string;
  confidence: number | null;
  wordCount: number;
}

/** Devanagari must count as words the same way Latin script does. */
export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export async function transcribeImage(base64: string, mimeType: string): Promise<TranscriptionResult> {
  const res = await callGemini({
    model: config.geminiModel,
    system: SYSTEM_PROMPT,
    parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: USER_PROMPT }],
  });

  const parsed = extractJson<{ transcript: string; confidence: number }>(res.text);
  const transcript = parsed && typeof parsed.transcript === "string" ? parsed.transcript : res.text;

  let confidence: number | null = parsed ? Number(parsed.confidence) : null;
  if (confidence === null || Number.isNaN(confidence)) confidence = null;
  if (confidence !== null && confidence > 1) confidence = confidence / 100;

  return { transcript, confidence, wordCount: wordCount(transcript) };
}
