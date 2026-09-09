import { Bot, InlineKeyboard, InputFile } from "grammy";
import { buildReportCard } from "./reportCard";
import { config } from "./config";
import {
  getOrCreateUser,
  setUserLanguage,
  saveSubmission,
  updateSubmissionTranscript,
  updateSubmissionStoragePath,
  setUserActiveQuestion,
  getUserActiveQuestion,
  setUserEditState,
  getUserEditState,
} from "./supabase";
import { storageService } from "./storage/supabaseStorage";
import { queueManager } from "./queue/queueManager";
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

// SHRINK GUARD: A "corrected answer" that comes back much shorter than what was already
// saved is more likely a short note ("add X under heading Y") than an
// intentional full rewrite - a costly mistake to apply silently, since it
// destroys the rest of the transcript. Only guards non-trivial answers;
// a genuinely short original answer replaced by another short one is fine.
const SHRINK_GUARD_MIN_ORIGINAL_WORDS = 15;
const SHRINK_GUARD_RATIO = 0.5;

async function questionForUser(telegramId: number): Promise<string | null> {
  return getUserActiveQuestion(telegramId);
}

// General & Miscellaneous (BPSC-SUB-10) is currently not exposed for practice
// because it has no production topic taxonomy.
const SELECTABLE_TOPICS = AVAILABLE_TOPICS.filter(
  (t) => t.toLowerCase() !== "general & miscellaneous" && t.toLowerCase() !== "bpsc-sub-10"
);

// Short codes for callback_data - keeps payloads well under Telegram's 64-byte
// limit regardless of how the topic strings themselves are spelled.
const TOPIC_CODES: Record<string, string> = Object.fromEntries(SELECTABLE_TOPICS.map((t, i) => [String(i), t]));
const TOPIC_CODE_BY_NAME = Object.fromEntries(Object.entries(TOPIC_CODES).map(([code, name]) => [name, code]));

function topicKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  SELECTABLE_TOPICS.forEach((topic, i) => {
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
    await setUserActiveQuestion(telegramId, generated.questionId);
    await ctx.reply(
      `<b>${escapeHtml(t(lang, "questionHeader"))}</b> (${generated.marks} marks, ~${generated.wordLimit} words)\n\n` +
        `${escapeHtml(generated.questionText)}\n\n` +
        `<i>${escapeHtml(t(lang, "questionFooter"))}</i>`,
      { parse_mode: "HTML" },
    );
  } catch (err: any) {
    console.error("Stage 0 failed:", err);
    if (err?.message?.includes("unavailable for practice") || err?.message?.includes("BPSC-SUB-10")) {
      await ctx.reply(t(lang, "subjectUnavailable"));
    } else {
      await ctx.reply(t(lang, "somethingWrong"));
    }
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
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const lang = ctx.match![1] as Lang;
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId, ctx.from.first_name);
    await setUserLanguage(user.id, lang);
    await ctx.editMessageText(t(lang, "confirmed")).catch(() => {});
    await ctx.reply(t(lang, "pickTopic"), { reply_markup: topicKeyboard() });
  } catch (err) {
    console.error("Error in lang callback:", err);
  }
});

// Serves the student a question to answer. Always generates a NEW question
// via Stage 0, for a topic and marks-type the student picks - it never
// reuses a previously-generated one. (Reusing "whatever's already active"
// was the earlier bug: every student got the exact same question forever
// after the first one was ever generated.)
bot.command("question", async (ctx) => {
  try {
    const telegramId = ctx.from!.id;
    const user = await getOrCreateUser(telegramId, ctx.from?.first_name);
    if (!user.language) {
      await ctx.reply(t("en", "needLanguage"), { reply_markup: languageKeyboard() });
      return;
    }
    await ctx.reply(t(user.language, "pickTopic"), { reply_markup: topicKeyboard() });
  } catch (err) {
    console.error("Error in /question command:", err);
  }
});

bot.callbackQuery(/^topic:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageReplyMarkup().catch(() => {});
    const topicCode = ctx.match![1];
    const topic = TOPIC_CODES[topicCode];
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId, ctx.from.first_name);
    const lang = user.language ?? "en";

    if (!topic) return;

    // The Essay Paper has only one slot type - no marks-type question needed.
    if (topic === "Essay") {
      sendGeneratedQuestion(ctx, telegramId, lang, topic, "essay_paper").catch((err) => console.error("Stage 0 async failed:", err));
      return;
    }

    await ctx.reply(t(lang, "pickSlotType"), { reply_markup: slotTypeKeyboard(topicCode, lang) });
  } catch (err) {
    console.error("Error in topic callback:", err);
  }
});

