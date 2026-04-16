import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabIssue, GitLabNote } from "../types.js";

const dryRunSchema = z.boolean().default(true).describe("Dry run mode (default: true). When true, returns a preview of the action without executing it. Set to false only after user confirmation.");

function dryRunResponse(action: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[] } {
  const lines = Object.entries(details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  - **${k}:** ${Array.isArray(v) ? v.join(", ") : v}`);
  const text = `[DRY RUN] ${action}\n\n${lines.join("\n")}\n\nThis is a preview. Ask the user to confirm in their language before re-calling with dry_run=false.`;
  return { content: [{ type: "text" as const, text }] };
}

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
    i.time_stats?.human_time_estimate ? `**Temps estime:** ${i.time_stats.human_time_estimate}` : null,
    i.time_stats?.human_total_time_spent ? `**Temps passe:** ${i.time_stats.human_total_time_spent}` : null,
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
      group_id: z.string().describe("ID ou chemin URL du groupe GitLab (ex: '42' ou 'wanadev/kp1'). Si vous n'avez que le nom, appelez d'abord list_groups pour trouver le chemin exact."),
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
    description: "Creer une nouvelle issue dans un projet. Par defaut dry_run=true : retourne un apercu sans creer. Passer dry_run=false apres confirmation.",
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
      iteration_id: z.number().optional().describe("ID de l'iteration (sprint) a associer"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { project_id, dry_run, ...data } = args;
      if (dry_run) {
        return dryRunResponse("Creer une issue", { project_id, ...data });
      }
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
      "Mettre a jour une issue existante. Par defaut dry_run=true : retourne un apercu sans modifier. Passer dry_run=false apres confirmation.",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      issue_iid: z.number().describe("Numero de l'issue (IID)"),
      title: z.string().optional().describe("Nouveau titre"),
      description: z.string().optional().describe("Nouvelle description (Markdown)"),
      add_labels: z.string().optional().describe("Labels to add (comma-separated). Does NOT remove existing labels."),
      remove_labels: z.string().optional().describe("Labels to remove (comma-separated)."),
      milestone_id: z.number().optional().describe("ID du milestone"),
      assignee_ids: z.array(z.number()).optional().describe("IDs des assignees"),
      due_date: z.string().optional().describe("Nouvelle date d'echeance (YYYY-MM-DD)"),
      weight: z.number().optional().describe("Nouveau poids"),
      iteration_id: z.number().optional().describe("ID de l'iteration (sprint) a associer"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { project_id, issue_iid, dry_run, ...data } = args;
      if (dry_run) {
        return dryRunResponse("Modifier l'issue", { project_id, issue_iid, ...data });
      }
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
    description: "Fermer une issue. Par defaut dry_run=true : retourne un apercu sans fermer. Passer dry_run=false apres confirmation.",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      issue_iid: z.number().describe("Numero de l'issue (IID) a fermer"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Fermer l'issue", { project_id: args.project_id, issue_iid: args.issue_iid });
      }
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

  server.registerTool("reopen_issue", {
    description: "Reopen a closed issue. dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      issue_iid: z.number().describe("Issue IID to reopen"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Reopen issue", { project_id: args.project_id, issue_iid: args.issue_iid });
      }
      const issue = await client.reopenIssue(args.project_id, args.issue_iid);
      return { content: [{ type: "text" as const, text: `Issue #${issue.iid} reopened.\n\n${formatIssueDetail(issue)}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("list_project_issues", {
    description: "List issues for a specific project (not group). Filter by state, labels, milestone, assignee.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      state: z.enum(["opened", "closed", "all"]).optional().describe("Filter by state"),
      search: z.string().optional().describe("Search text"),
      labels: z.string().optional().describe("Labels (comma-separated)"),
      milestone: z.string().optional().describe("Milestone name"),
      assignee_username: z.string().optional().describe("Assignee username"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { project_id, ...params } = args;
      const issues = await client.listProjectIssues(project_id, params);
      return { content: [{ type: "text" as const, text: formatIssues(issues) }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("list_issue_notes", {
    description: "Lister les commentaires d'une issue.",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      issue_iid: z.number().describe("Numero de l'issue (IID)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const notes = await client.listIssueNotes(args.project_id, args.issue_iid);
      const userNotes = notes.filter((n: GitLabNote) => !n.system);
      if (userNotes.length === 0) {
        return { content: [{ type: "text" as const, text: "Aucun commentaire sur cette issue." }] };
      }
      const text = userNotes.map((n: GitLabNote) =>
        `**${n.author.name}** (@${n.author.username}) — ${n.created_at}\n${n.body}`
      ).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text: `${userNotes.length} commentaire(s) :\n\n${text}` }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("add_issue_note", {
    description: "Ajouter un commentaire sur une issue. Par defaut dry_run=true.",
    inputSchema: {
      project_id: z.number().describe("ID du projet"),
      issue_iid: z.number().describe("Numero de l'issue (IID)"),
      body: z.string().describe("Contenu du commentaire (Markdown)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Commenter l'issue", { project_id: args.project_id, issue_iid: args.issue_iid, body: args.body });
      }
      const note = await client.addIssueNote(args.project_id, args.issue_iid, args.body);
      return {
        content: [{ type: "text" as const, text: `Commentaire ajoute sur l'issue #${args.issue_iid} par @${note.author.username}.` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });
}
