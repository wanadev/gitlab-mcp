import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabMergeRequest } from "../types.js";

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
}
