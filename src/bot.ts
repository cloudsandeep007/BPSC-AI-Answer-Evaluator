import { Bot, InlineKeyboard } from "grammy";
import { config, PLACEHOLDER_QUESTION_ID } from "./config";
import { getOrCreateUser, setUserLanguage, saveSubmission, updateSubmissionTranscript } from "./supabase";
import { transcribeImage } from "./stageA";
import { sha256 } from "./hash";
import { t, type Lang } from "./text";

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

  const submissionId = await saveSubmission({
    user_id: user.id,
    question_id: PLACEHOLDER_QUESTION_ID,
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
  const telegramId = ctx.from.id;
  const user = await getOrCreateUser(telegramId, ctx.from.first_name);
  const lang = user.language ?? "en";
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup(); // remove the buttons so a second tap can't double-confirm
  await ctx.reply(t(lang, "confirmed"));
});

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
});

bot.catch((err) => {
  console.error("Unhandled bot error:", err);
});
