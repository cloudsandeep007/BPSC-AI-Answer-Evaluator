import { config } from "../config";

async function setWebhook() {
  const domain = process.env.PUBLIC_URL;
  if (!domain) {
    console.error("❌ PUBLIC_URL environment variable is required (e.g., https://my-bot.up.railway.app)");
    process.exit(1);
  }

  const webhookUrl = `${domain.replace(/\/$/, "")}/telegram-webhook`;
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/setWebhook?url=${encodeURIComponent(
    webhookUrl
  )}&secret_token=${config.telegramWebhookSecret}`;

  console.log(`Setting webhook to: ${webhookUrl}`);
  
  const res = await fetch(url);
  const data = (await res.json()) as any;
  
  if (data.ok) {
    console.log("✅ Webhook set successfully!");
  } else {
    console.error("❌ Failed to set webhook:", data.description);
  }
}

setWebhook().catch(console.error);
