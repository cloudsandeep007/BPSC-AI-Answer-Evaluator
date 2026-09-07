// Converts the BPSC source documents into structured JSON the app can use.
//
//   npx tsx scripts/ingest-content.ts
//
// Re-run this if the source documents change. The generated files in
// src/content/ are committed, so the app never depends on those Word/CSV
// files being present at runtime - but this script records exactly how they
// were derived, so the data isn't hand-typed guesswork.
//
// Sources (all under D:\Claude\Govt exam prep\BPSC\):
//   BPSC-Question-Bank.csv                              -> question-patterns.json
//   NCERT Knowledge Base - BPSC Priority Subjects.docx  -> ncert-knowledge.json

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BPSC_DIR = "D:\\Claude\\Govt exam prep\\BPSC";
const OUT_DIR = path.resolve(__dirname, "..", "src", "content");

// ---------------------------------------------------------------- csv parsing

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------- question patterns

// Which of the four answer-structure templates a question belongs to.
// Template 4 (statistics / data interpretation) is deliberately out of scope -
// it needs chart generation, which neither Stage 0 nor Stage B handles.
function slotTypeFor(paper: string): "essay_paper" | "choice_essay" | "compulsory_subpart" {
  if (paper === "Essay Paper") return "essay_paper";
  // GS papers mix compulsory sub-parts and choice essays; the bank doesn't
  // distinguish them per row, so Stage 0 picks the slot and this only
  // records which paper the topic pattern came from.
  return "choice_essay";
}

