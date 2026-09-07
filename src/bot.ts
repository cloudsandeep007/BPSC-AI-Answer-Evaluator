import { Bot, InlineKeyboard, InputFile } from "grammy";
import { buildReportCard } from "./reportCard";
import { config } from "./config";
import { getOrCreateUser, setUserLanguage, saveSubmission, updateSubmissionTranscript } from "./supabase";
import { transcribeImage } from "./stageA";
import { generateQuestion, AVAILABLE_TOPICS } from "./stage0";
import { SlotType } from "./content/answerTemplates";
import { evaluateSubmission } from "./stageB";
import { sha256 } from "./hash";
import { t, type Lang } from "./text";

const LANGUAGE_LABEL: Record<Lang, string> = {
  hi: "Hindi",
  hinglish: "Hinglish (Hindi written in Roman script)",
  en: "English",
};

export const bot = new Bot(config.telegramBotToken);

interface EditState {
  submissionId: string;
  originalTranscript: string;
  originalWordCount: number;
}

interface PendingReplacement extends EditState {
  newTranscript: string;
  newWordCount: number;
}

// Telegram user id -> state, only while we're waiting for them to type a
// corrected transcript after tapping "Edit". In-memory by design: small,
// ephemeral, single-process state. If the process restarts mid-edit, the
// student's next message just won't match anything and is ignored - they
// re-send the photo. Acceptable at this stage; revisit if it becomes a
// real problem once traffic is real.
const awaitingEdit = new Map<number, EditState>();

// Telegram user id -> a proposed replacement that looked like it might be a
// short note rather than a full rewrite, waiting on an explicit yes/no
// before it overwrites the saved transcript. See the word-count guard in
// the message:text handler below for why this exists.
const pendingReplacement = new Map<number, PendingReplacement>();

// A "corrected answer" that comes back much shorter than what was already
// saved is more likely a short note ("add X under heading Y") than an
// intentional full rewrite - a costly mistake to apply silently, since it
// destroys the rest of the transcript. Only guards non-trivial answers;
// a genuinely short original answer replaced by another short one is fine.
const SHRINK_GUARD_MIN_ORIGINAL_WORDS = 15;
const SHRINK_GUARD_RATIO = 0.5;

// Which question each student is currently answering. In memory, like the
// edit state above: there is no column on `users` for it, and adding one
// needs a migration. On restart this falls back to the newest active
// question, which is correct while only one question is live at a time.
const currentQuestion = new Map<number, string>();

async function questionForUser(telegramId: number): Promise<string | null> {
  // No fallback to "the newest active question" here on purpose: once
  // different students can each have their own freshly-generated question
  // (see /question below), guessing "the newest one" would sometimes hand a
  // student someone else's question after a restart. Returning null makes
  // gradeAndReply correctly ask them to run /question again instead.
  return currentQuestion.get(telegramId) ?? null;
}

// Short codes for callback_data - keeps payloads well under Telegram's 64-byte
// limit regardless of how the topic strings themselves are spelled.
const TOPIC_CODES: Record<string, string> = Object.fromEntries(AVAILABLE_TOPICS.map((t, i) => [String(i), t]));
const TOPIC_CODE_BY_NAME = Object.fromEntries(Object.entries(TOPIC_CODES).map(([code, name]) => [name, code]));

function topicKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  AVAILABLE_TOPICS.forEach((topic, i) => {
    kb.text(topic, `topic:${TOPIC_CODE_BY_NAME[topic]}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

function slotTypeKeyboard(topicCode: string, lang: Lang): InlineKeyboard {
  const shortLabel =
    lang === "hi" ? "छोटा उत्तर (6-8 अंक)" : lang === "hinglish" ? "Chhota answer (6-8 marks)" : "Short answer (6-8 marks)";
  const longLabel =
    lang === "hi" ? "लंबा/निबंधात्मक उत्तर (36-38 अंक)" : lang === "hinglish" ? "Lamba/nibandh-type answer (36-38 marks)" : "Long/essay-type answer (36-38 marks)";
  return new InlineKeyboard()
    .text(shortLabel, `slot:${topicCode}:compulsory_subpart`)
    .row()
    .text(longLabel, `slot:${topicCode}:choice_essay`);
}

async function sendGeneratedQuestion(ctx: any, telegramId: number, lang: Lang, topic: string, slotType: SlotType): Promise<void> {
  await ctx.reply(t(lang, "generatingQuestion"));
  try {
    const generated = await generateQuestion({ topic, slotType });
    currentQuestion.set(telegramId, generated.questionId);
    await ctx.reply(
      `<b>${escapeHtml(t(lang, "questionHeader"))}</b> (${generated.marks} marks, ~${generated.wordLimit} words)\n\n` +
        `${escapeHtml(generated.questionText)}\n\n` +
        `<i>${escapeHtml(t(lang, "questionFooter"))}</i>`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    console.error("Stage 0 failed:", err);
    await ctx.reply(t(lang, "somethingWrong"));
  }
}

function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("हिन्दी", "lang:hi").text("Hinglish", "lang:hinglish").text("English", "lang:en");
}

bot.command("start", async (ctx) => {
  const telegramId = ctx.from!.id;
  await getOrCreateUser(telegramId, ctx.from?.first_name);
  await ctx.reply("नमस्ते! Welcome. आप किस भाषा में बात करना पसंद करेंगे? / Choose your language:", {
    reply_markup: languageKeyboard(),
  });
});

bot.callbackQuery(/^lang:(hi|hinglish|en)$/, async (ctx) => {
  const lang = ctx.match![1] as Lang;
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  await setUserLanguage(user.id, lang);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(t(lang, "confirmed"));
  await ctx.reply(t(lang, "sendPhoto"));
});

// Serves the student a question to answer. Always generates a NEW question
// via Stage 0, for a topic and marks-type the student picks - it never
// reuses a previously-generated one. (Reusing "whatever's already active"
// was the earlier bug: every student got the exact same question forever
// after the first one was ever generated.)
bot.command("question", async (ctx) => {
  const telegramId = ctx.from!.id;
  const user = await getOrCreateUser(telegramId, ctx.from?.first_name);
  if (!user.language) {
    await ctx.reply(t("en", "needLanguage"), { reply_markup: languageKeyboard() });
    return;
  }
  await ctx.reply(t(user.language, "pickTopic"), { reply_markup: topicKeyboard() });
});

bot.callbackQuery(/^topic:(\d+)$/, async (ctx) => {
  const topicCode = ctx.match![1];
  const topic = TOPIC_CODES[topicCode];
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();

  if (!topic) return;

  // The Essay Paper has only one slot type - no marks-type question needed.
  if (topic === "Essay") {
    await sendGeneratedQuestion(ctx, telegramId, lang, topic, "essay_paper");
    return;
  }

  await ctx.reply(t(lang, "pickSlotType"), { reply_markup: slotTypeKeyboard(topicCode, lang) });
});

bot.callbackQuery(/^slot:(\d+):(compulsory_subpart|choice_essay)$/, async (ctx) => {
  const [, topicCode, slotType] = ctx.match!;
  const topic = TOPIC_CODES[topicCode];
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();

  if (!topic) return;
  await sendGeneratedQuestion(ctx, telegramId, lang, topic, slotType as SlotType);
});

bot.on("message:photo", async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);

  if (!user.language) {
    await ctx.reply(t("en", "needLanguage"), { reply_markup: languageKeyboard() });
    return;
  }
  const lang = user.language;

  await ctx.reply(t(lang, "reading"));

  // Telegram sends multiple resolutions; the highest is last in the array.
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

  const res = await fetch(fileUrl);
  const buffer = Buffer.from(await res.arrayBuffer()); // held in memory only, never written to disk

  const imageSha256 = sha256(buffer);
  const base64 = buffer.toString("base64");

  let result;
  try {
    result = await transcribeImage(base64, "image/jpeg");
  } catch (err) {
    console.error("Stage A transcription failed:", err);
    await ctx.reply(t(lang, "somethingWrong"));
    return;
  }

  // Link the answer to the question it was actually written for. Falls back
  // to the bookkeeping placeholder only if the student never asked for a
  // question - in that case there is nothing to grade against.
  const questionId = (await questionForUser(telegramId)) ?? config.placeholderQuestionId;

  const submissionId = await saveSubmission({
    user_id: user.id,
    question_id: questionId,
    image_sha256: imageSha256,
    transcript: result.transcript,
    transcript_confidence: result.confidence,
    word_count: result.wordCount,
  });

  if (result.confidence !== null && result.confidence < config.confidenceThreshold) {
    await ctx.reply(t(lang, "lowConfidence"));
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(t(lang, "btnConfirm"), `confirm:${submissionId}`)
    .text(t(lang, "btnEdit"), `edit:${submissionId}`);

  await ctx.reply(withTranscriptBlock(t(lang, "confirmPrompt"), result.transcript), {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });
});

bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
  const submissionId = ctx.match![1];
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup(); // remove the buttons so a second tap can't double-confirm
  await ctx.reply(t(lang, "confirmed"));

  // Confirming the transcript is what triggers grading.
  await gradeAndReply(ctx, submissionId, lang);
});

/** Runs Stage B on a confirmed transcript and sends the student their mark. */
async function gradeAndReply(ctx: any, submissionId: string, lang: Lang): Promise<void> {
  const questionId = await questionForUser(ctx.from.id);
  if (!questionId || questionId === config.placeholderQuestionId) {
    await ctx.reply(t(lang, "noQuestion"));
    return;
  }

  await ctx.reply(t(lang, "grading"));
  try {
    const result = await evaluateSubmission(submissionId, LANGUAGE_LABEL[lang]);

    const lines: string[] = [
      `<b>${escapeHtml(t(lang, "scoreLabel"))}: ${result.totalMarks} / ${result.maxMarks}</b>`,
      "",
      escapeHtml(result.feedback),
    ];

    if (result.pointsFound.length) {
      lines.push("", `<b>${escapeHtml(t(lang, "foundLabel"))}</b>`);
      for (const p of result.pointsFound) lines.push(`✅ ${escapeHtml(p.point)}`);
    }
    if (result.pointsMissed.length) {
      lines.push("", `<b>${escapeHtml(t(lang, "missedLabel"))}</b>`);
      for (const p of result.pointsMissed) {
        lines.push(`❌ ${escapeHtml(p.point)} — ${escapeHtml(p.why_it_matters)}`);
      }
    }
    if (result.todo.length) {
      lines.push("", `<b>${escapeHtml(t(lang, "todoLabel"))}</b>`);
      for (const item of result.todo) lines.push(`• ${escapeHtml(item)}`);
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });

    // The text summary above lets the student see their score immediately;
    // the PDF is the fuller, citation-backed record. Generated synchronously
    // - PDFKit builds this from data in tens of milliseconds, noise next to
    // the Gemini call that already ran, so there's no real latency tradeoff
    // to make here.
    try {
      const pdf = await buildReportCard({
        lang,
        question: result.question,
        result: {
          totalMarks: result.totalMarks,
          maxMarks: result.maxMarks,
          band: result.band,
          feedback: result.feedback,
          dimensionNotes: result.dimensionNotes,
          pointsFound: result.pointsFound,
          pointsMissed: result.pointsMissed,
          todo: result.todo,
        },
        dimensionBands: result.dimensions,
        rubricVersion: result.rubricVersion,
        modelName: result.modelName,
        promptVersion: result.promptVersion,
        generatedAt: new Date(),
        trend: result.trend.map((p) => ({ ...p, maxMarks: p.maxMarks || result.maxMarks })),
      });
      await ctx.replyWithDocument(new InputFile(pdf, "report-card.pdf"));
    } catch (err) {
      console.error("PDF report card failed:", err);
      // The student already has their score from the text summary above -
      // a missing PDF is a degraded experience, not a failed evaluation.
    }
  } catch (err) {
    console.error("Stage B failed:", err);
    await ctx.reply(t(lang, "gradeFailed"));
  }
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Telegram renders normal messages in a proportional font, which collapses
// any spacing the model used to line up branches of a tree/mind-map diagram
// - the transcript itself is fine, but it looks visually broken. Wrapping
// it in <pre> forces a monospace block, which actually preserves alignment.
function withTranscriptBlock(intro: string, transcript: string): string {
  return `${escapeHtml(intro)}\n\n<pre>${escapeHtml(transcript)}</pre>`;
}

bot.callbackQuery(/^edit:(.+)$/, async (ctx) => {
  const submissionId = ctx.match![1];
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";

  // The prompt text this button is attached to already contains the current
  // transcript (see confirmPrompt below, joined with a blank line) - pull
  // it back out so we can show it again in the edit prompt and compare
  // word counts on the way back.
  const currentText = ctx.callbackQuery.message?.text ?? "";
  const separatorIndex = currentText.indexOf("\n\n");
  const originalTranscript = separatorIndex === -1 ? currentText : currentText.slice(separatorIndex + 2);

  awaitingEdit.set(telegramId, {
    submissionId,
    originalTranscript,
    originalWordCount: wordCount(originalTranscript),
  });
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.reply(withTranscriptBlock(t(lang, "editAsk"), originalTranscript), { parse_mode: "HTML" });
});

bot.callbackQuery("edit-confirm", async (ctx) => {
  const telegramId = ctx.from.id;
  const pending = pendingReplacement.get(telegramId);
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  if (!pending) return;

  await updateSubmissionTranscript(pending.submissionId, pending.newTranscript, pending.newWordCount);
  pendingReplacement.delete(telegramId);
  await ctx.editMessageReplyMarkup();
  await ctx.reply(t(lang, "editSaved"));

  // A saved edit is a confirmed transcript - grade it.
  await gradeAndReply(ctx, pending.submissionId, lang);
});

bot.callbackQuery("edit-cancel", async (ctx) => {
  const telegramId = ctx.from.id;
  const pending = pendingReplacement.get(telegramId);
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  if (!pending) return;

  // Put them back into "awaiting edit" so they can try again without
  // re-tapping the original Edit button.
  awaitingEdit.set(telegramId, {
    submissionId: pending.submissionId,
    originalTranscript: pending.originalTranscript,
    originalWordCount: pending.originalWordCount,
  });
  pendingReplacement.delete(telegramId);
  await ctx.editMessageReplyMarkup();
  await ctx.reply(t(lang, "editCancelled"));
});

bot.on("message:text", async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";

  const state = awaitingEdit.get(telegramId);
  if (!state) {
    // Never leave the student without any response - even an unrecognized
    // message gets a nudge back toward the one thing this bot does.
    await ctx.reply(t(lang, "unrecognized"));
    return;
  }

  const correctedText = ctx.message.text;
  const newWordCount = wordCount(correctedText);

  const looksLikeANoteNotAReplacement =
    state.originalWordCount >= SHRINK_GUARD_MIN_ORIGINAL_WORDS &&
    newWordCount < state.originalWordCount * SHRINK_GUARD_RATIO;

  if (looksLikeANoteNotAReplacement) {
    awaitingEdit.delete(telegramId);
    pendingReplacement.set(telegramId, { ...state, newTranscript: correctedText, newWordCount });
    const keyboard = new InlineKeyboard()
      .text(t(lang, "btnEditConfirm"), "edit-confirm")
      .text(t(lang, "btnEditCancel"), "edit-cancel");
    await ctx.reply(
      `${t(lang, "editShrinkWarning")}\n\n(${state.originalWordCount} → ${newWordCount} words)`,
      { reply_markup: keyboard },
    );
    return;
  }

  await updateSubmissionTranscript(state.submissionId, correctedText, newWordCount);
  awaitingEdit.delete(telegramId);
  await ctx.reply(t(lang, "editSaved"));

  // A saved edit is a confirmed transcript - grade it.
  await gradeAndReply(ctx, state.submissionId, lang);
});

bot.catch((err) => {
  console.error("Unhandled bot error:", err);
});
