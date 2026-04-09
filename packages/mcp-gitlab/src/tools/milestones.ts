import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabMilestone } from "../types.js";

const groupIdSchema = z.string().describe("ID ou chemin URL du groupe GitLab (ex: '42' ou 'wanadev/kp1'). Si vous n'avez que le nom, appelez d'abord list_groups pour trouver le chemin exact.");
const dryRunSchema = z.boolean().default(true).describe("Mode simulation (defaut: true). A true, retourne un resume de l'action sans l'executer. Passer a false uniquement apres confirmation de l'utilisateur.");

function dryRunResponse(action: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[] } {
  const lines = Object.entries(details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  - **${k}:** ${v}`);
  const text = `**[DRY RUN] ${action}**\n\n${lines.join("\n")}\n\n> Appelez a nouveau avec \`dry_run: false\` pour executer cette action.`;
  return { content: [{ type: "text" as const, text }] };
}

function formatMilestone(m: GitLabMilestone): string {
  const due = m.due_date ? ` — Echeance: ${m.due_date}` : "";
  const start = m.start_date ? ` — Debut: ${m.start_date}` : "";
  const expired = m.expired ? " [EXPIRE]" : "";
  return `**${m.title}** (id:${m.id}) — ${m.state}${start}${due}${expired}\n  ${m.web_url}`;
}

function formatMilestones(milestones: GitLabMilestone[]): string {
  if (milestones.length === 0) return "Aucun milestone trouve.";
  return `${milestones.length} milestone(s) :\n\n${milestones.map(formatMilestone).join("\n\n")}`;
}

function formatMilestoneDetail(m: GitLabMilestone): string {
  const parts = [
    `# ${m.title} (id:${m.id})`,
    `**Etat:** ${m.state}`,
    m.start_date ? `**Debut:** ${m.start_date}` : null,
    m.due_date ? `**Echeance:** ${m.due_date}` : null,
    m.expired ? `**Expire:** oui` : null,
    `**Cree le:** ${m.created_at}`,
    `**Mis a jour:** ${m.updated_at}`,
    `**Lien:** ${m.web_url}`,
    m.description ? `\n---\n${m.description}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

export function registerMilestoneTools(server: McpServer, client: GitLabClient): void {
  server.registerTool("list_milestones", {
    description:
      "Lister les milestones d'un groupe GitLab. Filtrer par etat ou recherche textuelle.",
    inputSchema: {
      group_id: groupIdSchema,
      state: z.enum(["active", "closed"]).optional().describe("Filtrer par etat"),
      search: z.string().optional().describe("Recherche textuelle dans le titre"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const milestones = await client.listGroupMilestones(group_id, params);
      return { content: [{ type: "text" as const, text: formatMilestones(milestones) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("get_milestone", {
    description: "Obtenir les details d'un milestone par son ID.",
    inputSchema: {
      group_id: groupIdSchema,
      milestone_id: z.number().describe("ID du milestone"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const milestone = await client.getMilestone(args.group_id, args.milestone_id);
      return { content: [{ type: "text" as const, text: formatMilestoneDetail(milestone) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("create_milestone", {
    description: "Creer un nouveau milestone. Par defaut dry_run=true : retourne un apercu sans creer. Passer dry_run=false apres confirmation.",
    inputSchema: {
      group_id: groupIdSchema,
      title: z.string().describe("Titre du milestone"),
      description: z.string().optional().describe("Description du milestone"),
      start_date: z.string().optional().describe("Date de debut (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Date d'echeance (YYYY-MM-DD)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { group_id, dry_run, ...data } = args;
      if (dry_run) {
        return dryRunResponse("Creer un milestone", { groupe: group_id, ...data });
      }
      const milestone = await client.createMilestone(group_id, data);
      return {
        content: [{ type: "text" as const, text: `Milestone cree avec succes !\n\n${formatMilestoneDetail(milestone)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });
}