function buildQuestionPatterns() {
  const csvPath = path.join(BPSC_DIR, "BPSC-Question-Bank.csv");
  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(raw);
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const data = rows.slice(1).filter((r) => r.some((c) => c && c.trim()));

  const questions = data.map((r) => ({
    id: (r[idx("ID")] || "").trim(),
    paper: (r[idx("Paper")] || "").trim(),
    exam_ref: (r[idx("Year / Exam No.")] || "").trim(),
    topic: (r[idx("Topic")] || "").trim(),
    directive: (r[idx("Directive")] || "").trim(),
    marks: Number((r[idx("Marks")] || "").trim()) || null,
    // Kept ONLY as a style reference for question generation. Stage 0 must
    // never reproduce these, and enforces that with a similarity check.
    text: (r[idx("Question")] || "").trim(),
  }));

  const tally = (key: "topic" | "paper" | "directive") => {
    const m: Record<string, number> = {};
    for (const q of questions) {
      const v = q[key] || "(unspecified)";
      m[v] = (m[v] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  };

  // Topic frequency *within* each paper - this is what Stage 0 samples from,
  // so generated questions mirror the real exam's topic mix.
  const byPaper: Record<string, Record<string, number>> = {};
  for (const q of questions) {
    const p = q.paper || "(unspecified)";
    byPaper[p] = byPaper[p] || {};
    const t = q.topic || "(unspecified)";
    byPaper[p][t] = (byPaper[p][t] || 0) + 1;
  }

  // Directive frequency per topic - "Discuss" dominates Polity, but Science
  // & Tech leans on "Explain"; generating in the right proportion matters.
  const directivesByTopic: Record<string, Record<string, number>> = {};
  for (const q of questions) {
    const t = q.topic || "(unspecified)";
    directivesByTopic[t] = directivesByTopic[t] || {};
    const d = q.directive || "Other";
    directivesByTopic[t][d] = (directivesByTopic[t][d] || 0) + 1;
  }

  return {
    _source: "BPSC-Question-Bank.csv",
    _generated_by: "scripts/ingest-content.ts",
    _warning:
      "Historical questions are pattern/style data only. They must never be served to a student verbatim - Stage 0 generates new questions and rejects any that are too similar to these.",
    total: questions.length,
    distribution: {
      by_paper: tally("paper"),
      by_topic: tally("topic"),
      by_directive: tally("directive"),
      topic_by_paper: byPaper,
      directive_by_topic: directivesByTopic,
    },
    questions,
  };
}

// -------------------------------------------------------- ncert knowledge

function docxParagraphs(file: string): string[] {
  // python-docx is already installed and handles Devanagari correctly;
  // shelling out beats reimplementing OOXML parsing here.
  // ensure_ascii=True keeps the payload pure ASCII, which sidesteps Windows'
  // cp1252 stdout encoding entirely - Devanagari and arrows survive as \\uXXXX
  // escapes and JSON.parse restores them.
  const script = `
import docx, sys, json
d = docx.Document(sys.argv[1])
out = [p.text for p in d.paragraphs if p.text.strip()]
sys.stdout.write(json.dumps(out, ensure_ascii=True))
`;
  const result = execFileSync("python", ["-c", script, file], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  return JSON.parse(result);
}

function buildNcertKnowledge() {
  const file = path.join(BPSC_DIR, "NCERT Knowledge Base - BPSC Priority Subjects.docx");
  const paras = docxParagraphs(file);

  // The document is organised as ALL-CAPS topic banners (POLITY, ECONOMY,
  // HISTORY & CULTURE) containing titled entries, each followed by its body.
  const TOPIC_BANNERS = new Set(["POLITY", "ECONOMY", "HISTORY & CULTURE"]);
  // Map the document's own section names onto the question bank's topic
  // vocabulary, so Stage 0 can retrieve by the same topic key it sampled.
  const TOPIC_KEY: Record<string, string> = {
    POLITY: "Polity",
    ECONOMY: "Geography & Economics",
    "HISTORY & CULTURE": "History & Culture",
  };

  // The book title and class per topic, per the source document's own
  // compiled note ("...from the current NCERT Class 11 Political Science
  // ('Indian Constitution at Work') and Class 11 Economics ('Indian Economic
  // Development') textbooks"). History headings already embed their own
  // class + book title, so they don't need a prefix here.
  const NCERT_BOOK_BY_TOPIC: Record<string, string> = {
    Polity: "NCERT Class 11 Political Science, Indian Constitution at Work",
    "Geography & Economics": "NCERT Class 11 Economics, Indian Economic Development",
  };

  /** A real, specific citation - book, class, chapter - not just "NCERT". */
  function citationFor(topic: string, heading: string): string {
    if (/Class\s+\d+/i.test(heading)) return `NCERT ${heading}`;
    const book = NCERT_BOOK_BY_TOPIC[topic];
    return book ? `${book}, ${heading}` : `NCERT, ${heading}`;
  }

  const entries: Array<{ id: string; topic: string; heading: string; citation: string; text: string }> = [];
  let currentTopic = "";
  let currentHeading = "";
  let buffer: string[] = [];

  const flush = () => {
    if (currentTopic && currentHeading && buffer.length) {
      const topic = TOPIC_KEY[currentTopic] ?? currentTopic;
      entries.push({
        id: `ncert-${String(entries.length + 1).padStart(3, "0")}`,
        topic,
        heading: currentHeading,
        citation: citationFor(topic, currentHeading),
        text: buffer.join("\n").trim(),
      });
    }
    buffer = [];
  };

  // A heading is a short line that isn't a full sentence of body prose.
  const looksLikeHeading = (s: string) =>
    s.length < 90 && !s.endsWith(".") && !s.startsWith("Purpose:") && /[A-Za-z]/.test(s);

  for (const p of paras) {
    const line = p.trim();
    if (TOPIC_BANNERS.has(line)) {
      flush();
      currentTopic = line;
      currentHeading = "";
      continue;
    }
    if (!currentTopic) continue; // preamble before the first topic banner
    if (looksLikeHeading(line)) {
      flush();
      currentHeading = line;
    } else {
      buffer.push(line);
    }
  }
  flush();

  // The source document ends with a self-assessment of what it doesn't cover.
  // That's important context, but it is not retrievable fact content - keep it
  // as a note rather than letting Stage 0 cite it as NCERT knowledge.
  const isGapNote = (heading: string) => /not yet covered|what's missing|still missing/i.test(heading);
  const knownGaps = entries.filter((e) => isGapNote(e.heading)).map((e) => e.text);
  const factEntries = entries.filter((e) => !isGapNote(e.heading));

  return {
    _source: "NCERT Knowledge Base - BPSC Priority Subjects.docx",
    _generated_by: "scripts/ingest-content.ts",
    _note:
      "First-priority fact source for Stage 0. Topics not covered here (Current Affairs, Science & Technology, most Geography) fall back to the model's general knowledge - see coverage below.",
    coverage: {} as Record<string, number>,
    known_gaps: knownGaps,
    entries: factEntries,
  };
}

// ------------------------------------------------------------------- main

fs.mkdirSync(OUT_DIR, { recursive: true });

const patterns = buildQuestionPatterns();
fs.writeFileSync(path.join(OUT_DIR, "question-patterns.json"), JSON.stringify(patterns, null, 2), "utf8");
console.log(`question-patterns.json  ${patterns.total} questions`);
console.log(`   topics: ${Object.entries(patterns.distribution.by_topic).map(([k, v]) => `${k} (${v})`).join(", ")}`);

const ncert = buildNcertKnowledge();
for (const e of ncert.entries) ncert.coverage[e.topic] = (ncert.coverage[e.topic] || 0) + 1;
fs.writeFileSync(path.join(OUT_DIR, "ncert-knowledge.json"), JSON.stringify(ncert, null, 2), "utf8");
console.log(`ncert-knowledge.json    ${ncert.entries.length} entries`);
console.log(`   coverage: ${Object.entries(ncert.coverage).map(([k, v]) => `${k} (${v})`).join(", ")}`);
