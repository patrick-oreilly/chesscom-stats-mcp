// Drives the built server over stdio with the official MCP client, the same way Claude Desktop would.
// Usage: node scripts/demo.mjs <tool> [json-args]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [tool = "list", rawArgs = "{}"] = process.argv.slice(2);
const transport = new StdioClientTransport({
  command: "node",
  args: [new URL("../dist/index.js", import.meta.url).pathname],
  env: { ...process.env, CHESSCOM_USERNAME: process.env.CHESSCOM_USERNAME ?? "patrickoreilly2" },
});
const client = new Client({ name: "demo", version: "0.0.0" });
await client.connect(transport);
if (tool === "list") {
  const { tools } = await client.listTools();
  for (const t of tools) console.log(`${t.name.padEnd(14)} ${t.description.split(". ")[0]}`);
} else {
  const res = await client.callTool({ name: tool, arguments: JSON.parse(rawArgs) });
  console.log(res.content[0].text);
}
await client.close();
