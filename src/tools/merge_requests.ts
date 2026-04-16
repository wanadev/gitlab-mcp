import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabMergeRequest, GitLabNote } from "../types.js";

const dryRunSchema = z.boolean().default(true).describe("Dry run mode (default: true). When true, returns a preview of the action without executing it. Set to false only after user confirmation.");

function dryRunResponse(action: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[] } {
  const lines = Object.entries(details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  - **${k}:** ${Array.isArray(v) ? v.join(", ") : v}`);
  const text = `[DRY RUN] ${action}\n\n${lines.join("\n")}\n\nThis is a preview. Ask the user to confirm in their language before re-calling with dry_run=false.`;
  return { content: [{ type: "text" as const, text }] };
}

const groupIdSchema = z.string().describe("ID ou chemin URL du groupe GitLab (ex: '42' ou 'wanadev/kp1'). Si vous n'avez que le nom, appelez d'abord list_groups pour trouver le chemin exact.");

function formatMR(mr: GitLabMergeRequest): string {
  const draft = mr.draft ? " [DRAFT]" : "";
  const conflicts = mr.has_conflicts ? " [CONFLITS]" : "";
  const assignees = mr.assignees.length > 0
    ? ` — Assignes: ${mr.assignees.map((a) => `@${a.username}`).join(", ")}`
    : "";
  const reviewers = mr.reviewers.length > 0
    ? ` — Reviewers: ${mr.reviewers.map((r) => `@${r.username}`).join(", ")}`
    : "";
  const labels = mr.labels.length > 0 ? ` — Labels: ${mr.labels.join(", ")}` : "";
  return `**${mr.title}** (project:${mr.project_id} !${mr.iid}) — ${mr.state}${draft}${conflicts}${assignees}${reviewers}${labels}\n  ${mr.source_branch} → ${mr.target_branch}\n  ${mr.web_url}`;
}

function formatMRs(mrs: GitLabMergeRequest[]): string {
  if (mrs.length === 0) return "Aucune merge request trouvee.";
  return `${mrs.length} merge request(s) :\n\n${mrs.map(formatMR).join("\n\n")}`;
}

function formatMRDetail(mr: GitLabMergeRequest): string {
  const parts = [
    `# ${mr.title} (project:${mr.project_id} !${mr.iid})`,
    `**Etat:** ${mr.state}${mr.draft ? " (draft)" : ""}`,
    `**Auteur:** ${mr.author.name} (@${mr.author.username})`,
    mr.assignees.length > 0
      ? `**Assignes:** ${mr.assignees.map((a) => `${a.name} (@${a.username})`).join(", ")}`
      : null,
    mr.reviewers.length > 0
      ? `**Reviewers:** ${mr.reviewers.map((r) => `${r.name} (@${r.username})`).join(", ")}`
      : null,
    `**Branches:** ${mr.source_branch} → ${mr.target_branch}`,
    `**Merge status:** ${mr.merge_status}${mr.has_conflicts ? " (CONFLITS)" : ""}`,
    mr.labels.length > 0 ? `**Labels:** ${mr.labels.join(", ")}` : null,
    mr.milestone ? `**Milestone:** ${mr.milestone.title}` : null,
    `**Cree le:** ${mr.created_at}`,
    `**Mis a jour:** ${mr.updated_at}`,
    mr.merged_at ? `**Merge le:** ${mr.merged_at}` : null,
    mr.closed_at ? `**Ferme le:** ${mr.closed_at}` : null,
    `**Lien:** ${mr.web_url}`,
    mr.description ? `\n---\n${mr.description}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

export function registerMergeRequestTools(server: McpServer, client: GitLabClient): void {
  server.registerTool("list_merge_requests", {
    description:
      "Lister les merge requests d'un groupe GitLab. Filtrer par etat, auteur, reviewer, labels ou milestone.",
    inputSchema: {
      group_id: groupIdSchema,
      state: z.enum(["opened", "closed", "merged", "all"]).optional().describe("Filtrer par etat (defaut: all)"),
      search: z.string().optional().describe("Recherche textuelle dans le titre"),
      labels: z.string().optional().describe("Labels (separes par virgule)"),
      milestone: z.string().optional().describe("Nom du milestone"),
      author_username: z.string().optional().describe("Nom d'utilisateur de l'auteur"),
      reviewer_username: z.string().optional().describe("Nom d'utilisateur du reviewer"),
      order_by: z.enum(["created_at", "updated_at"]).optional().describe("Trier par champ"),
      sort: z.enum(["asc", "desc"]).optional().describe("Ordre de tri"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const mrs = await client.listGroupMergeRequests(group_id, params);
      return { content: [{ type: "text" as const, text: formatMRs(mrs) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("get_merge_request", {
    description: "Obtenir les details d'une merge request par son projet et son numero (IID).",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      mr_iid: z.number().describe("Numero de la merge request (IID)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const mr = await client.getMergeRequest(args.project_id, args.mr_iid);
      return { content: [{ type: "text" as const, text: formatMRDetail(mr) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("create_merge_request", {
    description: "Create a new merge request. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      source_branch: z.string().describe("Source branch name"),
      target_branch: z.string().describe("Target branch name"),
      title: z.string().describe("MR title"),
      description: z.string().optional().describe("MR description (Markdown)"),
      labels: z.string().optional().describe("Labels (comma-separated)"),
      assignee_ids: z.array(z.number()).optional().describe("Assignee user IDs"),
      reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
      milestone_id: z.number().optional().describe("Milestone ID"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { project_id, dry_run, ...data } = args;
      if (dry_run) return dryRunResponse("Create merge request", { project_id, ...data });
      const mr = await client.createMergeRequest(project_id, data);
      return { content: [{ type: "text" as const, text: `MR created!\n\n${formatMRDetail(mr)}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("update_merge_request", {
    description: "Update a merge request (title, description, labels, assignees, reviewers). dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      mr_iid: z.number().describe("MR IID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description (Markdown)"),
      add_labels: z.string().optional().describe("Labels to add (comma-separated)"),
      remove_labels: z.string().optional().describe("Labels to remove (comma-separated)"),
      assignee_ids: z.array(z.number()).optional().describe("Assignee user IDs"),
      reviewer_ids: z.array(z.number()).optional().describe("Reviewer user IDs"),
      milestone_id: z.number().optional().describe("Milestone ID"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { project_id, mr_iid, dry_run, ...data } = args;
      if (dry_run) return dryRunResponse("Update merge request", { project_id, mr_iid, ...data });
      const mr = await client.updateMergeRequest(project_id, mr_iid, data);
      return { content: [{ type: "text" as const, text: `MR updated!\n\n${formatMRDetail(mr)}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("merge_merge_request", {
    description: "Merge a merge request. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      mr_iid: z.number().describe("MR IID to merge"),
      merge_commit_message: z.string().optional().describe("Custom merge commit message"),
      squash: z.boolean().optional().describe("Squash commits into one"),
      should_remove_source_branch: z.boolean().optional().describe("Delete source branch after merge"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) return dryRunResponse("Merge MR", { project_id: args.project_id, mr_iid: args.mr_iid, squash: args.squash, remove_branch: args.should_remove_source_branch });
      const mr = await client.mergeMergeRequest(args.project_id, args.mr_iid, {
        merge_commit_message: args.merge_commit_message,
        squash: args.squash,
        should_remove_source_branch: args.should_remove_source_branch,
      });
      return { content: [{ type: "text" as const, text: `MR !${mr.iid} merged.\n\n${formatMRDetail(mr)}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("approve_merge_request", {
    description: "Approve a merge request. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      mr_iid: z.number().describe("MR IID to approve"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) return dryRunResponse("Approve MR", { project_id: args.project_id, mr_iid: args.mr_iid });
      await client.approveMergeRequest(args.project_id, args.mr_iid);
      return { content: [{ type: "text" as const, text: `MR !${args.mr_iid} approved.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("list_mr_notes", {
    description: "List comments on a merge request.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      mr_iid: z.number().describe("MR IID"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const notes = await client.listMRNotes(args.project_id, args.mr_iid);
      const userNotes = notes.filter((n: GitLabNote) => !n.system);
      if (userNotes.length === 0) return { content: [{ type: "text" as const, text: "No comments on this MR." }] };
      const text = userNotes.map((n: GitLabNote) =>
        `**${n.author.name}** (@${n.author.username}) — ${n.created_at}\n${n.body}`
      ).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text: `${userNotes.length} comment(s):\n\n${text}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("add_mr_note", {
    description: "Add a comment to a merge request. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      mr_iid: z.number().describe("MR IID"),
      body: z.string().describe("Comment body (Markdown)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) return dryRunResponse("Comment on MR", { project_id: args.project_id, mr_iid: args.mr_iid, body: args.body });
      const note = await client.addMRNote(args.project_id, args.mr_iid, args.body);
      return { content: [{ type: "text" as const, text: `Comment added on MR !${args.mr_iid} by @${note.author.username}.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("get_mr_diff", {
    description: "Get the file changes (diff summary) of a merge request.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      mr_iid: z.number().describe("MR IID"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const changes = await client.getMRDiff(args.project_id, args.mr_iid);
      if (changes.length === 0) return { content: [{ type: "text" as const, text: "No file changes in this MR." }] };
      const text = changes.map(c => {
        const path = c.old_path === c.new_path ? c.new_path : `${c.old_path} → ${c.new_path}`;
        return `**${path}** (+${c.additions} -${c.deletions})`;
      }).join("\n");
      const total = changes.reduce((acc, c) => ({ add: acc.add + c.additions, del: acc.del + c.deletions }), { add: 0, del: 0 });
      return { content: [{ type: "text" as const, text: `${changes.length} file(s) changed (+${total.add} -${total.del}):\n\n${text}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });
}
