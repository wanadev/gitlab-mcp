import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabProject, GitLabMember, GitLabUser, GitLabGroup, GitLabLabel, GitLabBoard, GitLabIteration } from "../types.js";

const groupIdSchema = z.string().describe("ID ou chemin URL du groupe GitLab (ex: '42' ou 'wanadev/kp1'). Si vous n'avez que le nom, appelez d'abord list_groups pour trouver le chemin exact.");

function formatProject(p: GitLabProject): string {
  const archived = p.archived ? " [ARCHIVE]" : "";
  return `**${p.name_with_namespace}** (id:${p.id})${archived}\n  ${p.web_url}`;
}

function formatProjects(projects: GitLabProject[]): string {
  if (projects.length === 0) return "Aucun projet trouve.";
  return `${projects.length} projet(s) :\n\n${projects.map(formatProject).join("\n\n")}`;
}

function accessLevelName(level: number): string {
  const levels: Record<number, string> = {
    10: "Guest",
    20: "Reporter",
    30: "Developer",
    40: "Maintainer",
    50: "Owner",
  };
  return levels[level] ?? `Level ${level}`;
}

function formatMember(m: GitLabMember): string {
  return `**${m.name}** (@${m.username}) — ${accessLevelName(m.access_level)}\n  ${m.web_url}`;
}

function formatMembers(members: GitLabMember[]): string {
  if (members.length === 0) return "Aucun membre trouve.";
  return `${members.length} membre(s) :\n\n${members.map(formatMember).join("\n\n")}`;
}

function formatUser(u: GitLabUser): string {
  return `**${u.name}** (@${u.username})\nID: ${u.id}\nEtat: ${u.state}\n${u.web_url}`;
}

function formatGroup(g: GitLabGroup): string {
  const parent = g.parent_id ? ` — parent: ${g.parent_id}` : " (top-level)";
  const desc = g.description ? ` — ${g.description}` : "";
  return `**${g.name}** (id:${g.id}, path: ${g.full_path})${parent}${desc}\n  ${g.web_url}`;
}

function formatGroups(groups: GitLabGroup[]): string {
  if (groups.length === 0) return "Aucun groupe trouve.";
  return `${groups.length} groupe(s) :\n\n${groups.map(formatGroup).join("\n\n")}`;
}

function formatLabel(l: GitLabLabel): string {
  const prio = l.priority != null ? ` — Priorite: ${l.priority}` : "";
  const desc = l.description ? ` — ${l.description}` : "";
  return `**${l.name}** (${l.color}) — ${l.open_issues_count} issues ouvertes, ${l.closed_issues_count} fermees, ${l.open_merge_requests_count} MRs${prio}${desc}`;
}

function formatLabels(labels: GitLabLabel[]): string {
  if (labels.length === 0) return "Aucun label trouve.";
  return `${labels.length} label(s) :\n\n${labels.map(formatLabel).join("\n\n")}`;
}

function formatBoard(b: GitLabBoard): string {
  const milestone = b.milestone ? ` — Milestone: ${b.milestone.title}` : "";
  const lists = b.lists.map((l) =>
    l.label ? `  - ${l.label.name} (position: ${l.position})` : `  - (position: ${l.position})`
  ).join("\n");
  return `**${b.name}** (id:${b.id})${milestone}\n${lists || "  (aucune colonne)"}`;
}

function formatBoards(boards: GitLabBoard[]): string {
  if (boards.length === 0) return "Aucun board trouve.";
  return `${boards.length} board(s) :\n\n${boards.map(formatBoard).join("\n\n")}`;
}

