import type {
  GitLabConfig,
  GitLabEpic,
  GitLabIssue,
  GitLabMilestone,
  GitLabUser,
  GitLabProject,
  GitLabMember,
} from "./types.js";

export class GitLabClient {
  private baseUrl: string;
  private token: string;
  private groupId: string;
  private readOnly: boolean;

  constructor(config: GitLabConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.groupId = config.groupId;
    this.readOnly = config.readOnly;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (this.readOnly && method !== "GET") {
      throw new Error(
        `Mode lecture seule actif (GITLAB_READ_ONLY=true). Impossible d'effectuer une requete ${method}.`,
      );
    }

    const url = new URL(`/api/v4${path}`, this.baseUrl);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers: {
            "PRIVATE-TOKEN": this.token,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : 1000 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const message = this.formatHttpError(response.status, text, path);
          throw new Error(message);
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("Mode lecture seule")
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (
          error instanceof DOMException &&
          error.name === "TimeoutError"
        ) {
          if (attempt < 2) continue;
        } else if (
          !(error instanceof Error && error.message.includes("429"))
        ) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Echec apres 3 tentatives");
  }

  private formatHttpError(
    status: number,
    body: string,
    path: string,
  ): string {
    let detail = "";
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      detail = parsed.message ?? parsed.error ?? body;
    } catch {
      detail = body;
    }

    switch (status) {
      case 401:
        return "Authentification echouee. Verifiez votre GITLAB_TOKEN.";
      case 403:
        return `Acces refuse (403) sur ${path}. Verifiez les permissions du token et le niveau GitLab (Premium/Ultimate pour les epics).`;
      case 404:
        return `Ressource introuvable (404) : ${path}. Verifiez l'ID du groupe/projet.`;
      default:
        return `Erreur GitLab ${status} sur ${path}: ${detail}`;
    }
  }

  async paginate<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    const maxItems = 500;

