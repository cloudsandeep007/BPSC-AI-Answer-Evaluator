// Generates the PDF report card sent to a student after grading.
//
// Built with PDFKit rather than a headless-Chrome/HTML approach: this
// deployment already runs on a small Railway container that's had real
// friction (Node version mismatch, a socket-binding bug) - adding a ~300MB
// Chromium binary and a browser process per PDF is a real cost for a
// document that's fundamentally "structured data laid out on a page", not
// pixel-perfect CSS. PDFKit is pure JS, small, and draws vectors directly,
// which also makes the score-trend sparkline straightforward.
//
// Renders in Noto Sans Devanagari (assets/fonts/) rather than PDFKit's
// built-in fonts, which are Latin-only and cannot render Hindi at all - most
// of this app's content (questions, feedback) is Hindi. Verified this font
// renders correctly (conjuncts, matras, mixed Hindi/English lines, numerals,
// ₹, curly quotes) before building this layout around it.

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { SlotType } from "./content/answerTemplates";
import { Band, DimensionScores, Dimension, BAND_QUALITY } from "./content/calibration";
import { RUBRIC_V1 } from "./content/rubric";
import { ResolvedPointFound, ResolvedPointMissed } from "./stageB";
import { Citation } from "./citation";
import { t, type Lang } from "./text";

const FONT_DIR = path.resolve(__dirname, "..", "assets", "fonts");
const REGULAR = path.join(FONT_DIR, "NotoSansDevanagari-Regular.ttf");
const BOLD = path.join(FONT_DIR, "NotoSansDevanagari-Bold.ttf");

const COLORS = {
  ink: "#1E1B2E",
  subtle: "#6B7280",
  hairline: "#E5E7EB",
  panel: "#F8F7FC",
  brand: "#4C3A9C",
  brandDark: "#332966",
  band: {
    strong: "#16A34A",
    average: "#D97706",
    weak: "#EA580C",
    negligible: "#DC2626",
  } as Record<Band, string>,
};

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4 pt
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

export interface ReportCardInput {
  lang: Lang;
  question: {
    text: string;
    paper: string;
    subject: string;
    slotType: SlotType;
    directive: string;
    marks: number;
  };
  result: {
    totalMarks: number;
    maxMarks: number;
    band: Band;
    feedback: string;
    dimensionNotes: Record<Dimension, string>;
    pointsFound: ResolvedPointFound[];
    pointsMissed: ResolvedPointMissed[];
    todo: string[];
  };
  dimensionBands: DimensionScores;
  rubricVersion: number;
  modelName: string;
  promptVersion: string;
  generatedAt: Date;
  /** Oldest first. Prior evaluations on the same subject + directive. */
  trend?: Array<{ date: Date; totalMarks: number; maxMarks: number }>;
}

function ensurePageSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

// A title is checked for page-space on its own elsewhere would let it land
// at the bottom of a page while its first content block gets pushed to the
// next - reads as broken. Callers pass the real height of whatever comes
// right after so the two are reserved as one atomic unit.
function sectionTitle(doc: PDFKit.PDFDocument, text: string, minFollowingHeight = 0): void {
  ensurePageSpace(doc, 32 + minFollowingHeight);
  doc.moveDown(0.9);
  const y = doc.y;
  doc.rect(PAGE_MARGIN, y + 2, 4, 14).fill(COLORS.brand);
  doc.font(BOLD).fontSize(13).fillColor(COLORS.ink).text(text, PAGE_MARGIN + 12, y, { width: CONTENT_WIDTH - 12 });
  doc.moveDown(0.4);
}

function citationLine(doc: PDFKit.PDFDocument, x: number, width: number, citation: Citation): void {
  const prefix = citation.kind === "ncert" ? "NCERT — " : citation.kind === "web" ? "Source — " : "";
  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(COLORS.subtle)
    .text(prefix + citation.label + (citation.url ? `  (${citation.url})` : ""), x, doc.y, { width });
}

function citationHeight(doc: PDFKit.PDFDocument, width: number, citation: Citation): number {
  const prefix = citation.kind === "ncert" ? "NCERT — " : citation.kind === "web" ? "Source — " : "";
  return doc.font(REGULAR).fontSize(9).heightOfString(prefix + citation.label + (citation.url ? `  (${citation.url})` : ""), { width });
}

