import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabProject, GitLabMember, GitLabUser, GitLabGroup } from "../types.js";

const groupIdSchema = z.string().describe("ID ou chemin du groupe GitLab");

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

export function registerUtilTools(server: McpServer, client: GitLabClient): void {
  server.registerTool("list_groups", {
    description:
      "Lister les groupes GitLab accessibles. Utiliser ce tool pour decouvrir les group_id a passer aux autres tools.",
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
