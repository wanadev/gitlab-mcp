import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabEpic, GitLabIssue } from "../types.js";

const groupIdSchema = z.string().describe("ID ou chemin du groupe GitLab");

function formatEpic(e: GitLabEpic): string {
  const labels = e.labels.length > 0 ? ` — Labels: ${e.labels.join(", ")}` : "";
  const due = e.due_date ? ` — Echeance: ${e.due_date}` : "";
  const start = e.start_date ? ` — Debut: ${e.start_date}` : "";
  return `**${e.title}** (#${e.iid}) — ${e.state}${labels}${start}${due}\n  ${e.web_url}`;
}

function formatEpics(epics: GitLabEpic[]): string {
  if (epics.length === 0) return "Aucun epic trouve.";
  return `${epics.length} epic(s) :\n\n${epics.map(formatEpic).join("\n\n")}`;
}

function formatEpicDetail(e: GitLabEpic): string {
  const parts = [
    `# ${e.title} (#${e.iid})`,
    `**Etat:** ${e.state}`,
    `**Auteur:** ${e.author.name} (@${e.author.username})`,
    e.labels.length > 0 ? `**Labels:** ${e.labels.join(", ")}` : null,
    e.start_date ? `**Debut:** ${e.start_date}` : null,
    e.due_date ? `**Echeance:** ${e.due_date}` : null,
    `**Cree le:** ${e.created_at}`,
    `**Mis a jour:** ${e.updated_at}`,
    e.closed_at ? `**Ferme le:** ${e.closed_at}` : null,
    `**Lien:** ${e.web_url}`,
    e.description ? `\n---\n${e.description}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

function formatIssueInEpic(i: GitLabIssue): string {
  const assignees =
    i.assignees.length > 0
      ? ` — Assignes: ${i.assignees.map((a) => `@${a.username}`).join(", ")}`
      : "";
  const labels = i.labels.length > 0 ? ` — Labels: ${i.labels.join(", ")}` : "";
  return `**${i.title}** (project:${i.project_id} #${i.iid}, id:${i.id}) — ${i.state}${assignees}${labels}\n  ${i.web_url}`;
}

export function registerEpicTools(server: McpServer, client: GitLabClient): void {
  server.registerTool("list_epics", {
    description:
      "Lister les epics d'un groupe GitLab. Filtrer par etat, recherche textuelle ou labels.",
    inputSchema: {
      group_id: groupIdSchema,
      state: z.enum(["opened", "closed", "all"]).optional().describe("Filtrer par etat (defaut: all)"),
      search: z.string().optional().describe("Recherche textuelle dans le titre/description"),
      labels: z.string().optional().describe("Filtrer par labels (separes par virgule)"),
      order_by: z.enum(["created_at", "updated_at", "title"]).optional().describe("Trier par champ"),
      sort: z.enum(["asc", "desc"]).optional().describe("Ordre de tri"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const epics = await client.listEpics(group_id, params);
      return { content: [{ type: "text" as const, text: formatEpics(epics) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("get_epic", {
    description: "Obtenir les details complets d'un epic par son numero (IID).",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID affiche dans GitLab)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const epic = await client.getEpic(args.group_id, args.epic_iid);
      return { content: [{ type: "text" as const, text: formatEpicDetail(epic) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("create_epic", {
    description: "Creer un nouvel epic dans un groupe GitLab.",
    inputSchema: {
      group_id: groupIdSchema,
      title: z.string().describe("Titre de l'epic"),
      description: z.string().optional().describe("Description de l'epic (Markdown)"),
      labels: z.string().optional().describe("Labels separes par virgule"),
      start_date: z.string().optional().describe("Date de debut (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Date d'echeance (YYYY-MM-DD)"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { group_id, ...data } = args;
      const epic = await client.createEpic(group_id, data);
      return {
        content: [{ type: "text" as const, text: `Epic cree avec succes !\n\n${formatEpicDetail(epic)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("update_epic", {
    description: "Mettre a jour un epic existant (titre, description, labels, dates).",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID)"),
      title: z.string().optional().describe("Nouveau titre"),
      description: z.string().optional().describe("Nouvelle description (Markdown)"),
      labels: z.string().optional().describe("Nouveaux labels (separes par virgule)"),
      start_date: z.string().optional().describe("Nouvelle date de debut (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Nouvelle date d'echeance (YYYY-MM-DD)"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { group_id, epic_iid, ...data } = args;
      const epic = await client.updateEpic(group_id, epic_iid, data);
      return {
        content: [{ type: "text" as const, text: `Epic mis a jour !\n\n${formatEpicDetail(epic)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("close_epic", {
    description: "Fermer un epic.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID) a fermer"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const epic = await client.closeEpic(args.group_id, args.epic_iid);
      return {
        content: [{ type: "text" as const, text: `Epic #${epic.iid} ferme.\n\n${formatEpicDetail(epic)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_epic_issues", {
    description:
      "Lister les issues rattachees a un epic. Affiche l'ID global et le IID projet de chaque issue.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const issues = await client.listEpicIssues(args.group_id, args.epic_iid);
      if (issues.length === 0) {
        return { content: [{ type: "text" as const, text: "Aucune issue rattachee a cet epic." }] };
      }
      const text = `${issues.length} issue(s) dans l'epic :\n\n${issues.map(formatIssueInEpic).join("\n\n")}`;
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("add_issue_to_epic", {
    description:
      "Rattacher une issue a un epic. ATTENTION : utiliser l'ID global de l'issue (pas le IID projet). L'ID global est affiche par list_epic_issues et list_issues.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID)"),
      issue_id: z.number().describe("ID global de l'issue (pas le IID projet)"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      await client.addIssueToEpic(args.group_id, args.epic_iid, args.issue_id);
      return {
        content: [{ type: "text" as const, text: `Issue ${args.issue_id} rattachee a l'epic #${args.epic_iid}.` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });
}
