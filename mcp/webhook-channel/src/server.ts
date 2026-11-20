// server.ts: точка входу. Claude Code спавнить цей файл як stdio-підпроцес.
// stdout належить JSON-RPC, тому вся діагностика йде тільки у stderr.

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createChannel } from "./channel.js";

const HOST = "127.0.0.1"; // лише локальний інтерфейс; назовні канал не слухає
const PORT = Number(process.env.WEBHOOK_PORT ?? 8791);
const ACKS_FILE = fileURLToPath(new URL("../data/acks.jsonl", import.meta.url));

const log = (line: string) => process.stderr.write(`webhook-channel: ${line}\n`);

// Fail closed: без секрету сервер не стартує взагалі, а не «працює відкрито».
const secret = process.env.WEBHOOK_SECRET ?? "";
if (secret === "") {
  log("WEBHOOK_SECRET не задано - не стартую (запусти через node --env-file=.env)");
  process.exit(1);
}

const channel = createChannel({
  secret,
  log,
  onAck: (ack) => {
    fs.mkdirSync(path.dirname(ACKS_FILE), { recursive: true });
    fs.appendFileSync(ACKS_FILE, JSON.stringify(ack) + "\n");
    log(`ack: event_id=${ack.event_id} status=${ack.status}`);
  },
});

await channel.mcp.connect(new StdioServerTransport());

const httpServer = http.createServer((req, res) => {
  channel.handleHttp(req, res).catch((error: unknown) => {
    log(`handler error: ${error instanceof Error ? error.message : String(error)}`);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
    }
    res.end('{"error":"internal"}\n');
  });
});

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  // Друга сесія з тим самим каналом: порт уже зайнятий першою. MCP-частину
  // лишаємо живою, але вебхуки отримує тільки та сесія, що тримає порт.
  if (error.code === "EADDRINUSE") {
    log(`порт ${PORT} зайнятий - HTTP-вхід у цьому процесі вимкнено`);
    return;
  }
  throw error;
});

httpServer.listen(PORT, HOST, () => log(`POST http://${HOST}:${PORT}/webhook`));

// Коли Claude Code закриває stdio, звільняємо порт і виходимо.
process.stdin.on("close", () => {
  httpServer.close();
  process.exit(0);
});
