// Shared citation shape for every point Stage 0 sets and Stage B judges
// against. Every point must be traceable to something real - never a bare
// "NCERT" or "general knowledge" label with nothing to check it against.

export type CitationKind = "ncert" | "web" | "general_knowledge";

export interface Citation {
  kind: CitationKind;
  /** The specific, human-readable citation - book/class/chapter, a named
   *  report/ministry/dataset, or a search result's own title. */
  label: string;
  /** Only present for kind: "web" - a real URL Gemini's search grounding
   *  actually found, never invented. */
  url?: string;
}

const VALID_KINDS = new Set<CitationKind>(["ncert", "web", "general_knowledge"]);

/** Defends against a model returning a bare string or a malformed object. */
export function asCitation(v: unknown): Citation {
  if (v && typeof v === "object" && "kind" in v && "label" in v) {
    const c = v as Partial<Citation>;
    if (VALID_KINDS.has(c.kind as CitationKind) && typeof c.label === "string" && c.label.trim()) {
      return { kind: c.kind as CitationKind, label: c.label.trim(), url: typeof c.url === "string" ? c.url : undefined };
    }
  }
  // Legacy/malformed shape - still surface something rather than dropping the point.
  const label = typeof v === "string" ? v : "general knowledge";
  return { kind: "general_knowledge", label };
}