function bullet(doc: PDFKit.PDFDocument, color: string, x: number, y: number): void {
  doc.circle(x + 4, y + 6, 4).fill(color);
}

function drawHeader(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  doc.rect(0, 0, PAGE_WIDTH, 92).fill(COLORS.brandDark);
  doc
    .font(BOLD)
    .fontSize(18)
    .fillColor("#FFFFFF")
    .text("BPSC Answer Evaluation", PAGE_MARGIN, 28);
  doc
    .font(REGULAR)
    .fontSize(10)
    .fillColor("#D8D2EF")
    .text(
      `${input.question.paper} · ${input.question.subject} · ${input.question.marks} marks · ${input.question.directive}`,
      PAGE_MARGIN,
      54,
    );
  doc.text(input.generatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), PAGE_MARGIN, 70);
  doc.y = 112;
  doc.fillColor(COLORS.ink);
}

function drawQuestion(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  const text = input.question.text;
  const boxPad = 12;
  const textWidth = CONTENT_WIDTH - boxPad * 2;
  const textHeight = doc.font(REGULAR).fontSize(11).heightOfString(text, { width: textWidth });
  const boxHeight = textHeight + boxPad * 2;
  ensurePageSpace(doc, boxHeight + 16);

  const y = doc.y;
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, boxHeight, 6).fill(COLORS.panel);
  doc.font(REGULAR).fontSize(11).fillColor(COLORS.ink).text(text, PAGE_MARGIN + boxPad, y + boxPad, { width: textWidth });
  doc.y = y + boxHeight + 16;
}

function drawScoreSummary(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  ensurePageSpace(doc, 70);
  const y = doc.y;
  const bandColor = COLORS.band[input.result.band];

  doc.font(BOLD).fontSize(34).fillColor(COLORS.ink).text(`${input.result.totalMarks}`, PAGE_MARGIN, y, { continued: true });
  doc.font(REGULAR).fontSize(18).fillColor(COLORS.subtle).text(` / ${input.result.maxMarks}`);

  const bandLabel = input.result.band.charAt(0).toUpperCase() + input.result.band.slice(1);
  const badgeWidth = doc.font(BOLD).fontSize(11).widthOfString(bandLabel) + 20;
  doc.roundedRect(PAGE_MARGIN, y + 42, badgeWidth, 20, 10).fill(bandColor);
  doc.font(BOLD).fontSize(11).fillColor("#FFFFFF").text(bandLabel, PAGE_MARGIN + 10, y + 47);

  doc.y = y + 72;
}

const DIMENSION_LABELS: Record<Dimension, string> = Object.fromEntries(
  RUBRIC_V1.dimensions.map((d) => [d.key as Dimension, d.label]),
) as Record<Dimension, string>;

function drawDimensionBar(doc: PDFKit.PDFDocument, label: string, band: Band, note: string): void {
  const barWidth = 140;
  const barHeight = 8;
  const noteWidth = CONTENT_WIDTH - barWidth - 140;
  const rowHeight = dimensionRowHeight(doc, note);
  ensurePageSpace(doc, rowHeight + 6);

  const y = doc.y;
  doc.font(REGULAR).fontSize(10).fillColor(COLORS.ink).text(label, PAGE_MARGIN, y + 2, { width: 130 });

  const barX = PAGE_MARGIN + 140;
  doc.roundedRect(barX, y + 4, barWidth, barHeight, 4).fill(COLORS.hairline);
  const fillWidth = Math.max(6, barWidth * BAND_QUALITY[band]);
  doc.roundedRect(barX, y + 4, fillWidth, barHeight, 4).fill(COLORS.band[band]);

  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(COLORS.subtle)
    .text(note, barX + barWidth + 14, y, { width: noteWidth });

  doc.y = y + rowHeight;
}

function dimensionRowHeight(doc: PDFKit.PDFDocument, note: string): number {
  const noteWidth = CONTENT_WIDTH - 140 - 140;
  const noteHeight = doc.font(REGULAR).fontSize(9).heightOfString(note, { width: noteWidth });
  return Math.max(28, noteHeight + 14);
}

