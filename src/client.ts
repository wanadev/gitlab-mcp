import type {
  GitLabConfig, GitLabEpic, GitLabIssue, GitLabMilestone,
  GitLabUser, GitLabProject, GitLabMember, GitLabGroup,
  GitLabMergeRequest, GitLabLabel, GitLabNote, GitLabBoard, GitLabIteration,
} from "./types.js";
import {
  toGid, type ConnectionExtractor,
  Q_CURRENT_USER, Q_GROUPS, Q_EPICS, Q_EPIC, Q_EPIC_ISSUES, Q_EPIC_NOTES,
  Q_GROUP_ISSUES, Q_ISSUE, Q_ISSUE_NOTES,
  Q_MILESTONES, Q_MILESTONE,
  Q_MERGE_REQUESTS, Q_MERGE_REQUEST,
  Q_ITERATIONS, Q_PROJECTS, Q_MEMBERS, Q_LABELS, Q_BOARDS, Q_PROJECT_PATH,
  M_CREATE_EPIC, M_UPDATE_EPIC, M_CREATE_MILESTONE, M_UPDATE_MILESTONE,
  M_CREATE_ISSUE, M_UPDATE_ISSUE, M_CREATE_NOTE, M_EPIC_ADD_ISSUE,
  Q_WORK_ITEM_ID, Q_WORK_ITEM_WIDGETS, Q_ISSUE_WORK_ITEM_ID,
  M_WORK_ITEM_UPDATE, M_WORK_ITEM_ADD_LINKED,
  mapUser, mapEpic, mapIssue, mapMilestone, mapMergeRequest,
  mapGroup, mapProject, mapMember, mapLabel, mapNote, mapBoard, mapIteration,
} from "./graphql.js";

export class GitLabClient {
  private baseUrl: string;
  private token: string;
  private readOnly: boolean;
  private projectPathCache = new Map<number, string>();

  constructor(config: GitLabConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.readOnly = config.readOnly;
  }

  // ---------------------------------------------------------------------------
  // Core GraphQL methods
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async graphql<T = any>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    if (this.readOnly && query.trimStart().startsWith("mutation")) {
      throw new Error(
        "Mode lecture seule actif (GITLAB_READ_ONLY=true). Impossible d'effectuer une mutation.",
      );
    }

