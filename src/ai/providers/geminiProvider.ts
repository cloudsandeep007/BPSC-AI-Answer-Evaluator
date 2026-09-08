import { config } from "../../config";
import { callGemini, extractJson } from "../../gemini";
import { wordCount } from "../../stageA";
import {
  AIProvider,
  AIStructuredRequest,
  AIStructuredResponse,
  AITranscriptionRequest,
  AITranscriptionResponse,
} from "../gateway";

export class GeminiProvider implements AIProvider {
  public readonly name = "google-gemini";

  public async callStructured<T>(req: AIStructuredRequest): Promise<AIStructuredResponse<T>> {
    const model = req.model ?? config.geminiModel;
    const res = await callGemini({
      model,
      system: req.system,
      parts: [{ text: req.userPrompt }],
      json: true,
      search: req.search,
      maxOutputTokens: req.maxOutputTokens,
    });

    const parsed = extractJson<T>(res.text);
    if (!parsed) {
      throw new Error(`Gemini ${model} failed to return valid JSON: ${res.text.slice(0, 300)}`);
    }

    return {
      data: parsed,
      rawText: res.text,
      provider: this.name,
      model,
      latencyMs: res.latencyMs,
      usage: {
        inputTokens: res.usage.input,
        outputTokens: res.usage.output,
      },
      groundingSources: res.groundingSources,
    };
  }

  public async transcribe(req: AITranscriptionRequest): Promise<AITranscriptionResponse> {
    const model = req.model ?? config.geminiModel;
    const system =
      "You are a precise transcription engine for handwritten answer sheets from Indian competitive exams " +
      "(BPSC / UPSC Mains). You transcribe what is on the page. You never evaluate, correct, improve, " +
      "complete or comment on the answer's content.";

    const userPrompt = `Transcribe the handwritten answer in this image exactly as it is written.

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

    const res = await callGemini({
      model,
      system,
      parts: [
        { inline_data: { mime_type: req.mimeType, data: req.base64Image } },
        { text: userPrompt },
      ],
      json: true,
    });

    const parsed = extractJson<{ transcript: string; confidence: number }>(res.text);
    const transcript = parsed && typeof parsed.transcript === "string" ? parsed.transcript : res.text;

    let confidence: number | null = parsed ? Number(parsed.confidence) : null;
    if (confidence === null || Number.isNaN(confidence)) confidence = null;
    if (confidence !== null && confidence > 1) confidence = confidence / 100;

    return {
      transcript,
      confidence,
      wordCount: wordCount(transcript),
      provider: this.name,
      model,
      latencyMs: res.latencyMs,
      usage: {
        inputTokens: res.usage.input,
        outputTokens: res.usage.output,
      },
    };
  }
}