bot.callbackQuery(/^slot:(\d+):(compulsory_subpart|choice_essay)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageReplyMarkup().catch(() => {});
    const [, topicCode, slotType] = ctx.match!;
    const topic = TOPIC_CODES[topicCode];
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId, ctx.from.first_name);
    const lang = user.language ?? "en";

    if (!topic) return;
    sendGeneratedQuestion(ctx, telegramId, lang, topic, slotType as SlotType).catch((err) => console.error("Stage 0 async failed:", err));
  } catch (err) {
    console.error("Error in slot callback:", err);
  }
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

  // Persist original image buffer to Supabase Storage asynchronously
  storageService.uploadAnswerSheet(user.id, submissionId, buffer, "image/jpeg")
    .then((storagePath) => updateSubmissionStoragePath(submissionId, storagePath))
    .catch((err) => console.warn("Background storage upload notice:", err));

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
  gradeAndReply(ctx, submissionId, lang).catch((err) => console.error("Stage B async failed:", err));
});

/** Runs Stage B on a confirmed transcript and sends the student their mark. */
async function gradeAndReply(ctx: any, submissionId: string, lang: Lang): Promise<void> {
  const questionId = await questionForUser(ctx.from.id);
  if (!questionId || questionId === config.placeholderQuestionId) {
    await ctx.reply(t(lang, "noQuestion"));
    return;
  }

  await ctx.reply(t(lang, "grading"));

  await queueManager.enqueueEvaluation(
    {
      submissionId,
      telegramId: ctx.from.id,
      languageLabel: LANGUAGE_LABEL[lang],
      lang,
    },
    async (payload) => {
      try {
        const result = await evaluateSubmission(payload.submissionId, payload.languageLabel);

        const lines: string[] = [
          `<b>${escapeHtml(t(payload.lang, "scoreLabel"))}: ${result.totalMarks} / ${result.maxMarks}</b>`,
          "",
          escapeHtml(result.feedback),
        ];

        if (result.pointsFound.length) {
          lines.push("", `<b>${escapeHtml(t(payload.lang, "foundLabel"))}</b>`);
          for (const p of result.pointsFound) lines.push(`✅ ${escapeHtml(p.point)}`);
        }
        if (result.pointsMissed.length) {
          lines.push("", `<b>${escapeHtml(t(payload.lang, "missedLabel"))}</b>`);
          for (const p of result.pointsMissed) {
            lines.push(`❌ ${escapeHtml(p.point)} — ${escapeHtml(p.why_it_matters)}`);
          }
        }
        if (result.todo.length) {
          lines.push("", `<b>${escapeHtml(t(payload.lang, "todoLabel"))}</b>`);
          for (const item of result.todo) lines.push(`• ${escapeHtml(item)}`);
        }

        await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });

        try {
          const pdf = await buildReportCard({
            lang: payload.lang,
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
        }
      } catch (err) {
        console.error("Stage B failed:", err);
        await ctx.reply(t(payload.lang, "gradeFailed"));
      }
    },
  );
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

  await setUserEditState(telegramId, {
    status: "awaiting_edit",
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
  const pending = await getUserEditState<any>(telegramId);
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  if (!pending || pending.status !== "pending_replacement") return;

  await updateSubmissionTranscript(pending.submissionId, pending.newTranscript, pending.newWordCount);
  await setUserEditState(telegramId, null);
  await ctx.editMessageReplyMarkup();
  await ctx.reply(t(lang, "editSaved"));

  // A saved edit is a confirmed transcript - grade it.
  gradeAndReply(ctx, pending.submissionId, lang).catch((err) => console.error("Stage B async failed:", err));
});

bot.callbackQuery("edit-cancel", async (ctx) => {
  const telegramId = ctx.from.id;
  const pending = await getUserEditState<any>(telegramId);
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  if (!pending) return;

  // Put them back into "awaiting_edit" so they can try again without
  // re-tapping the original Edit button.
  await setUserEditState(telegramId, {
    status: "awaiting_edit",
    submissionId: pending.submissionId,
    originalTranscript: pending.originalTranscript,
    originalWordCount: pending.originalWordCount,
  });
  await ctx.editMessageReplyMarkup();
  await ctx.reply(t(lang, "editCancelled"));
});

bot.on("message:text", async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";

  const state = await getUserEditState<any>(telegramId);
  if (!state || state.status !== "awaiting_edit") {
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
    await setUserEditState(telegramId, {
      ...state,
      status: "pending_replacement",
      newTranscript: correctedText,
      newWordCount,
    });
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
  await setUserEditState(telegramId, null);
  await ctx.reply(t(lang, "editSaved"));

  // A saved edit is a confirmed transcript - grade it.
  gradeAndReply(ctx, state.submissionId, lang).catch((err) => console.error("Stage B async failed:", err));
});

bot.catch((err) => {
  console.error("Unhandled bot error:", err);
});