    const url = `${this.baseUrl}/api/graphql`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "PRIVATE-TOKEN": this.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, variables }),
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
          throw new Error(this.formatHttpError(response.status, text));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = (await response.json()) as { data?: T; errors?: any[] };

        if (json.errors?.length) {
          const messages = json.errors.map((e: { message: string }) => e.message).join("; ");
          throw new Error(`GraphQL error: ${messages}`);
        }

        return json.data as T;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("Mode lecture seule")
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof DOMException && error.name === "TimeoutError") {
          if (attempt < 2) continue;
        } else {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Echec apres 3 tentatives");
  }

  private async graphqlPaginate<TRaw, TOut>(
    query: string,
    variables: Record<string, unknown>,
    extract: ConnectionExtractor<TRaw>,
    mapper: (node: TRaw) => TOut,
    maxItems = 500,
  ): Promise<TOut[]> {
    const results: TOut[] = [];
    let after: string | null = null;

    while (results.length < maxItems) {
      const data = await this.graphql(query, { ...variables, after });
      const connection = extract(data);
      if (!connection || !connection.nodes) break;

      for (const node of connection.nodes) {
        results.push(mapper(node));
      }

      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }

    return results.slice(0, maxItems);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async mutate<T>(query: string, input: Record<string, unknown>, resultKey: string): Promise<any> {
    const data = await this.graphql<Record<string, { errors?: string[] } & T>>(query, { input });
    const result = data[resultKey];
    if (result?.errors?.length) {
      throw new Error(`GitLab mutation error: ${result.errors.join("; ")}`);
    }
    return result;
  }

  private formatHttpError(status: number, body: string): string {
    switch (status) {
      case 401:
        return "Authentification echouee. Verifiez votre GITLAB_TOKEN.";
      case 403:
        return "Acces refuse (403). Verifiez les permissions du token et le niveau GitLab (Premium/Ultimate pour les epics).";
      case 404:
        return "Endpoint GraphQL introuvable (404). Verifiez GITLAB_BASE_URL.";
      default:
        return `Erreur GitLab ${status}: ${body.slice(0, 200)}`;
    }
  }

  private async resolveProjectPath(projectId: number): Promise<string> {
    const cached = this.projectPathCache.get(projectId);
    if (cached) return cached;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_PROJECT_PATH, { id: toGid("Project", projectId) });
    const fullPath = data.project?.fullPath;
    if (!fullPath) throw new Error(`Project ${projectId} not found`);

    this.projectPathCache.set(projectId, fullPath);
    return fullPath;
  }

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------

  async listGroups(params?: {
    search?: string;
    top_level_only?: boolean;
  }): Promise<GitLabGroup[]> {
    return this.graphqlPaginate(
      Q_GROUPS,
      { search: params?.search ?? null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.groups,
      mapGroup,
    );
  }

  // ---------------------------------------------------------------------------
  // Epics
  // ---------------------------------------------------------------------------

  async listEpics(groupId: string, params?: {
    state?: string;
    search?: string;
    labels?: string;
    order_by?: string;
    sort?: string;
  }): Promise<GitLabEpic[]> {
    return this.graphqlPaginate(
      Q_EPICS,
      {
        fullPath: groupId,
        state: params?.state && params.state !== "all" ? params.state : null,
        search: params?.search ?? null,
        labelName: params?.labels ? params.labels.split(",").map(s => s.trim()) : null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.epics,
      mapEpic,
    );
  }

  async getEpic(groupId: string, epicIid: number): Promise<GitLabEpic> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_EPIC, { fullPath: groupId, iid: String(epicIid) });
    if (!data.group?.epic) throw new Error(`Epic #${epicIid} not found in group ${groupId}`);
    return mapEpic(data.group.epic);
  }

  async createEpic(groupId: string, data: {
    title: string;
    description?: string;
    labels?: string;
    start_date?: string;
    due_date?: string;
  }): Promise<GitLabEpic> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      groupPath: groupId,
      title: data.title,
    };
    if (data.description) input.description = data.description;
    if (data.labels) input.addLabelIds = data.labels.split(",").map(s => s.trim());
    if (data.start_date) input.startDateFixed = data.start_date;
    if (data.due_date) input.dueDateFixed = data.due_date;

    const result = await this.mutate(M_CREATE_EPIC, input, "createEpic");
    return mapEpic(result.epic);
  }

  async updateEpic(
    groupId: string,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      groupPath: groupId,
      iid: String(epicIid),
    };
    if (data.title) input.title = data.title;
    if (data.description) input.description = data.description;
    if (data.labels) input.addLabelIds = data.labels.split(",").map(s => s.trim());
    if (data.start_date) input.startDateFixed = data.start_date;
    if (data.due_date) input.dueDateFixed = data.due_date;
    if (data.state_event === "close") input.stateEvent = "CLOSE";

    const result = await this.mutate(M_UPDATE_EPIC, input, "updateEpic");
    return mapEpic(result.epic);
  }

  async closeEpic(groupId: string, epicIid: number): Promise<GitLabEpic> {
    return this.updateEpic(groupId, epicIid, { state_event: "close" });
  }

  async listEpicIssues(groupId: string, epicIid: number): Promise<GitLabIssue[]> {
    return this.graphqlPaginate(
      Q_EPIC_ISSUES,
      { fullPath: groupId, epicIid: String(epicIid) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.epic?.issues,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (n: any) => mapIssue(n, this.baseUrl),
    );
  }

  async addIssueToEpic(
    groupId: string,
    epicIid: number,
    issueId: number,
  ): Promise<{ id: number; epic: GitLabEpic; issue: GitLabIssue }> {
    const epic = await this.getEpic(groupId, epicIid);
    const input = {
      iid: String(epicIid),
      groupPath: groupId,
      issueIid: String(issueId),
    };
    await this.mutate(M_EPIC_ADD_ISSUE, input, "epicAddIssue");
    return { id: 0, epic, issue: {} as GitLabIssue };
  }

  async listEpicNotes(groupId: string, epicIid: number): Promise<GitLabNote[]> {
    return this.graphqlPaginate(
      Q_EPIC_NOTES,
      { fullPath: groupId, epicIid: String(epicIid) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.epic?.notes,
      mapNote,
    );
  }

  async addEpicNote(groupId: string, epicIid: number, body: string): Promise<GitLabNote> {
    const epic = await this.getEpic(groupId, epicIid);
    const noteableId = toGid("Epic", epic.id);
    const result = await this.mutate(M_CREATE_NOTE, { noteableId, body }, "createNote");
    return mapNote(result.note);
  }

  // ---------------------------------------------------------------------------
  // Work Items (epic widgets: milestone, health status, progress, linked items)
  // ---------------------------------------------------------------------------

  private async resolveEpicGid(groupId: string, epicIid: number): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_WORK_ITEM_ID, { fullPath: groupId, iid: String(epicIid) });
    const gid = data.group?.epic?.id;
    if (!gid) throw new Error(`Epic #${epicIid} not found in group ${groupId}`);
    return gid;
  }

  private async resolveIssueGid(projectId: number, issueIid: number): Promise<string> {
    const projectPath = await this.resolveProjectPath(projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_ISSUE_WORK_ITEM_ID, { projectPath, iid: String(issueIid) });
    const gid = data.project?.issue?.id;
    if (!gid) throw new Error(`Issue #${issueIid} not found in project ${projectId}`);
    return gid;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getEpicWidgets(groupId: string, epicIid: number): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_WORK_ITEM_WIDGETS, { fullPath: groupId, iid: String(epicIid) });
    if (!data.group?.epic) throw new Error(`Epic #${epicIid} not found in group ${groupId}`);
    return data.group.epic;
  }

  async setEpicMilestone(groupId: string, epicIid: number, milestoneId: number | null): Promise<void> {
    const epicGid = await this.resolveEpicGid(groupId, epicIid);
    await this.mutate(M_WORK_ITEM_UPDATE, {
      id: epicGid,
      milestoneWidget: { milestoneId: milestoneId ? toGid("Milestone", milestoneId) : null },
    }, "workItemUpdate");
  }

  async setHealthStatus(
    target: { type: "epic"; groupId: string; epicIid: number } | { type: "issue"; projectId: number; issueIid: number },
    healthStatus: string | null,
  ): Promise<void> {
    const gid = target.type === "epic"
      ? await this.resolveEpicGid(target.groupId, target.epicIid)
      : await this.resolveIssueGid(target.projectId, target.issueIid);
    await this.mutate(M_WORK_ITEM_UPDATE, {
      id: gid,
      healthStatusWidget: { healthStatus: healthStatus?.toUpperCase() ?? null },
    }, "workItemUpdate");
  }

  async setEpicIteration(groupId: string, epicIid: number, iterationId: number | null): Promise<void> {
    const epicGid = await this.resolveEpicGid(groupId, epicIid);
    await this.mutate(M_WORK_ITEM_UPDATE, {
      id: epicGid,
      iterationWidget: { iterationId: iterationId ? toGid("Iteration", iterationId) : null },
    }, "workItemUpdate");
  }

  async addLinkedItem(
    sourceTarget: { type: "epic"; groupId: string; epicIid: number } | { type: "issue"; projectId: number; issueIid: number },
    linkedGid: string,
    linkType: string,
  ): Promise<void> {
    const sourceGid = sourceTarget.type === "epic"
      ? await this.resolveEpicGid(sourceTarget.groupId, sourceTarget.epicIid)
      : await this.resolveIssueGid(sourceTarget.projectId, sourceTarget.issueIid);
    await this.mutate(M_WORK_ITEM_ADD_LINKED, {
      id: sourceGid,
      workItemsIds: [linkedGid],
      linkType: linkType.toUpperCase(),
    }, "workItemAddLinkedItems");
  }

  // ---------------------------------------------------------------------------
  // Issues
  // ---------------------------------------------------------------------------

  async listGroupIssues(groupId: string, params?: {
    state?: string;
    search?: string;
    labels?: string;
    milestone?: string;
    assignee_username?: string;
    order_by?: string;
    sort?: string;
  }): Promise<GitLabIssue[]> {
    return this.graphqlPaginate(
      Q_GROUP_ISSUES,
      {
        fullPath: groupId,
        state: params?.state && params.state !== "all" ? params.state : null,
        search: params?.search ?? null,
        labelName: params?.labels ? params.labels.split(",").map(s => s.trim()) : null,
        milestoneTitle: params?.milestone ? [params.milestone] : null,
        assigneeUsernames: params?.assignee_username ? [params.assignee_username] : null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.issues,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (n: any) => mapIssue(n, this.baseUrl),
    );
  }

  async getIssue(projectId: number, issueIid: number): Promise<GitLabIssue> {
    const projectPath = await this.resolveProjectPath(projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_ISSUE, { projectPath, iid: String(issueIid) });
    if (!data.project?.issue) throw new Error(`Issue #${issueIid} not found in project ${projectId}`);
    return mapIssue(data.project.issue, this.baseUrl);
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
    const projectPath = await this.resolveProjectPath(projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      projectPath,
      title: data.title,
    };
    if (data.description) input.description = data.description;
    if (data.labels) input.labels = data.labels.split(",").map(s => s.trim());
    if (data.milestone_id) input.milestoneId = toGid("Milestone", data.milestone_id);
    if (data.assignee_ids) input.assigneeIds = data.assignee_ids.map(id => toGid("User", id));
    if (data.due_date) input.dueDate = data.due_date;
    if (data.weight != null) input.weight = data.weight;
    if (data.epic_id) input.epicId = toGid("Epic", data.epic_id);
    if (data.iteration_id) input.iterationId = toGid("Iteration", data.iteration_id);

    const result = await this.mutate(M_CREATE_ISSUE, input, "createIssue");
    return mapIssue(result.issue, this.baseUrl);
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
    const projectPath = await this.resolveProjectPath(projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      projectPath,
      iid: String(issueIid),
    };
    if (data.title) input.title = data.title;
    if (data.description) input.description = data.description;
    if (data.labels) input.labels = data.labels.split(",").map(s => s.trim());
    if (data.milestone_id) input.milestoneId = toGid("Milestone", data.milestone_id);
    if (data.assignee_ids) input.assigneeIds = data.assignee_ids.map(id => toGid("User", id));
    if (data.due_date) input.dueDate = data.due_date;
    if (data.weight != null) input.weight = data.weight;
    if (data.state_event === "close") input.stateEvent = "CLOSE";
    if (data.iteration_id) input.iterationId = toGid("Iteration", data.iteration_id);

    const result = await this.mutate(M_UPDATE_ISSUE, input, "updateIssue");
    return mapIssue(result.issue, this.baseUrl);
  }

  async closeIssue(projectId: number, issueIid: number): Promise<GitLabIssue> {
    return this.updateIssue(projectId, issueIid, { state_event: "close" });
  }

  async listIssueNotes(projectId: number, issueIid: number): Promise<GitLabNote[]> {
    const projectPath = await this.resolveProjectPath(projectId);
    return this.graphqlPaginate(
      Q_ISSUE_NOTES,
      { projectPath, issueIid: String(issueIid) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.project?.issue?.notes,
      mapNote,
    );
  }

  async addIssueNote(projectId: number, issueIid: number, body: string): Promise<GitLabNote> {
    const issue = await this.getIssue(projectId, issueIid);
    const noteableId = toGid("Issue", issue.id);
    const result = await this.mutate(M_CREATE_NOTE, { noteableId, body }, "createNote");
    return mapNote(result.note);
  }

  // ---------------------------------------------------------------------------
  // Merge Requests
  // ---------------------------------------------------------------------------

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
    return this.graphqlPaginate(
      Q_MERGE_REQUESTS,
      {
        fullPath: groupId,
        state: params?.state && params.state !== "all" ? params.state : null,
        labels: params?.labels ? params.labels.split(",").map(s => s.trim()) : null,
        milestoneTitle: params?.milestone ?? null,
        authorUsername: params?.author_username ?? null,
        reviewerUsername: params?.reviewer_username ?? null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.mergeRequests,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (n: any) => mapMergeRequest(n, this.baseUrl),
    );
  }

  async getMergeRequest(projectId: number, mrIid: number): Promise<GitLabMergeRequest> {
    const projectPath = await this.resolveProjectPath(projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_MERGE_REQUEST, { projectPath, iid: String(mrIid) });
    if (!data.project?.mergeRequest) throw new Error(`MR !${mrIid} not found in project ${projectId}`);
    return mapMergeRequest(data.project.mergeRequest, this.baseUrl);
  }

  // ---------------------------------------------------------------------------
  // Milestones
  // ---------------------------------------------------------------------------

  async listGroupMilestones(groupId: string, params?: {
    state?: string;
    search?: string;
  }): Promise<GitLabMilestone[]> {
    return this.graphqlPaginate(
      Q_MILESTONES,
      {
        fullPath: groupId,
        state: params?.state ?? null,
        searchTitle: params?.search ?? null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.milestones,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (n: any) => mapMilestone(n, this.baseUrl),
    );
  }

  async getMilestone(groupId: string, milestoneId: number): Promise<GitLabMilestone> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_MILESTONE, {
      fullPath: groupId,
      ids: [toGid("Milestone", milestoneId)],
    });
    const node = data.group?.milestones?.nodes?.[0];
    if (!node) throw new Error(`Milestone ${milestoneId} not found in group ${groupId}`);
    return mapMilestone(node, this.baseUrl);
  }

  async createMilestone(groupId: string, data: {
    title: string;
    description?: string;
    start_date?: string;
    due_date?: string;
  }): Promise<GitLabMilestone> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      groupPath: groupId,
      title: data.title,
    };
    if (data.description) input.description = data.description;
    if (data.start_date) input.startDate = data.start_date;
    if (data.due_date) input.dueDate = data.due_date;

    const result = await this.mutate(M_CREATE_MILESTONE, input, "createMilestone");
    return mapMilestone(result.milestone, this.baseUrl);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      id: toGid("Milestone", milestoneId),
    };
    if (data.title) input.title = data.title;
    if (data.description) input.description = data.description;
    if (data.start_date) input.startDate = data.start_date;
    if (data.due_date) input.dueDate = data.due_date;
    if (data.state_event === "close") input.stateEvent = "CLOSE";

    const result = await this.mutate(M_UPDATE_MILESTONE, input, "updateMilestone");
    return mapMilestone(result.milestone, this.baseUrl);
  }

  async closeMilestone(groupId: string, milestoneId: number): Promise<GitLabMilestone> {
    return this.updateMilestone(groupId, milestoneId, { state_event: "close" });
  }

  // ---------------------------------------------------------------------------
  // Iterations
  // ---------------------------------------------------------------------------

  async listGroupIterations(groupId: string, params?: {
    state?: string;
    search?: string;
  }): Promise<GitLabIteration[]> {
    return this.graphqlPaginate(
      Q_ITERATIONS,
      {
        fullPath: groupId,
        state: params?.state ?? null,
        search: params?.search ?? null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.iterations,
      mapIteration,
    );
  }

  // ---------------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------------

  async listProjects(groupId: string, params?: {
    search?: string;
    archived?: string;
  }): Promise<GitLabProject[]> {
    return this.graphqlPaginate(
      Q_PROJECTS,
      {
        fullPath: groupId,
        search: params?.search ?? null,
        includeSubgroups: true,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.projects,
      mapProject,
    );
  }

  async listGroupMembers(groupId: string, params?: {
    search?: string;
  }): Promise<GitLabMember[]> {
    return this.graphqlPaginate(
      Q_MEMBERS,
      { fullPath: groupId, search: params?.search ?? null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.groupMembers,
      mapMember,
    );
  }

  async listGroupLabels(groupId: string, params?: {
    search?: string;
  }): Promise<GitLabLabel[]> {
    return this.graphqlPaginate(
      Q_LABELS,
      { fullPath: groupId, searchTerm: params?.search ?? null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.labels,
      mapLabel,
    );
  }

  async listGroupBoards(groupId: string): Promise<GitLabBoard[]> {
    return this.graphqlPaginate(
      Q_BOARDS,
      { fullPath: groupId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.group?.boards,
      mapBoard,
    );
  }

  async getCurrentUser(): Promise<GitLabUser> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_CURRENT_USER);
    if (!data.currentUser) throw new Error("Authentification echouee. Verifiez votre GITLAB_TOKEN.");
    return mapUser(data.currentUser);
  }
}
