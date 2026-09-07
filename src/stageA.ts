// Stage A: vision transcription of a photographed handwritten answer.
//
// Ported from the Week 0 OCR diagnostic
// (../week0-ocr-test/src/providers.js + prompt.js) - same request shape,
// same prompt contract, trimmed to only what the bot needs (word count is
// computed here rather than trusted from the model's own count).
//
// Week 0 found gemini-3.5/3.7/3.8-flash all scored ~0.97-0.98 content
// agreement transcribing real Devanagari handwriting, and flash is what
// this Gemini key actually has quota for today (pro came back
// quota-blocked). Swap GEMINI_MODEL once the account is billed for pro.

import { config } from "./config";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

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

// Gemini returns 503 "model currently experiencing high demand" routinely
// under load, not as a rare edge case - Week 0 hit this repeatedly. Retry
// with backoff on the known-transient codes before giving up.
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backoffMs = (attempt: number) => Math.min(15000, 1500 * 3 ** (attempt - 1)) + Math.random() * 500;

// Models sometimes wrap JSON in a fence or add a sentence around it.
function extractJson(text: string): any {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

// Devanagari must count as words the same way Latin script does.
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export async function transcribeImage(base64: string, mimeType: string): Promise<TranscriptionResult> {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: USER_PROMPT }],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const maxAttempts = 3;
  let res: Response | null = null;
  let lastErrText = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": config.geminiApiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;

    lastErrText = await res.text();
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new Error(`Gemini transcription failed: HTTP ${res.status}: ${lastErrText.slice(0, 500)}`);
  }

  const json: any = await res!.json();
  const candidate = json.candidates?.[0];
  if (!candidate) throw new Error("Gemini returned no candidate for this image");

  const text = (candidate.content?.parts ?? [])
    .filter((p: any) => !p.thought && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("");

  const parsed = extractJson(text);
  const transcript: string = parsed && typeof parsed.transcript === "string" ? parsed.transcript : text;

  let confidence: number | null = parsed ? Number(parsed.confidence) : null;
  if (confidence === null || Number.isNaN(confidence)) confidence = null;
  if (confidence !== null && confidence > 1) confidence = confidence / 100;

  return { transcript, confidence, wordCount: wordCount(transcript) };
}