export function registerUtilTools(server: McpServer, client: GitLabClient): void {
  server.registerTool("list_groups", {
    description:
      "Lister les groupes GitLab accessibles. IMPORTANT : appelez ce tool en premier quand l'utilisateur mentionne un groupe par son nom, pour obtenir le group_id (ID ou full_path) a passer aux autres tools.",
    inputSchema: {
      search: z.string().optional().describe("Recherche textuelle dans le nom du groupe"),
      top_level_only: z.boolean().optional().describe("Ne retourner que les groupes de premier niveau"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const groups = await client.listGroups(args);
      return { content: [{ type: "text" as const, text: formatGroups(groups) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_projects", {
    description:
      "Lister les projets d'un groupe GitLab. Filtrer par recherche ou statut d'archivage.",
    inputSchema: {
      group_id: groupIdSchema,
      search: z.string().optional().describe("Recherche textuelle dans le nom du projet"),
      archived: z.enum(["true", "false"]).optional().describe("Filtrer les projets archives"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const projects = await client.listProjects(group_id, params);
      return { content: [{ type: "text" as const, text: formatProjects(projects) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_group_members", {
    description: "Lister les membres d'un groupe GitLab avec leur niveau d'acces.",
    inputSchema: {
      group_id: groupIdSchema,
      search: z.string().optional().describe("Recherche par nom ou username"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const members = await client.listGroupMembers(group_id, params);
      return { content: [{ type: "text" as const, text: formatMembers(members) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_labels", {
    description: "Lister les labels d'un groupe GitLab avec le nombre d'issues et MRs associees.",
    inputSchema: {
      group_id: groupIdSchema,
      search: z.string().optional().describe("Recherche textuelle dans le nom du label"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const labels = await client.listGroupLabels(group_id, params);
      return { content: [{ type: "text" as const, text: formatLabels(labels) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_boards", {
    description: "Lister les boards (tableaux kanban) d'un groupe GitLab avec leurs colonnes.",
    inputSchema: {
      group_id: groupIdSchema,
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const boards = await client.listGroupBoards(args.group_id);
      return { content: [{ type: "text" as const, text: formatBoards(boards) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_iterations", {
    description: "List iterations (sprints) for a GitLab group. Filter by state (upcoming, current, closed) or search by title. Requires GitLab Premium/Ultimate.",
    inputSchema: {
      group_id: groupIdSchema,
      state: z.enum(["upcoming", "current", "closed"]).optional().describe("Filter by state"),
      search: z.string().optional().describe("Search by iteration title"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const { group_id, ...params } = args;
      const iterations = await client.listGroupIterations(group_id, params);
      if (iterations.length === 0) {
        return { content: [{ type: "text" as const, text: "No iterations found." }] };
      }
      const text = iterations.map((it: GitLabIteration) => {
        const dates = `${it.start_date} → ${it.due_date}`;
        return `**${it.title}** (id:${it.id}) — ${it.state} — ${dates}\n  ${it.web_url}`;
      }).join("\n\n");
      return { content: [{ type: "text" as const, text: `${iterations.length} iteration(s) :\n\n${text}` }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("create_label", {
    description: "Create a label in a group. dry_run=true by default.",
    inputSchema: {
      group_id: groupIdSchema,
      name: z.string().describe("Label name"),
      color: z.string().describe("Label color (hex, e.g. '#FF0000')"),
      description: z.string().optional().describe("Label description"),
      dry_run: z.boolean().default(true).describe("Dry run mode (default: true)."),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        const lines = [`  - **name:** ${args.name}`, `  - **color:** ${args.color}`];
        if (args.description) lines.push(`  - **description:** ${args.description}`);
        return { content: [{ type: "text" as const, text: `[DRY RUN] Create label\n\n${lines.join("\n")}\n\nThis is a preview. Ask the user to confirm in their language before re-calling with dry_run=false.` }] };
      }
      const label = await client.createLabel(args.group_id, { name: args.name, color: args.color, description: args.description });
      return { content: [{ type: "text" as const, text: `Label "${label.name}" created (${label.color}).` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("update_label", {
    description: "Update a label in a group. dry_run=true by default.",
    inputSchema: {
      group_id: groupIdSchema,
      label_id: z.number().describe("Label ID"),
      new_name: z.string().optional().describe("New label name"),
      color: z.string().optional().describe("New color (hex)"),
      description: z.string().optional().describe("New description"),
      dry_run: z.boolean().default(true).describe("Dry run mode (default: true)."),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        const details: Record<string, unknown> = { label_id: args.label_id };
        if (args.new_name) details.new_name = args.new_name;
        if (args.color) details.color = args.color;
        if (args.description) details.description = args.description;
        const lines = Object.entries(details).map(([k, v]) => `  - **${k}:** ${v}`);
        return { content: [{ type: "text" as const, text: `[DRY RUN] Update label\n\n${lines.join("\n")}\n\nThis is a preview. Ask the user to confirm in their language before re-calling with dry_run=false.` }] };
      }
      const { group_id, label_id, dry_run, ...data } = args;
      const label = await client.updateLabel(group_id, label_id, data);
      return { content: [{ type: "text" as const, text: `Label "${label.name}" updated.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("delete_label", {
    description: "Delete a label from a group. dry_run=true by default. This is destructive and cannot be undone.",
    inputSchema: {
      group_id: groupIdSchema,
      label_id: z.number().describe("Label ID to delete"),
      dry_run: z.boolean().default(true).describe("Dry run mode (default: true)."),
    },
    annotations: { readOnlyHint: false },
  }, async (args) => {
    try {
      if (args.dry_run) {
        return { content: [{ type: "text" as const, text: `[DRY RUN] Delete label ${args.label_id} from group ${args.group_id}\n\nThis is a preview. Ask the user to confirm in their language before re-calling with dry_run=false.` }] };
      }
      await client.deleteLabel(args.group_id, args.label_id);
      return { content: [{ type: "text" as const, text: `Label ${args.label_id} deleted.` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("search_users", {
    description: "Search for GitLab users globally by name or username.",
    inputSchema: {
      query: z.string().describe("Search query (name or username)"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const users = await client.searchUsers(args.query);
      if (users.length === 0) return { content: [{ type: "text" as const, text: "No users found." }] };
      const text = users.map(u => `**${u.name}** (@${u.username}) — ID: ${u.id}\n  ${u.web_url}`).join("\n\n");
      return { content: [{ type: "text" as const, text: `${users.length} user(s):\n\n${text}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }], isError: true };
    }
  });

  server.registerTool("get_current_user", {
    description:
      "Obtenir les informations de l'utilisateur connecte (verifie que le token fonctionne).",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const user = await client.getCurrentUser();
      return { content: [{ type: "text" as const, text: formatUser(user) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });
}
