#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitLabClient } from "./client.js";
import { registerEpicTools } from "./tools/epics.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerMilestoneTools } from "./tools/milestones.js";
import { registerMergeRequestTools } from "./tools/merge_requests.js";
import { registerUtilTools } from "./tools/utils.js";

function getEnvOrExit(name: string, description: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Erreur: la variable d'environnement ${name} est requise.\n` +
        `${description}\n` +
        `Exemple: ${name}=xxx npx @wanadev/mcp-gitlab`,
    );
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const token = getEnvOrExit(
    "GITLAB_TOKEN",
    "Token d'acces personnel GitLab (PAT) avec les scopes api ou read_api.",
  );

  const baseUrl = process.env["GITLAB_BASE_URL"] ?? "https://gitlab.com";
  const readOnly = process.env["GITLAB_READ_ONLY"] === "true";

  const client = new GitLabClient({ baseUrl, token, readOnly });

  const server = new McpServer({
    name: "@wanadev/mcp-gitlab",
    version: "1.0.0",
  });

  registerEpicTools(server, client);
  registerIssueTools(server, client);
  registerMilestoneTools(server, client);
  registerMergeRequestTools(server, client);
  registerUtilTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("@wanadev/mcp-gitlab demarre (stdio)");
  if (readOnly) {
    console.error("Mode lecture seule actif (GITLAB_READ_ONLY=true)");
  }
}

main().catch((error) => {
  console.error("Erreur fatale:", error);
  process.exit(1);
});