function drawDimensions(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  const dims = Object.keys(input.dimensionBands) as Dimension[];
  const firstHeight = dims.length ? dimensionRowHeight(doc, input.result.dimensionNotes[dims[0]] || "") : 0;
  sectionTitle(doc, t(input.lang, "scoreLabel") + " Breakdown", firstHeight);
  for (const dim of dims) {
    drawDimensionBar(doc, DIMENSION_LABELS[dim], input.dimensionBands[dim], input.result.dimensionNotes[dim] || "");
  }
}

function foundRowHeight(doc: PDFKit.PDFDocument, textWidth: number, p: ResolvedPointFound): number {
  const pointHeight = doc.font(REGULAR).fontSize(10.5).heightOfString(p.point, { width: textWidth });
  return pointHeight + citationHeight(doc, textWidth, p.source) + 10;
}

function drawPointsFound(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  if (!input.result.pointsFound.length) return;
  const textWidth = CONTENT_WIDTH - 20;
  sectionTitle(doc, t(input.lang, "foundLabel"), foundRowHeight(doc, textWidth, input.result.pointsFound[0]));
  for (const p of input.result.pointsFound) {
    const rowHeight = foundRowHeight(doc, textWidth, p);
    ensurePageSpace(doc, rowHeight);
    const y = doc.y;
    bullet(doc, COLORS.band.strong, PAGE_MARGIN, y + 1);
    doc.font(REGULAR).fontSize(10.5).fillColor(COLORS.ink).text(p.point, PAGE_MARGIN + 16, y, { width: textWidth });
    doc.y += 3;
    citationLine(doc, PAGE_MARGIN + 16, textWidth, p.source);
    doc.y += 8;
  }
}

function missedRowHeight(doc: PDFKit.PDFDocument, textWidth: number, p: ResolvedPointMissed): number {
  const pointHeight = doc.font(REGULAR).fontSize(10.5).heightOfString(p.point, { width: textWidth });
  const whyHeight = doc.font(REGULAR).fontSize(10).heightOfString(p.why_it_matters, { width: textWidth });
  return pointHeight + whyHeight + citationHeight(doc, textWidth, p.source) + 14;
}

function drawPointsMissed(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  if (!input.result.pointsMissed.length) return;
  const textWidth = CONTENT_WIDTH - 20;
  sectionTitle(doc, t(input.lang, "missedLabel"), missedRowHeight(doc, textWidth, input.result.pointsMissed[0]));
  for (const p of input.result.pointsMissed) {
    const rowHeight = missedRowHeight(doc, textWidth, p);
    ensurePageSpace(doc, rowHeight);
    const y = doc.y;
    bullet(doc, COLORS.band.negligible, PAGE_MARGIN, y + 1);
    doc.font(REGULAR).fontSize(10.5).fillColor(COLORS.ink).text(p.point, PAGE_MARGIN + 16, y, { width: textWidth });
    doc.y += 2;
    doc.font(REGULAR).fontSize(10).fillColor(COLORS.subtle).text(p.why_it_matters, PAGE_MARGIN + 16, doc.y, { width: textWidth });
    doc.y += 3;
    citationLine(doc, PAGE_MARGIN + 16, textWidth, p.source);
    doc.y += 10;
  }
}

