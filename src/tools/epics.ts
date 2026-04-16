import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabEpic, GitLabIssue, GitLabNote } from "../types.js";

const groupIdSchema = z.string().describe("ID ou chemin URL du groupe GitLab (ex: '42' ou 'wanadev/kp1'). Si vous n'avez que le nom, appelez d'abord list_groups pour trouver le chemin exact.");
const dryRunSchema = z.boolean().default(true).describe("Dry run mode (default: true). When true, returns a preview of the action without executing it. Set to false only after user confirmation.");

function dryRunResponse(action: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[] } {
  const lines = Object.entries(details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  - **${k}:** ${v}`);
  const text = `[DRY RUN] ${action}\n\n${lines.join("\n")}\n\nThis is a preview. Ask the user to confirm in their language before re-calling with dry_run=false.`;
  return { content: [{ type: "text" as const, text }] };
}

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
    description: "Creer un nouvel epic dans un groupe GitLab. Par defaut dry_run=true : retourne un apercu sans creer. Passer dry_run=false apres confirmation.",
    inputSchema: {
      group_id: groupIdSchema,
      title: z.string().describe("Titre de l'epic"),
      description: z.string().optional().describe("Description de l'epic (Markdown)"),
      labels: z.string().optional().describe("Labels separes par virgule"),
      start_date: z.string().optional().describe("Date de debut (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Date d'echeance (YYYY-MM-DD)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { group_id, dry_run, ...data } = args;
      if (dry_run) {
        return dryRunResponse("Creer un epic", { groupe: group_id, ...data });
      }
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
    description: "Mettre a jour un epic existant. Par defaut dry_run=true : retourne un apercu sans modifier. Passer dry_run=false apres confirmation.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID)"),
      title: z.string().optional().describe("Nouveau titre"),
      description: z.string().optional().describe("Nouvelle description (Markdown)"),
      add_labels: z.string().optional().describe("Labels to add (comma-separated). Does NOT remove existing labels."),
      remove_labels: z.string().optional().describe("Labels to remove (comma-separated)."),
      start_date: z.string().optional().describe("Nouvelle date de debut (YYYY-MM-DD)"),
      due_date: z.string().optional().describe("Nouvelle date d'echeance (YYYY-MM-DD)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      const { group_id, epic_iid, dry_run, ...data } = args;
      if (dry_run) {
        return dryRunResponse("Modifier l'epic", { groupe: group_id, epic_iid, ...data });
      }
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
    description: "Fermer un epic. Par defaut dry_run=true : retourne un apercu sans fermer. Passer dry_run=false apres confirmation.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID) a fermer"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Fermer l'epic", { groupe: args.group_id, epic_iid: args.epic_iid });
      }
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

  server.registerTool("reopen_epic", {
    description: "Reopen a closed epic. dry_run=true by default.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Epic IID to reopen"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Reopen epic", { group: args.group_id, epic_iid: args.epic_iid });
      }
      const epic = await client.reopenEpic(args.group_id, args.epic_iid);
      return { content: [{ type: "text" as const, text: `Epic #${epic.iid} reopened.\n\n${formatEpicDetail(epic)}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
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
      "Link an issue to an epic. dry_run=true by default. Requires project_id and issue_iid (not the global issue ID).",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Epic IID"),
      project_id: z.number().describe("Project ID where the issue lives"),
      issue_iid: z.number().describe("Issue IID within the project"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Link issue to epic", {
          group: args.group_id,
          epic_iid: args.epic_iid,
          project_id: args.project_id,
          issue_iid: args.issue_iid,
        });
      }
      await client.addIssueToEpic(args.group_id, args.epic_iid, args.project_id, args.issue_iid);
      return {
        content: [{ type: "text" as const, text: `Issue #${args.issue_iid} linked to epic #${args.epic_iid}.` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_epic_notes", {
    description: "Lister les commentaires d'un epic.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const notes = await client.listEpicNotes(args.group_id, args.epic_iid);
      const userNotes = notes.filter((n: GitLabNote) => !n.system);
      if (userNotes.length === 0) {
        return { content: [{ type: "text" as const, text: "Aucun commentaire sur cet epic." }] };
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

  server.registerTool("add_epic_note", {
    description: "Ajouter un commentaire sur un epic. Par defaut dry_run=true.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Numero de l'epic (IID)"),
      body: z.string().describe("Contenu du commentaire (Markdown)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Commenter l'epic", { groupe: args.group_id, epic_iid: args.epic_iid, body: args.body });
      }
      const note = await client.addEpicNote(args.group_id, args.epic_iid, args.body);
      return {
        content: [{ type: "text" as const, text: `Commentaire ajoute sur l'epic #${args.epic_iid} par @${note.author.username}.` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  // --- Work Items tools ---

  server.registerTool("get_epic_widgets", {
    description: "Get Work Item widgets for an epic: health status, progress, milestone, iteration, and linked items.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Epic IID"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const epic = await client.getEpicWidgets(args.group_id, args.epic_iid);
      const widgets = epic.widgets ?? [];
      const parts: string[] = [`# Epic: ${epic.title ?? ""} (#${epic.iid ?? args.epic_iid})`, ""];

      for (const w of widgets) {
        switch (w.type) {
          case "HEALTH_STATUS":
            parts.push(`**Health status:** ${w.healthStatus ?? "not set"}`);
            break;
          case "PROGRESS":
            parts.push(`**Progress:** ${w.progress ?? 0}% (current value: ${w.currentValue ?? 0})`);
            break;
          case "MILESTONE":
            parts.push(`**Milestone:** ${w.milestone?.title ?? "none"}`);
            break;
          case "ITERATION":
            parts.push(`**Iteration:** ${w.iteration?.title ?? "none"}${w.iteration?.startDate ? ` (${w.iteration.startDate} → ${w.iteration.dueDate})` : ""}`);
            break;
          case "LINKED_ITEMS":
            if (w.linkedItems?.nodes?.length) {
              parts.push(`**Linked items:** ${w.linkedItems.nodes.length}`);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const link of w.linkedItems.nodes as any[]) {
                parts.push(`  - ${link.linkType}: ${link.workItem?.title ?? "?"} (${link.workItem?.state ?? "?"}) ${link.workItem?.webUrl ?? ""}`);
              }
            }
            break;
        }
      }
      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("set_epic_milestone", {
    description: "Associate a milestone with an epic (uses Work Items API). dry_run=true by default.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Epic IID"),
      milestone_id: z.number().nullable().describe("Milestone ID (null to remove)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Set epic milestone", { group: args.group_id, epic_iid: args.epic_iid, milestone_id: args.milestone_id ?? "(remove)" });
      }
      await client.setEpicMilestone(args.group_id, args.epic_iid, args.milestone_id);
      return { content: [{ type: "text" as const, text: args.milestone_id ? `Milestone ${args.milestone_id} set on epic #${args.epic_iid}.` : `Milestone removed from epic #${args.epic_iid}.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("set_epic_health_status", {
    description: "Set the health status of an epic (onTrack, needsAttention, atRisk, or null to clear). dry_run=true by default.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Epic IID"),
      health_status: z.enum(["onTrack", "needsAttention", "atRisk"]).nullable().describe("Health status (null to clear)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Set epic health status", { group: args.group_id, epic_iid: args.epic_iid, health_status: args.health_status ?? "(clear)" });
      }
      await client.setHealthStatus({ type: "epic", groupId: args.group_id, epicIid: args.epic_iid }, args.health_status);
      return { content: [{ type: "text" as const, text: `Health status of epic #${args.epic_iid} set to ${args.health_status ?? "cleared"}.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("set_issue_health_status", {
    description: "Set the health status of an issue (onTrack, needsAttention, atRisk, or null to clear). dry_run=true by default.",
    inputSchema: {
      project_id: z.number().describe("Project ID"),
      issue_iid: z.number().describe("Issue IID"),
      health_status: z.enum(["onTrack", "needsAttention", "atRisk"]).nullable().describe("Health status (null to clear)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Set issue health status", { project_id: args.project_id, issue_iid: args.issue_iid, health_status: args.health_status ?? "(clear)" });
      }
      await client.setHealthStatus({ type: "issue", projectId: args.project_id, issueIid: args.issue_iid }, args.health_status);
      return { content: [{ type: "text" as const, text: `Health status of issue #${args.issue_iid} set to ${args.health_status ?? "cleared"}.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("set_epic_iteration", {
    description: "Associate an iteration (sprint) with an epic (uses Work Items API). dry_run=true by default.",
    inputSchema: {
      group_id: groupIdSchema,
      epic_iid: z.number().describe("Epic IID"),
      iteration_id: z.number().nullable().describe("Iteration ID (null to remove)"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Set epic iteration", { group: args.group_id, epic_iid: args.epic_iid, iteration_id: args.iteration_id ?? "(remove)" });
      }
      await client.setEpicIteration(args.group_id, args.epic_iid, args.iteration_id);
      return { content: [{ type: "text" as const, text: args.iteration_id ? `Iteration ${args.iteration_id} set on epic #${args.epic_iid}.` : `Iteration removed from epic #${args.epic_iid}.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("add_linked_item", {
    description: "Create a link between two work items (epics or issues). Link types: RELATED, BLOCKS, BLOCKED_BY. dry_run=true by default.",
    inputSchema: {
      source_type: z.enum(["epic", "issue"]).describe("Source work item type"),
      group_id: z.string().optional().describe("Group ID (required if source is epic)"),
      project_id: z.number().optional().describe("Project ID (required if source is issue)"),
      source_iid: z.number().describe("Source IID (epic or issue)"),
      target_gid: z.string().describe("Target work item GID (e.g. gid://gitlab/Issue/123 — get it from get_issue or get_epic_widgets)"),
      link_type: z.enum(["RELATED", "BLOCKS", "BLOCKED_BY"]).describe("Relationship type"),
      dry_run: dryRunSchema,
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return dryRunResponse("Link work items", { source: `${args.source_type} #${args.source_iid}`, target: args.target_gid, link_type: args.link_type });
      }
      const target = args.source_type === "epic"
        ? { type: "epic" as const, groupId: args.group_id!, epicIid: args.source_iid }
        : { type: "issue" as const, projectId: args.project_id!, issueIid: args.source_iid };
      await client.addLinkedItem(target, args.target_gid, args.link_type);
      return { content: [{ type: "text" as const, text: `Link created: ${args.source_type} #${args.source_iid} ${args.link_type} ${args.target_gid}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });
}
