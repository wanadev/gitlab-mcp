import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitLabClient } from "../client.js";
import type { GitLabProject, GitLabMember, GitLabUser } from "../types.js";

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

export function registerUtilTools(server: McpServer, client: GitLabClient): void {
  server.registerTool("list_projects", {
    description:
      "Lister les projets du groupe GitLab. Filtrer par recherche ou statut d'archivage.",
    inputSchema: {
      search: z.string().optional().describe("Recherche textuelle dans le nom du projet"),
      archived: z.enum(["true", "false"]).optional().describe("Filtrer les projets archives"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const projects = await client.listProjects(args);
      return { content: [{ type: "text" as const, text: formatProjects(projects) }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Erreur: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  server.registerTool("list_group_members", {
    description: "Lister les membres du groupe GitLab avec leur niveau d'acces.",
    inputSchema: {
      search: z.string().optional().describe("Recherche par nom ou username"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const members = await client.listGroupMembers(args);
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
