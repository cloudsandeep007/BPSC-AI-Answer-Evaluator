// Local testing without a public URL / Railway deploy: runs the same bot
// via long-polling instead of a webhook. Never use this in production
// alongside a webhook - Telegram allows only one active update source.
//   npm run dev:polling
import { bot } from "./bot";

bot.start({
  onStart: (info) => console.log(`Bot @${info.username} is polling for updates...`),
});
