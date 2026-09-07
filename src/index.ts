import http from "http";
import { webhookCallback } from "grammy";
import { bot } from "./bot";
import { config } from "./config";

const handleUpdate = webhookCallback(bot, "http");

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/telegram-webhook") {
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

server.listen(config.port, () => {
  console.log(`BPSC bot webhook server listening on port ${config.port}`);
});
