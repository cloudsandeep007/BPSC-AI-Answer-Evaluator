// Central internal AI Gateway.
// Decouples application modules from external AI providers (Google Gemini, Anthropic, OpenAI).
// Standardizes structured JSON extraction, transcription, token accounting, latency measurement, and mock modes.

import { config } from "../config";
import { GroundingSource } from "../gemini";
import { GeminiProvider } from "./providers/geminiProvider";
import { MockProvider } from "./providers/mockProvider";

export interface AIUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AIStructuredRequest {
  feature: "stage0" | "stageB" | "qualityChecker" | "general";
  model?: string;
  system: string;
  userPrompt: string;
  search?: boolean;
  maxOutputTokens?: number;
}

export interface AIStructuredResponse<T = any> {
  data: T;
  rawText: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage: AIUsage;
  groundingSources: GroundingSource[];
}

export interface AITranscriptionRequest {
  base64Image: string;
  mimeType: string;
  model?: string;
}

export interface AITranscriptionResponse {
  transcript: string;
  confidence: number | null;
  wordCount: number;
  provider: string;
  model: string;
  latencyMs: number;
  usage: AIUsage;
}

export interface AIProvider {
  name: string;
  callStructured<T>(req: AIStructuredRequest): Promise<AIStructuredResponse<T>>;
  transcribe(req: AITranscriptionRequest): Promise<AITranscriptionResponse>;
}

export class AIGateway {
  private primaryProvider: AIProvider;
  private mockProvider: AIProvider;
  private forceMock: boolean;

  constructor(options?: { forceMock?: boolean }) {
    this.primaryProvider = new GeminiProvider();
    this.mockProvider = new MockProvider();
    this.forceMock = options?.forceMock ?? config.useMockAi;
  }

  private get activeProvider(): AIProvider {
    return this.forceMock ? this.mockProvider : this.primaryProvider;
  }

  public async callStructured<T>(req: AIStructuredRequest): Promise<AIStructuredResponse<T>> {
    return this.activeProvider.callStructured<T>(req);
  }

  public async transcribe(req: AITranscriptionRequest): Promise<AITranscriptionResponse> {
    return this.activeProvider.transcribe(req);
  }
}

/** Global singleton AI Gateway instance */
export const aiGateway = new AIGateway();
