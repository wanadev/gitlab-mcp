import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabIssue } from "../types.js";

function formatIssue(i: GitLabIssue): string {
  const assignees =
    i.assignees.length > 0
      ? ` — Assignes: ${i.assignees.map((a) => `@${a.username}`).join(", ")}`
      : "";
  const labels = i.labels.length > 0 ? ` — Labels: ${i.labels.join(", ")}` : "";
  const milestone = i.milestone ? ` — Milestone: ${i.milestone.title}` : "";
  const due = i.due_date ? ` — Echeance: ${i.due_date}` : "";
  const epic = i.epic_iid ? ` — Epic #${i.epic_iid}` : "";
  return `**${i.title}** (project:${i.project_id} #${i.iid}, id:${i.id}) — ${i.state}${assignees}${labels}${milestone}${due}${epic}\n  ${i.web_url}`;
}

function formatIssues(issues: GitLabIssue[]): string {
  if (issues.length === 0) return "Aucune issue trouvee.";
  return `${issues.length} issue(s) :\n\n${issues.map(formatIssue).join("\n\n")}`;
}

function formatIssueDetail(i: GitLabIssue): string {
  const parts = [
    `# ${i.title} (project:${i.project_id} #${i.iid})`,
    `**ID global:** ${i.id}`,
    `**Etat:** ${i.state}`,
    `**Auteur:** ${i.author.name} (@${i.author.username})`,
    i.assignees.length > 0
      ? `**Assignes:** ${i.assignees.map((a) => `${a.name} (@${a.username})`).join(", ")}`
      : null,
    i.labels.length > 0 ? `**Labels:** ${i.labels.join(", ")}` : null,
    i.milestone ? `**Milestone:** ${i.milestone.title}` : null,
    i.epic_iid ? `**Epic:** #${i.epic_iid}` : null,
    i.weight != null ? `**Poids:** ${i.weight}` : null,
    i.due_date ? `**Echeance:** ${i.due_date}` : null,
    `**Cree le:** ${i.created_at}`,
    `**Mis a jour:** ${i.updated_at}`,
    i.closed_at ? `**Ferme le:** ${i.closed_at}` : null,
    `**Lien:** ${i.web_url}`,
    i.description ? `\n---\n${i.description}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

export function registerIssueTools(server: McpServer, client: GitLabClient): void {
  server.registerTool("list_issues", {
    description:
      "Lister les issues d'un groupe GitLab. Filtrer par etat, recherche, labels, milestone ou assignee.",
    inputSchema: {
      group_id: z.string().describe("ID ou chemin du groupe GitLab"),
      state: z.enum(["opened", "closed", "all"]).optional().describe("Filtrer par etat"),
      search: z.string().optional().describe("Recherche textuelle"),
      labels: z.string().optional().describe("Labels (separes par virgule)"),
      milestone: z.string().optional().describe("Nom du milestone"),
      assignee_username: z.string().optional().describe("Nom d'utilisateur de l'assignee"),
      order_by: z.enum(["created_at", "updated_at", "priority", "due_date", "label_priority", "weight"]).optional().describe("Trier par champ"),
      sort: z.enum(["asc", "desc"]).optional().describe("Ordre de tri"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const issues = await client.listGroupIssues(group_id, params);
      return { content: [{ type: "text" as const, text: formatIssues(issues) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("get_issue", {
    description:
      "Obtenir les details d'une issue par son projet et son numero (IID).",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      issue_iid: z.number().describe("Numero de l'issue dans le projet (IID)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const issue = await client.getIssue(args.project_id, args.issue_iid);
      return { content: [{ type: "text" as const, text: formatIssueDetail(issue) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("create_issue", {
    description: "Creer une nouvelle issue dans un projet du groupe.",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      title: z.string().describe("Titre de l'issue"),
      description: z.string().optional().describe("Description (Markdown)"),
      labels: z.string().optional().describe("Labels (separes par virgule)"),
      milestone_id: z.number().optional().describe("ID du milestone"),
      assignee_ids: z.array(z.number()).optional().describe("IDs des assignees"),
      due_date: z.string().optional().describe("Date d'echeance (YYYY-MM-DD)"),
      weight: z.number().optional().describe("Poids de l'issue"),
      epic_id: z.number().optional().describe("ID global de l'epic a rattacher"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { project_id, ...data } = args;
      const issue = await client.createIssue(project_id, data);
      return {
        content: [{ type: "text" as const, text: `Issue creee avec succes !\n\n${formatIssueDetail(issue)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("update_issue", {
    description:
      "Mettre a jour une issue existante (titre, description, labels, milestone, assignees, etc.).",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      issue_iid: z.number().describe("Numero de l'issue (IID)"),
      title: z.string().optional().describe("Nouveau titre"),
      description: z.string().optional().describe("Nouvelle description (Markdown)"),
      labels: z.string().optional().describe("Nouveaux labels (separes par virgule)"),
      milestone_id: z.number().optional().describe("ID du milestone"),
      assignee_ids: z.array(z.number()).optional().describe("IDs des assignees"),
      due_date: z.string().optional().describe("Nouvelle date d'echeance (YYYY-MM-DD)"),
      weight: z.number().optional().describe("Nouveau poids"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { project_id, issue_iid, ...data } = args;
      const issue = await client.updateIssue(project_id, issue_iid, data);
      return {
        content: [{ type: "text" as const, text: `Issue mise a jour !\n\n${formatIssueDetail(issue)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("close_issue", {
    description: "Fermer une issue.",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      issue_iid: z.number().describe("Numero de l'issue (IID) a fermer"),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const issue = await client.closeIssue(args.project_id, args.issue_iid);
      return {
        content: [{ type: "text" as const, text: `Issue #${issue.iid} fermee.\n\n${formatIssueDetail(issue)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });
}
