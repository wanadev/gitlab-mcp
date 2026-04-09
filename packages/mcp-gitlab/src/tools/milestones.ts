import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabMilestone } from "../types.js";

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
      "Lister les milestones du groupe GitLab. Filtrer par etat ou recherche textuelle.",
    inputSchema: {
      state: z.enum(["active", "closed"]).optional().describe("Filtrer par etat"),
      search: z.string().optional().describe("Recherche textuelle dans le titre"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const milestones = await client.listGroupMilestones(args);
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
      milestone_id: z.number().describe("ID du milestone"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const milestone = await client.getMilestone(args.milestone_id);
      return { content: [{ type: "text" as const, text: formatMilestoneDetail(milestone) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("create_milestone", {
    description: "Creer un nouveau milestone dans le groupe GitLab.",
    inputSchema: {
      title: z.string().describe("Titre du milestone"),
      description: z.string().optional().describe("Description du milestone"),
      start_date: z.string().optional().describe("Date de debut (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Date d'echeance (YYYY-MM-DD)"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const milestone = await client.createMilestone(args);
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
