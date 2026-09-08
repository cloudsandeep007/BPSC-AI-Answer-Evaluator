// Shared Gemini client. Every stage (A, 0, B) calls through here so retry
// behaviour, JSON extraction and usage accounting stay identical between them.

import { config } from "./config";

// Gemini returns 503 "model currently experiencing high demand" and 429 rate
// limits routinely under load, not as rare edge cases. Retry the transient
// ones with backoff before giving up.
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backoffMs = (attempt: number) => Math.min(15000, 1500 * 3 ** (attempt - 1)) + Math.random() * 500;

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

export interface GeminiCall {
  model: string;
  system: string;
  parts: GeminiPart[];
  maxOutputTokens?: number;
  /** Ask for JSON back. Defaults to true - every caller here wants structured output. */
  json?: boolean;
  /**
   * Ground the response in live Google Search results rather than only the
   * model's frozen training data. Supported combined with JSON output mode
   * on Gemini 3+ models (verified against Google's current docs, not assumed).
   */
  search?: boolean;
}

/** A real source Gemini's search grounding actually cited - not model-invented. */
export interface GroundingSource {
  title: string;
  url: string;
}

export interface GeminiResult {
  text: string;
  latencyMs: number;
  usage: { input: number | null; output: number | null };
  finishReason: string | null;
  /** Populated only when `search: true` was requested and grounding actually fired. */
  groundingSources: GroundingSource[];
}

export async function callGemini(call: GeminiCall): Promise<GeminiResult> {
  const started = Date.now();
  const body = {
    systemInstruction: { parts: [{ text: call.system }] },
    contents: [{ role: "user", parts: call.parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: call.maxOutputTokens ?? 8192,
      ...(call.json === false ? {} : { responseMimeType: "application/json" }),
    },
    ...(call.search ? { tools: [{ google_search: {} }] } : {}),
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${call.model}:generateContent`;
  const maxAttempts = 3;
  let res: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": config.geminiApiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;

    const errText = await res.text();
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new Error(`Gemini ${call.model} failed: HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json: any = await res!.json();
  const candidate = json.candidates?.[0];
  if (!candidate) throw new Error(`Gemini ${call.model} returned no candidate`);

  // Thinking models emit thought parts; those are not the answer.
  const text = (candidate.content?.parts ?? [])
    .filter((p: any) => !p.thought && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("");

  // groundingChunks carries the real sources Gemini actually consulted -
  // titles and URLs it found via search, not anything we or it invents.
  const groundingSources: GroundingSource[] = (candidate.groundingMetadata?.groundingChunks ?? [])
    .map((c: any) => (c.web ? { title: c.web.title ?? c.web.uri, url: c.web.uri } : null))
    .filter((s: GroundingSource | null): s is GroundingSource => s !== null);

  return {
    text,
    latencyMs: Date.now() - started,
    usage: {
      input: json.usageMetadata?.promptTokenCount ?? null,
      output: json.usageMetadata?.candidatesTokenCount ?? null,
    },
    finishReason: candidate.finishReason ?? null,
    groundingSources,
  };
}

/** Models sometimes wrap JSON in a fence or add a sentence around it. */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    /* fall through */
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1)) as T;
    } catch {
      /* fall through */
    }
  }
  return null;
}

export async function embedText(text: string): Promise<number[]> {
  const model = "text-embedding-004";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;
  
  const body = {
    model: `models/${model}`,
    content: { parts: [{ text }] }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": config.geminiApiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini embed failed: HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json: any = await res.json();
  const embedding = json.embedding?.values;
  if (!Array.isArray(embedding)) {
    throw new Error(`Gemini embed returned invalid response`);
  }
  return embedding;
}