    while (results.length < maxItems) {
      const url = new URL(`/api/v4${path}`, this.baseUrl);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== "") {
            url.searchParams.set(key, value);
          }
        }
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "PRIVATE-TOKEN": this.token,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(this.formatHttpError(response.status, text, path));
      }

      const data = (await response.json()) as T[];
      if (data.length === 0) break;

      results.push(...data);

      const totalPages = response.headers.get("X-Total-Pages");
      if (totalPages && page >= parseInt(totalPages, 10)) break;

      page++;
    }

    return results.slice(0, maxItems);
  }

  // --- Epics ---

  async listEpics(params?: {
    state?: string;
    search?: string;
    labels?: string;
    order_by?: string;
    sort?: string;
  }): Promise<GitLabEpic[]> {
    const queryParams: Record<string, string> = {};
    if (params?.state) queryParams["state"] = params.state;
    if (params?.search) queryParams["search"] = params.search;
    if (params?.labels) queryParams["labels"] = params.labels;
    if (params?.order_by) queryParams["order_by"] = params.order_by;
    if (params?.sort) queryParams["sort"] = params.sort;

    return this.paginate<GitLabEpic>(
      `/groups/${encodeURIComponent(this.groupId)}/epics`,
      queryParams,
    );
  }

  async getEpic(epicIid: number): Promise<GitLabEpic> {
    return this.request<GitLabEpic>(
      "GET",
      `/groups/${encodeURIComponent(this.groupId)}/epics/${epicIid}`,
    );
  }

  async createEpic(data: {
    title: string;
    description?: string;
    labels?: string;
    start_date?: string;
    due_date?: string;
  }): Promise<GitLabEpic> {
    return this.request<GitLabEpic>(
      "POST",
      `/groups/${encodeURIComponent(this.groupId)}/epics`,
      data,
    );
  }

  async updateEpic(
    epicIid: number,
    data: {
      title?: string;
      description?: string;
      labels?: string;
      start_date?: string;
      due_date?: string;
      state_event?: string;
    },
  ): Promise<GitLabEpic> {
    return this.request<GitLabEpic>(
      "PUT",
      `/groups/${encodeURIComponent(this.groupId)}/epics/${epicIid}`,
      data,
    );
  }

  async closeEpic(epicIid: number): Promise<GitLabEpic> {
    return this.updateEpic(epicIid, { state_event: "close" });
  }

  async listEpicIssues(epicIid: number): Promise<GitLabIssue[]> {
    return this.paginate<GitLabIssue>(
      `/groups/${encodeURIComponent(this.groupId)}/epics/${epicIid}/issues`,
    );
  }

  async addIssueToEpic(
    epicIid: number,
    issueId: number,
  ): Promise<{ id: number; epic: GitLabEpic; issue: GitLabIssue }> {
    return this.request(
      "POST",
      `/groups/${encodeURIComponent(this.groupId)}/epics/${epicIid}/issues/${issueId}`,
    );
  }

  // --- Issues ---

  async listGroupIssues(params?: {
    state?: string;
    search?: string;
    labels?: string;
    milestone?: string;
    assignee_username?: string;
    order_by?: string;
    sort?: string;
  }): Promise<GitLabIssue[]> {
    const queryParams: Record<string, string> = {};
    if (params?.state) queryParams["state"] = params.state;
    if (params?.search) queryParams["search"] = params.search;
    if (params?.labels) queryParams["labels"] = params.labels;
    if (params?.milestone) queryParams["milestone"] = params.milestone;
    if (params?.assignee_username)
      queryParams["assignee_username"] = params.assignee_username;
    if (params?.order_by) queryParams["order_by"] = params.order_by;
    if (params?.sort) queryParams["sort"] = params.sort;

    return this.paginate<GitLabIssue>(
      `/groups/${encodeURIComponent(this.groupId)}/issues`,
      queryParams,
    );
  }

  async getIssue(projectId: number, issueIid: number): Promise<GitLabIssue> {
    return this.request<GitLabIssue>(
      "GET",
      `/projects/${projectId}/issues/${issueIid}`,
    );
  }

  async createIssue(
    projectId: number,
    data: {
      title: string;
      description?: string;
      labels?: string;
      milestone_id?: number;
      assignee_ids?: number[];
      due_date?: string;
      weight?: number;
      epic_id?: number;
    },
  ): Promise<GitLabIssue> {
    return this.request<GitLabIssue>(
      "POST",
      `/projects/${projectId}/issues`,
      data,
    );
  }

  async updateIssue(
    projectId: number,
    issueIid: number,
    data: {
      title?: string;
      description?: string;
      labels?: string;
      milestone_id?: number;
      assignee_ids?: number[];
      due_date?: string;
      weight?: number;
      state_event?: string;
    },
  ): Promise<GitLabIssue> {
    return this.request<GitLabIssue>(
      "PUT",
      `/projects/${projectId}/issues/${issueIid}`,
      data,
    );
  }

  async closeIssue(
    projectId: number,
    issueIid: number,
  ): Promise<GitLabIssue> {
    return this.updateIssue(projectId, issueIid, { state_event: "close" });
  }

  // --- Milestones ---

  async listGroupMilestones(params?: {
    state?: string;
    search?: string;
  }): Promise<GitLabMilestone[]> {
    const queryParams: Record<string, string> = {};
    if (params?.state) queryParams["state"] = params.state;
    if (params?.search) queryParams["search"] = params.search;

    return this.paginate<GitLabMilestone>(
      `/groups/${encodeURIComponent(this.groupId)}/milestones`,
      queryParams,
    );
  }

  async getMilestone(milestoneId: number): Promise<GitLabMilestone> {
    return this.request<GitLabMilestone>(
      "GET",
      `/groups/${encodeURIComponent(this.groupId)}/milestones/${milestoneId}`,
    );
  }

  async createMilestone(data: {
    title: string;
    description?: string;
    start_date?: string;
    due_date?: string;
  }): Promise<GitLabMilestone> {
    return this.request<GitLabMilestone>(
      "POST",
      `/groups/${encodeURIComponent(this.groupId)}/milestones`,
      data,
    );
  }

  // --- Utils ---

  async listProjects(params?: {
    search?: string;
    archived?: string;
  }): Promise<GitLabProject[]> {
    const queryParams: Record<string, string> = {};
    if (params?.search) queryParams["search"] = params.search;
    if (params?.archived) queryParams["archived"] = params.archived;

    return this.paginate<GitLabProject>(
      `/groups/${encodeURIComponent(this.groupId)}/projects`,
      queryParams,
    );
  }

  async listGroupMembers(params?: {
    search?: string;
  }): Promise<GitLabMember[]> {
    const queryParams: Record<string, string> = {};
    if (params?.search) queryParams["search"] = params.search;

    return this.paginate<GitLabMember>(
      `/groups/${encodeURIComponent(this.groupId)}/members`,
      queryParams,
    );
  }

  async getCurrentUser(): Promise<GitLabUser> {
    return this.request<GitLabUser>("GET", "/user");
  }
}
