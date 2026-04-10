import type {
  GitLabConfig,
  GitLabEpic,
  GitLabIssue,
  GitLabMilestone,
  GitLabUser,
  GitLabProject,
  GitLabMember,
  GitLabGroup,
  GitLabMergeRequest,
  GitLabLabel,
  GitLabNote,
  GitLabBoard,
  GitLabIteration,
} from "./types.js";

export class GitLabClient {
  private baseUrl: string;
  private token: string;
  private readOnly: boolean;

  constructor(config: GitLabConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
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

  // --- Groups ---

  async listGroups(params?: {
    search?: string;
    top_level_only?: boolean;
  }): Promise<GitLabGroup[]> {
    const queryParams: Record<string, string> = {};
    if (params?.search) queryParams["search"] = params.search;
    if (params?.top_level_only) queryParams["top_level_only"] = "true";

    return this.paginate<GitLabGroup>("/groups", queryParams);
  }

  // --- Epics ---

  async listEpics(groupId: string, params?: {
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
      `/groups/${encodeURIComponent(groupId)}/epics`,
      queryParams,
    );
  }

  async getEpic(groupId: string, epicIid: number): Promise<GitLabEpic> {
    return this.request<GitLabEpic>(
      "GET",
      `/groups/${encodeURIComponent(groupId)}/epics/${epicIid}`,
    );
  }

  async createEpic(groupId: string, data: {
    title: string;
    description?: string;
    labels?: string;
    milestone_id?: number;
    start_date?: string;
    due_date?: string;
  }): Promise<GitLabEpic> {
    return this.request<GitLabEpic>(
      "POST",
      `/groups/${encodeURIComponent(groupId)}/epics`,
      data,
    );
  }

  async updateEpic(
    groupId: string,
    epicIid: number,
    data: {
      title?: string;
      description?: string;
      labels?: string;
      milestone_id?: number;
      start_date?: string;
      due_date?: string;
      state_event?: string;
    },
  ): Promise<GitLabEpic> {
    return this.request<GitLabEpic>(
      "PUT",
      `/groups/${encodeURIComponent(groupId)}/epics/${epicIid}`,
      data,
    );
  }

  async closeEpic(groupId: string, epicIid: number): Promise<GitLabEpic> {
    return this.updateEpic(groupId, epicIid, { state_event: "close" });
  }

  async listEpicIssues(groupId: string, epicIid: number): Promise<GitLabIssue[]> {
    return this.paginate<GitLabIssue>(
      `/groups/${encodeURIComponent(groupId)}/epics/${epicIid}/issues`,
    );
  }

  async addIssueToEpic(
    groupId: string,
    epicIid: number,
    issueId: number,
  ): Promise<{ id: number; epic: GitLabEpic; issue: GitLabIssue }> {
    return this.request(
      "POST",
      `/groups/${encodeURIComponent(groupId)}/epics/${epicIid}/issues/${issueId}`,
    );
  }

  async listEpicNotes(groupId: string, epicIid: number): Promise<GitLabNote[]> {
    return this.paginate<GitLabNote>(
      `/groups/${encodeURIComponent(groupId)}/epics/${epicIid}/notes`,
    );
  }

  async addEpicNote(groupId: string, epicIid: number, body: string): Promise<GitLabNote> {
    return this.request<GitLabNote>(
      "POST",
      `/groups/${encodeURIComponent(groupId)}/epics/${epicIid}/notes`,
      { body },
    );
  }

  // --- Issues ---

  async listGroupIssues(groupId: string, params?: {
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
      `/groups/${encodeURIComponent(groupId)}/issues`,
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
      iteration_id?: number;
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
      iteration_id?: number;
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

  async listIssueNotes(projectId: number, issueIid: number): Promise<GitLabNote[]> {
    return this.paginate<GitLabNote>(
      `/projects/${projectId}/issues/${issueIid}/notes`,
    );
  }

  async addIssueNote(projectId: number, issueIid: number, body: string): Promise<GitLabNote> {
    return this.request<GitLabNote>(
      "POST",
      `/projects/${projectId}/issues/${issueIid}/notes`,
      { body },
    );
  }

  // --- Merge Requests ---

  async listGroupMergeRequests(groupId: string, params?: {
    state?: string;
    search?: string;
    labels?: string;
    milestone?: string;
    author_username?: string;
    reviewer_username?: string;
    order_by?: string;
    sort?: string;
  }): Promise<GitLabMergeRequest[]> {
    const queryParams: Record<string, string> = {};
    if (params?.state) queryParams["state"] = params.state;
    if (params?.search) queryParams["search"] = params.search;
    if (params?.labels) queryParams["labels"] = params.labels;
    if (params?.milestone) queryParams["milestone"] = params.milestone;
    if (params?.author_username) queryParams["author_username"] = params.author_username;
    if (params?.reviewer_username) queryParams["reviewer_username"] = params.reviewer_username;
    if (params?.order_by) queryParams["order_by"] = params.order_by;
    if (params?.sort) queryParams["sort"] = params.sort;

    return this.paginate<GitLabMergeRequest>(
      `/groups/${encodeURIComponent(groupId)}/merge_requests`,
      queryParams,
    );
  }

  async getMergeRequest(projectId: number, mrIid: number): Promise<GitLabMergeRequest> {
    return this.request<GitLabMergeRequest>(
      "GET",
      `/projects/${projectId}/merge_requests/${mrIid}`,
    );
  }

  // --- Milestones ---

  async listGroupMilestones(groupId: string, params?: {
    state?: string;
    search?: string;
  }): Promise<GitLabMilestone[]> {
    const queryParams: Record<string, string> = {};
    if (params?.state) queryParams["state"] = params.state;
    if (params?.search) queryParams["search"] = params.search;

    return this.paginate<GitLabMilestone>(
      `/groups/${encodeURIComponent(groupId)}/milestones`,
      queryParams,
    );
  }

  async getMilestone(groupId: string, milestoneId: number): Promise<GitLabMilestone> {
    return this.request<GitLabMilestone>(
      "GET",
      `/groups/${encodeURIComponent(groupId)}/milestones/${milestoneId}`,
    );
  }

  async createMilestone(groupId: string, data: {
    title: string;
    description?: string;
    start_date?: string;
    due_date?: string;
  }): Promise<GitLabMilestone> {
    return this.request<GitLabMilestone>(
      "POST",
      `/groups/${encodeURIComponent(groupId)}/milestones`,
      data,
    );
  }

  async updateMilestone(
    groupId: string,
    milestoneId: number,
    data: {
      title?: string;
      description?: string;
      start_date?: string;
      due_date?: string;
      state_event?: string;
    },
  ): Promise<GitLabMilestone> {
    return this.request<GitLabMilestone>(
      "PUT",
      `/groups/${encodeURIComponent(groupId)}/milestones/${milestoneId}`,
      data,
    );
  }

  async closeMilestone(groupId: string, milestoneId: number): Promise<GitLabMilestone> {
    return this.updateMilestone(groupId, milestoneId, { state_event: "close" });
  }

  // --- Iterations ---

  async listGroupIterations(groupId: string, params?: {
    state?: string;
    search?: string;
  }): Promise<GitLabIteration[]> {
    const queryParams: Record<string, string> = {};
    if (params?.state) queryParams["state"] = params.state;
    if (params?.search) queryParams["search"] = params.search;

    return this.paginate<GitLabIteration>(
      `/groups/${encodeURIComponent(groupId)}/iterations`,
      queryParams,
    );
  }

  // --- Utils ---

  async listProjects(groupId: string, params?: {
    search?: string;
    archived?: string;
  }): Promise<GitLabProject[]> {
    const queryParams: Record<string, string> = {};
    if (params?.search) queryParams["search"] = params.search;
    if (params?.archived) queryParams["archived"] = params.archived;

    return this.paginate<GitLabProject>(
      `/groups/${encodeURIComponent(groupId)}/projects`,
      queryParams,
    );
  }

  async listGroupMembers(groupId: string, params?: {
    search?: string;
  }): Promise<GitLabMember[]> {
    const queryParams: Record<string, string> = {};
    if (params?.search) queryParams["search"] = params.search;

    return this.paginate<GitLabMember>(
      `/groups/${encodeURIComponent(groupId)}/members`,
      queryParams,
    );
  }

  async listGroupLabels(groupId: string, params?: {
    search?: string;
  }): Promise<GitLabLabel[]> {
    const queryParams: Record<string, string> = {};
    if (params?.search) queryParams["search"] = params.search;

    return this.paginate<GitLabLabel>(
      `/groups/${encodeURIComponent(groupId)}/labels`,
      queryParams,
    );
  }

  async listGroupBoards(groupId: string): Promise<GitLabBoard[]> {
    return this.paginate<GitLabBoard>(
      `/groups/${encodeURIComponent(groupId)}/boards`,
    );
  }

  async getCurrentUser(): Promise<GitLabUser> {
    return this.request<GitLabUser>("GET", "/user");
  }
}
