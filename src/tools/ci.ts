import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";

const dryRunSchema = z.boolean().default(true).describe("Dry run mode (default: true). Set to false only after user confirmation.");

function dryRunResponse(action: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[] } {
  const lines = Object.entries(details).filter(([, v]) => v !== undefined).map(([k, v]) => `  - **${k}:** ${v}`);
  return { content: [{ type: "text" as const, text: `[DRY RUN] ${action}\n\n${lines.join("\n")}\n\nThis is a preview. Ask the user to confirm in their language before re-calling with dry_run=false.` }] };
}

export function registerCITools(server: McpServer, client: GitLabClient): void {

  // --- Pipelines ---

  server.registerTool("list_pipelines", {
    description: "List recent pipelines for a project. Filter by branch (ref) or status (running, pending, success, failed, canceled).",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      ref: z.string().optional().describe("Branch name"),
      status: z.enum(["running", "pending", "success", "failed", "canceled", "skipped", "created", "manual"]).optional().describe("Pipeline status filter"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const pipelines = await client.listPipelines(args.project_id, { ref: args.ref, status: args.status });
      if (pipelines.length === 0) return { content: [{ type: "text" as const, text: "No pipelines found." }] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = pipelines.map((p: any) =>
        `**#${p.id}** — ${p.status} — ref: ${p.ref} — ${p.created_at}\n  ${p.web_url}`
      ).join("\n\n");
      return { content: [{ type: "text" as const, text: `${pipelines.length} pipeline(s):\n\n${text}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("get_pipeline", {
    description: "Get details of a specific pipeline (status, duration, jobs).",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      pipeline_id: z.number().describe("Pipeline ID"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = await client.getPipeline(args.project_id, args.pipeline_id) as any;
      const parts = [
        `# Pipeline #${p.id}`,
        `**Status:** ${p.status}`,
        `**Ref:** ${p.ref}`,
        `**Source:** ${p.source}`,
        p.duration ? `**Duration:** ${p.duration}s` : null,
        `**Created:** ${p.created_at}`,
        p.finished_at ? `**Finished:** ${p.finished_at}` : null,
        `**URL:** ${p.web_url}`,
      ];
      return { content: [{ type: "text" as const, text: parts.filter(Boolean).join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("get_job_log", {
    description: "Get the log output of a CI job (last 2000 chars).",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      job_id: z.number().describe("Job ID"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const log = await client.getJobLog(args.project_id, args.job_id);
      const trimmed = log.length > 2000 ? "...(truncated)\n" + log.slice(-2000) : log;
      return { content: [{ type: "text" as const, text: `Job ${args.job_id} log:\n\`\`\`\n${trimmed}\n\`\`\`` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("retry_pipeline", {
    description: "Retry a failed pipeline. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      pipeline_id: z.number().describe("Pipeline ID to retry"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) return dryRunResponse("Retry pipeline", { project_id: args.project_id, pipeline_id: args.pipeline_id });
      await client.retryPipeline(args.project_id, args.pipeline_id);
      return { content: [{ type: "text" as const, text: `Pipeline #${args.pipeline_id} retried.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("cancel_pipeline", {
    description: "Cancel a running pipeline. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      pipeline_id: z.number().describe("Pipeline ID to cancel"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) return dryRunResponse("Cancel pipeline", { project_id: args.project_id, pipeline_id: args.pipeline_id });
      await client.cancelPipeline(args.project_id, args.pipeline_id);
      return { content: [{ type: "text" as const, text: `Pipeline #${args.pipeline_id} canceled.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  // --- Branches ---

  server.registerTool("list_branches", {
    description: "List branches of a project. Filter by search term.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      search: z.string().optional().describe("Search by branch name"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const branches = await client.listBranches(args.project_id, { search: args.search });
      if (branches.length === 0) return { content: [{ type: "text" as const, text: "No branches found." }] };
      const text = branches.map(b => `**${b.name}**${b.default ? " (default)" : ""}`).join("\n");
      return { content: [{ type: "text" as const, text: `${branches.length} branch(es):\n\n${text}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("create_branch", {
    description: "Create a new branch from a ref. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      name: z.string().describe("New branch name"),
      ref: z.string().describe("Source ref (branch, tag, or commit SHA)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) return dryRunResponse("Create branch", { project_id: args.project_id, name: args.name, ref: args.ref });
      const branch = await client.createBranch(args.project_id, args.name, args.ref);
      return { content: [{ type: "text" as const, text: `Branch "${branch.name}" created from ${args.ref}.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  // --- Repository content ---

  server.registerTool("list_repository_tree", {
    description: "List files and directories in a project repository.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      path: z.string().optional().describe("Directory path (default: root)"),
      ref: z.string().optional().describe("Branch or tag (default: default branch)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const tree = await client.listRepositoryTree(args.project_id, { path: args.path, ref: args.ref });
      if (tree.length === 0) return { content: [{ type: "text" as const, text: "Empty directory." }] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = tree.map((e: any) => `${e.type === "tree" ? "📁" : "📄"} ${e.name}`).join("\n");
      return { content: [{ type: "text" as const, text: text }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("get_file", {
    description: "Get the content of a file from the repository.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      file_path: z.string().describe("File path in repository"),
      ref: z.string().optional().describe("Branch or tag (default: main)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const file = await client.getFile(args.project_id, args.file_path, args.ref);
      return { content: [{ type: "text" as const, text: `**${file.file_path}** (${file.size} bytes)\n\n\`\`\`\n${file.content}\n\`\`\`` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("list_commits", {
    description: "List recent commits for a project. Filter by branch or file path.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      ref: z.string().optional().describe("Branch or tag"),
      path: z.string().optional().describe("File path to filter commits"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const commits = await client.listCommits(args.project_id, { ref: args.ref, path: args.path });
      if (commits.length === 0) return { content: [{ type: "text" as const, text: "No commits found." }] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = commits.map((c: any) =>
        `**${c.short_id}** ${c.title}\n  ${c.author_name} — ${c.created_at}`
      ).join("\n\n");
      return { content: [{ type: "text" as const, text: `${commits.length} commit(s):\n\n${text}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });
}
