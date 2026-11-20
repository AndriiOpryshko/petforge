// Смок без Claude Code: підключається до каналу по stdio так само, як сесія,
// і друкує кожну нотифікацію каналу. Запуск: make smoke-listen (в іншому терміналі curl).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const seconds = Number(process.argv[2] ?? 30);

const transport = new StdioClientTransport({
  command: "node",
  args: ["--env-file=.env", "dist/server.js"],
  cwd: root,
  stderr: "inherit",
});
const client = new Client({ name: "fake-session", version: "0.0.0" });
client.fallbackNotificationHandler = async (notification) => {
  console.log("NOTIFICATION " + JSON.stringify(notification));
};
await client.connect(transport);
console.log("capabilities " + JSON.stringify(client.getServerCapabilities()));
await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
await client.close();