function drawProfessorComment(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  const boxPad = 14;
  const textWidth = CONTENT_WIDTH - boxPad * 2 - 4;
  const textHeight = doc.font(REGULAR).fontSize(11).heightOfString(input.result.feedback, { width: textWidth });
  const boxHeight = textHeight + boxPad * 2;
  // The box is one visual unit - if it can't fully fit, push title+box
  // together to a fresh page rather than let it split mid-box.
  sectionTitle(doc, "Professor's Note", boxHeight + 10);

  const y = doc.y;
  doc.rect(PAGE_MARGIN, y, 3, boxHeight).fill(COLORS.brand);
  doc.roundedRect(PAGE_MARGIN + 3, y, CONTENT_WIDTH - 3, boxHeight, 4).fill(COLORS.panel);
  doc.font(REGULAR).fontSize(11).fillColor(COLORS.ink).text(input.result.feedback, PAGE_MARGIN + 3 + boxPad, y + boxPad, { width: textWidth });
  doc.y = y + boxHeight + 14;

  if (input.result.todo.length) {
    doc.font(BOLD).fontSize(10).fillColor(COLORS.ink).text(t(input.lang, "todoLabel") + ":", PAGE_MARGIN, doc.y);
    doc.moveDown(0.2);
    for (const item of input.result.todo) {
      ensurePageSpace(doc, 16);
      doc.font(REGULAR).fontSize(10).fillColor(COLORS.ink).text(`•  ${item}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    }
  }
}

function drawTrend(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  const trend = input.trend;
  if (!trend || trend.length < 2) return; // a single prior point has nothing to show a trend against

  sectionTitle(doc, `Your progress on ${input.question.subject} (${input.question.directive})`);
  const boxHeight = 90;
  ensurePageSpace(doc, boxHeight + 10);

  const chartX = PAGE_MARGIN + 10;
  const chartY = doc.y + 10;
  const chartWidth = CONTENT_WIDTH - 20;
  const chartHeight = 50;

  const points = [...trend, { date: input.generatedAt, totalMarks: input.result.totalMarks, maxMarks: input.result.maxMarks }];
  const fractions = points.map((p) => p.totalMarks / p.maxMarks);
  const stepX = chartWidth / (points.length - 1);

  doc
    .moveTo(chartX, chartY + chartHeight)
    .lineTo(chartX + chartWidth, chartY + chartHeight)
    .strokeColor(COLORS.hairline)
    .lineWidth(1)
    .stroke();

  doc.strokeColor(COLORS.brand).lineWidth(2);
  fractions.forEach((f, i) => {
    const x = chartX + stepX * i;
    const y = chartY + chartHeight - f * chartHeight;
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  });
  doc.stroke();

  fractions.forEach((f, i) => {
    const x = chartX + stepX * i;
    const y = chartY + chartHeight - f * chartHeight;
    const isLast = i === fractions.length - 1;
    doc.circle(x, y, isLast ? 4 : 3).fill(isLast ? COLORS.brand : "#FFFFFF");
    if (!isLast) doc.circle(x, y, 3).lineWidth(1.5).strokeColor(COLORS.brand).stroke();
  });

  doc
    .font(REGULAR)
    .fontSize(8)
    .fillColor(COLORS.subtle)
    .text(points[0].date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), chartX, chartY + chartHeight + 6)
    .text("today", chartX + chartWidth - 30, chartY + chartHeight + 6);

  doc.y = chartY + chartHeight + 24;
}

function drawFooter(doc: PDFKit.PDFDocument, input: ReportCardInput): void {
  const pages = doc.bufferedPageRange();
  // PDFKit auto-inserts a new page if text is placed inside the bottom
  // margin, on the assumption a flowing paragraph didn't fit - which is
  // exactly where a footer belongs. Drop the bottom margin to zero for this
  // one stamp so it doesn't fight its own page's margin.
  const originalBottom = doc.page.margins.bottom;
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 34;
    doc
      .font(REGULAR)
      .fontSize(7.5)
      .fillColor(COLORS.subtle)
      .text(
        `Rubric v${input.rubricVersion} · ${input.modelName} · ${input.promptVersion} — automated evaluation, not an official BPSC score`,
        PAGE_MARGIN,
        y,
        { width: CONTENT_WIDTH - 40, lineBreak: false },
      );
    doc.text(`${i + 1}/${pages.count}`, PAGE_WIDTH - PAGE_MARGIN - 30, y, { width: 30, align: "right", lineBreak: false });
    doc.page.margins.bottom = originalBottom;
  }
}

export function buildReportCard(input: ReportCardInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
      doc.font(REGULAR); // set a real default before any auto page-break draws text

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawHeader(doc, input);
      drawQuestion(doc, input);
      drawScoreSummary(doc, input);
      drawDimensions(doc, input);
      drawPointsFound(doc, input);
      drawPointsMissed(doc, input);
      drawTrend(doc, input);
      drawProfessorComment(doc, input);
      drawFooter(doc, input);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
