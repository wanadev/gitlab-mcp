#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf8")) as { name: string; version: string };
import { GitLabClient } from "./client.js";
import { registerEpicTools } from "./tools/epics.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerMilestoneTools } from "./tools/milestones.js";
import { registerMergeRequestTools } from "./tools/merge_requests.js";
import { registerUtilTools } from "./tools/utils.js";

const SETUP_MESSAGE = `GITLAB_TOKEN is not set. The GitLab MCP server needs a Personal Access Token to connect.

Setup steps:
1. Go to GitLab > Settings > Access Tokens
2. Create a token with the "api" scope
3. Set it as an environment variable:
   - Linux/macOS: export GITLAB_TOKEN=glpat-xxxx (add to ~/.bashrc or ~/.zshrc)
   - Windows: set GITLAB_TOKEN=glpat-xxxx (or use System Environment Variables)
4. Restart Claude Code or Claude Desktop

Tell the user these steps in their language. Be friendly and concise.`;

async function main(): Promise<void> {
  const token = process.env["GITLAB_TOKEN"] ?? "";
  const baseUrl = process.env["GITLAB_BASE_URL"] ?? "https://gitlab.com";
  const readOnly = process.env["GITLAB_READ_ONLY"] === "true";

  const server = new McpServer({
    name: pkg.name,
    version: pkg.version,
  });

  if (!token) {
    // No token: register a single setup tool that guides the user
    console.error("@wanadev/mcp-gitlab: GITLAB_TOKEN not set — starting in setup mode");

    server.registerTool("gitlab_setup", {
      description: "GitLab MCP is not configured yet. Call this tool to show the user how to set up their GitLab token.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    }, async () => {
      return { content: [{ type: "text" as const, text: SETUP_MESSAGE }] };
    });
  } else {
    // Validate base URL
    try {
      new URL(baseUrl);
    } catch {
      console.error(`@wanadev/mcp-gitlab: invalid GITLAB_BASE_URL "${baseUrl}"`);
      server.registerTool("gitlab_setup", {
        description: "GitLab MCP has an invalid GITLAB_BASE_URL. Call this tool to help the user fix it.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      }, async () => {
        return { content: [{ type: "text" as const, text: `GITLAB_BASE_URL is invalid: "${baseUrl}". It must be a valid URL (e.g. https://gitlab.com or https://gitlab.mycompany.com). Tell the user to fix it in their language and restart.` }] };
      });

      const transport = new StdioServerTransport();
      await server.connect(transport);
      return;
    }

    // Token + URL present: validate connection then register tools
    const client = new GitLabClient({ baseUrl, token, readOnly });

    // Test the connection at startup and detect access level
    try {
      const user = await client.getCurrentUser();
      const mode = readOnly ? "read-only (forced by GITLAB_READ_ONLY=true)" : "read-write";
      console.error(`@wanadev/mcp-gitlab: connected as @${user.username} on ${baseUrl} [${mode}]`);
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("401")) {
        console.error("@wanadev/mcp-gitlab: GITLAB_TOKEN is invalid or expired. Tools will register but all calls will fail.");
      } else if (msg.includes("403")) {
        console.error("@wanadev/mcp-gitlab: GITLAB_TOKEN has insufficient permissions. Make sure it has the 'api' scope.");
      } else {
        console.error(`@wanadev/mcp-gitlab: connection check failed — ${msg}`);
        console.error("Tools will still register but API calls may fail. Check your GITLAB_TOKEN and GITLAB_BASE_URL.");
      }
    }

    registerEpicTools(server, client);
    registerIssueTools(server, client);
    registerMilestoneTools(server, client);
    registerMergeRequestTools(server, client);
    registerUtilTools(server, client);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`@wanadev/mcp-gitlab v${pkg.version} started (stdio)`);
  if (!token) {
    console.error("Setup mode — run gitlab_setup for configuration help");
  } else if (readOnly) {
    console.error("Read-only mode active (GITLAB_READ_ONLY=true)");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
