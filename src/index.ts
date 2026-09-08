import http from "http";
import { webhookCallback } from "grammy";
import { bot } from "./bot";
import { config } from "./config";

const handleUpdate = webhookCallback(bot, "http");

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/telegram-webhook") {
    if (config.telegramWebhookSecret) {
      const secret = req.headers["x-telegram-bot-api-secret-token"];
      if (secret !== config.telegramWebhookSecret) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: invalid secret token" }));
        return;
      }
    }
    await handleUpdate(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// Bind to 0.0.0.0, not Node's default. Inside a container, the default
// wildcard leaves the process reachable on the container's own loopback but
// not from Railway's edge proxy - which presents as the app logging
// "listening" happily while every request 502s.
server.listen(config.port, "0.0.0.0", () => {
  console.log(`BPSC bot webhook server listening on 0.0.0.0:${config.port}`);
});
