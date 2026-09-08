// Stage A - reads a photographed handwritten answer into text.
//
// The prompt and request shape come from the Week 0 OCR diagnostic
// (../week0-ocr-test/), where three independent Gemini flash models agreed on
// 97-98% of content words transcribing real handwritten Devanagari. The
// production reader behaves like the one that was actually evaluated.

import { config } from "./config";
import { aiGateway } from "./ai/gateway";

export const STAGE_A_PROMPT_VERSION = "stageA-v1";

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
  const res = await aiGateway.transcribe({
    base64Image: base64,
    mimeType,
    model: config.geminiModel,
  });

  return {
    transcript: res.transcript,
    confidence: res.confidence,
    wordCount: res.wordCount,
  };
}
