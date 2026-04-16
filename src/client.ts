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
  Q_EPIC_WORK_ITEM_ID, Q_WORK_ITEM_WIDGETS, Q_ISSUE_WORK_ITEM_ID,
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
    const data = await this.graphql<any>(Q_PROJECT_PATH, { ids: [toGid("Project", projectId)] });
    const fullPath = data.projects?.nodes?.[0]?.fullPath;
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
    if (data.labels) input.addLabels = data.labels.split(",").map(s => s.trim());
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
      add_labels?: string;
      remove_labels?: string;
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
    if (data.add_labels) input.addLabels = data.add_labels.split(",").map(s => s.trim());
    if (data.remove_labels) input.removeLabels = data.remove_labels.split(",").map(s => s.trim());
    if (data.start_date) input.startDateFixed = data.start_date;
    if (data.due_date) input.dueDateFixed = data.due_date;
    if (data.state_event === "close") input.stateEvent = "CLOSE";
    if (data.state_event === "reopen") input.stateEvent = "REOPEN";

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
    projectId: number,
    issueIid: number,
  ): Promise<void> {
    const projectPath = await this.resolveProjectPath(projectId);
    const input = {
      iid: String(epicIid),
      groupPath: groupId,
      projectPath,
      issueIid: String(issueIid),
    };
    await this.mutate(M_EPIC_ADD_ISSUE, input, "epicAddIssue");
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

  private async resolveEpicWorkItemGid(groupId: string, epicIid: number): Promise<string> {
    // Epic GID (gid://gitlab/Epic/N) != WorkItem GID (gid://gitlab/WorkItem/N)
    // Work Items API needs the WorkItem GID, found via group.workItems(types: EPIC)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_EPIC_WORK_ITEM_ID, { fullPath: groupId, iid: String(epicIid) });
    const gid = data.group?.workItems?.nodes?.[0]?.id;
    if (!gid) throw new Error(`WorkItem for epic #${epicIid} not found in group ${groupId}`);
    return gid;
  }

  private async resolveIssueWorkItemGid(projectId: number, issueIid: number): Promise<string> {
    const projectPath = await this.resolveProjectPath(projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_ISSUE_WORK_ITEM_ID, { projectPath, iid: String(issueIid) });
    const issueGid = data.project?.issue?.id;
    if (!issueGid) throw new Error(`Issue #${issueIid} not found in project ${projectId}`);
    // Convert gid://gitlab/Issue/N to gid://gitlab/WorkItem/N
    const numericId = issueGid.split("/").pop();
    return `gid://gitlab/WorkItem/${numericId}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getEpicWidgets(groupId: string, epicIid: number): Promise<any> {
    const epicGid = await this.resolveEpicWorkItemGid(groupId, epicIid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_WORK_ITEM_WIDGETS, { id: epicGid });
    if (!data.workItem) throw new Error(`WorkItem for epic #${epicIid} not found`);
    return data.workItem;
  }

  async setEpicMilestone(groupId: string, epicIid: number, milestoneId: number | null): Promise<void> {
    const epicGid = await this.resolveEpicWorkItemGid(groupId, epicIid);
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
      ? await this.resolveEpicWorkItemGid(target.groupId, target.epicIid)
      : await this.resolveIssueWorkItemGid(target.projectId, target.issueIid);
    await this.mutate(M_WORK_ITEM_UPDATE, {
      id: gid,
      healthStatusWidget: { healthStatus: healthStatus ?? null },
    }, "workItemUpdate");
  }

  async setEpicIteration(groupId: string, epicIid: number, iterationId: number | null): Promise<void> {
    const epicGid = await this.resolveEpicWorkItemGid(groupId, epicIid);
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
      ? await this.resolveEpicWorkItemGid(sourceTarget.groupId, sourceTarget.epicIid)
      : await this.resolveIssueWorkItemGid(sourceTarget.projectId, sourceTarget.issueIid);
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
      add_labels?: string;
      remove_labels?: string;
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
    if (data.milestone_id) input.milestoneId = toGid("Milestone", data.milestone_id);
    if (data.assignee_ids) input.assigneeIds = data.assignee_ids.map(id => toGid("User", id));
    if (data.due_date) input.dueDate = data.due_date;
    if (data.weight != null) input.weight = data.weight;
    if (data.state_event === "close") input.stateEvent = "CLOSE";
    if (data.state_event === "reopen") input.stateEvent = "REOPEN";
    if (data.iteration_id) input.iterationId = toGid("Iteration", data.iteration_id);

    const result = await this.mutate(M_UPDATE_ISSUE, input, "updateIssue");
    const issue = mapIssue(result.issue, this.baseUrl);

    // add/remove labels via REST (not supported in GraphQL UpdateIssueInput)
    if (data.add_labels || data.remove_labels) {
      const restUrl = new URL(`/api/v4/projects/${projectId}/issues/${issueIid}`, this.baseUrl);
      const restBody: Record<string, string> = {};
      if (data.add_labels) restBody["add_labels"] = data.add_labels;
      if (data.remove_labels) restBody["remove_labels"] = data.remove_labels;
      const restResp = await fetch(restUrl.toString(), {
        method: "PUT",
        headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
        body: JSON.stringify(restBody),
        signal: AbortSignal.timeout(15_000),
      });
      if (!restResp.ok) {
        const text = await restResp.text().catch(() => "");
        throw new Error(`Label update failed: ${text.slice(0, 200)}`);
      }
      return (await restResp.json()) as GitLabIssue;
    }
    return issue;
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

  async createMergeRequest(projectId: number, data: {
    source_branch: string;
    target_branch: string;
    title: string;
    description?: string;
    labels?: string;
    assignee_ids?: number[];
    reviewer_ids?: number[];
    milestone_id?: number;
  }): Promise<GitLabMergeRequest> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/projects/${projectId}/merge_requests`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabMergeRequest;
  }

  async updateMergeRequest(projectId: number, mrIid: number, data: {
    title?: string;
    description?: string;
    add_labels?: string;
    remove_labels?: string;
    assignee_ids?: number[];
    reviewer_ids?: number[];
    milestone_id?: number;
    target_branch?: string;
  }): Promise<GitLabMergeRequest> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/projects/${projectId}/merge_requests/${mrIid}`, this.baseUrl);
    const body: Record<string, unknown> = {};
    if (data.title) body.title = data.title;
    if (data.description) body.description = data.description;
    if (data.add_labels) body.add_labels = data.add_labels;
    if (data.remove_labels) body.remove_labels = data.remove_labels;
    if (data.assignee_ids) body.assignee_ids = data.assignee_ids;
    if (data.reviewer_ids) body.reviewer_ids = data.reviewer_ids;
    if (data.milestone_id) body.milestone_id = data.milestone_id;
    if (data.target_branch) body.target_branch = data.target_branch;
    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabMergeRequest;
  }

  async mergeMergeRequest(projectId: number, mrIid: number, params?: {
    merge_commit_message?: string;
    squash?: boolean;
    should_remove_source_branch?: boolean;
  }): Promise<GitLabMergeRequest> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/merge`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabMergeRequest;
  }

  async approveMergeRequest(projectId: number, mrIid: number): Promise<void> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/approve`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
  }

  async listMRNotes(projectId: number, mrIid: number): Promise<GitLabNote[]> {
    const projectPath = await this.resolveProjectPath(projectId);
    const query = Q_ISSUE_NOTES
      .replace("$issueIid: String!", "$mrIid: String!")
      .replace("issue(iid: $issueIid)", "mergeRequest(iid: $mrIid)")
      .replace("issue {", "mergeRequest {");
    return this.graphqlPaginate(
      query,
      { projectPath, mrIid: String(mrIid) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.project?.mergeRequest?.notes,
      mapNote,
    );
  }

  async addMRNote(projectId: number, mrIid: number, body: string): Promise<GitLabNote> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    // REST — simpler than resolving MR GID for createNote mutation
    const url = new URL(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabNote;
  }

  async getMRDiff(projectId: number, mrIid: number): Promise<{ old_path: string; new_path: string; additions: number; deletions: number }[]> {
    // REST — diffStats not easily available via GraphQL
    const url = new URL(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/changes`, this.baseUrl);
    url.searchParams.set("access_raw_diffs", "false");
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.changes ?? []).map((c: any) => ({
      old_path: c.old_path,
      new_path: c.new_path,
      additions: (c.diff?.match(/^\+/gm)?.length ?? 0),
      deletions: (c.diff?.match(/^-/gm)?.length ?? 0),
    }));
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
    // REST fallback — GraphQL milestones(ids:) has type mismatch bugs on GitLab 18.x
    const url = new URL(`/api/v4/groups/${encodeURIComponent(groupId)}/milestones/${milestoneId}`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Milestone ${milestoneId} not found in group ${groupId}`);
    }
    return (await response.json()) as GitLabMilestone;
  }

  async createMilestone(groupId: string, data: {
    title: string;
    description?: string;
    start_date?: string;
    due_date?: string;
  }): Promise<GitLabMilestone> {
    // GraphQL createMilestone has a "Timeout on validation" bug on GitLab 18.x
    // Fallback to REST API which works reliably
    if (this.readOnly) {
      throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true). Impossible d'effectuer une mutation.");
    }
    const url = new URL(`/api/v4/groups/${encodeURIComponent(groupId)}/milestones`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabMilestone;
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
    // GraphQL updateMilestone has bugs on GitLab 18.x — fallback to REST
    if (this.readOnly) {
      throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true). Impossible d'effectuer une mutation.");
    }
    const url = new URL(`/api/v4/groups/${encodeURIComponent(groupId)}/milestones/${milestoneId}`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabMilestone;
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
  // CI/CD Pipelines
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async listPipelines(projectId: number, params?: { ref?: string; status?: string }): Promise<any[]> {
    const url = new URL(`/api/v4/projects/${projectId}/pipelines`, this.baseUrl);
    url.searchParams.set("per_page", "20");
    if (params?.ref) url.searchParams.set("ref", params.ref);
    if (params?.status) url.searchParams.set("status", params.status);
    const response = await fetch(url.toString(), {
      method: "GET", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitLab ${response.status}`);
    return (await response.json()) as unknown[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getPipeline(projectId: number, pipelineId: number): Promise<any> {
    const url = new URL(`/api/v4/projects/${projectId}/pipelines/${pipelineId}`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "GET", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Pipeline ${pipelineId} not found`);
    return await response.json();
  }

  async getJobLog(projectId: number, jobId: number): Promise<string> {
    const url = new URL(`/api/v4/projects/${projectId}/jobs/${jobId}/trace`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "GET", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Job ${jobId} log not found`);
    return await response.text();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async retryPipeline(projectId: number, pipelineId: number): Promise<any> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/projects/${projectId}/pipelines/${pipelineId}/retry`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) { const t = await response.text().catch(() => ""); throw new Error(`GitLab ${response.status}: ${t.slice(0, 200)}`); }
    return await response.json();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async cancelPipeline(projectId: number, pipelineId: number): Promise<any> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/projects/${projectId}/pipelines/${pipelineId}/cancel`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) { const t = await response.text().catch(() => ""); throw new Error(`GitLab ${response.status}: ${t.slice(0, 200)}`); }
    return await response.json();
  }

  // ---------------------------------------------------------------------------
  // Branches & Repository
  // ---------------------------------------------------------------------------

  async listBranches(projectId: number, params?: { search?: string }): Promise<{ name: string; default: boolean; web_url: string }[]> {
    const url = new URL(`/api/v4/projects/${projectId}/repository/branches`, this.baseUrl);
    url.searchParams.set("per_page", "100");
    if (params?.search) url.searchParams.set("search", params.search);
    const response = await fetch(url.toString(), {
      method: "GET", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitLab ${response.status}`);
    return (await response.json()) as { name: string; default: boolean; web_url: string }[];
  }

  async createBranch(projectId: number, name: string, ref: string): Promise<{ name: string; web_url: string }> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/projects/${projectId}/repository/branches`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST", headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify({ branch: name, ref }), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) { const t = await response.text().catch(() => ""); throw new Error(`GitLab ${response.status}: ${t.slice(0, 200)}`); }
    return (await response.json()) as { name: string; web_url: string };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async listRepositoryTree(projectId: number, params?: { path?: string; ref?: string }): Promise<any[]> {
    const url = new URL(`/api/v4/projects/${projectId}/repository/tree`, this.baseUrl);
    url.searchParams.set("per_page", "100");
    if (params?.path) url.searchParams.set("path", params.path);
    if (params?.ref) url.searchParams.set("ref", params.ref);
    const response = await fetch(url.toString(), {
      method: "GET", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitLab ${response.status}`);
    return (await response.json()) as unknown[];
  }

  async getFile(projectId: number, filePath: string, ref?: string): Promise<{ content: string; file_name: string; file_path: string; size: number }> {
    const url = new URL(`/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`, this.baseUrl);
    if (ref) url.searchParams.set("ref", ref);
    else url.searchParams.set("ref", "main");
    const response = await fetch(url.toString(), {
      method: "GET", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`File ${filePath} not found`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    return { content: Buffer.from(data.content, "base64").toString("utf-8"), file_name: data.file_name, file_path: data.file_path, size: data.size };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async listCommits(projectId: number, params?: { ref?: string; path?: string }): Promise<any[]> {
    const url = new URL(`/api/v4/projects/${projectId}/repository/commits`, this.baseUrl);
    url.searchParams.set("per_page", "20");
    if (params?.ref) url.searchParams.set("ref_name", params.ref);
    if (params?.path) url.searchParams.set("path", params.path);
    const response = await fetch(url.toString(), {
      method: "GET", headers: { "PRIVATE-TOKEN": this.token }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitLab ${response.status}`);
    return (await response.json()) as unknown[];
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

  async createLabel(groupId: string, data: {
    name: string;
    color: string;
    description?: string;
  }): Promise<GitLabLabel> {
    // REST — GraphQL labelCreate has issues on some GitLab versions
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/groups/${encodeURIComponent(groupId)}/labels`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabLabel;
  }

  async updateLabel(groupId: string, labelId: number, data: {
    new_name?: string;
    color?: string;
    description?: string;
  }): Promise<GitLabLabel> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/groups/${encodeURIComponent(groupId)}/labels/${labelId}`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as GitLabLabel;
  }

  async deleteLabel(groupId: string, labelId: number): Promise<void> {
    if (this.readOnly) throw new Error("Mode lecture seule actif (GITLAB_READ_ONLY=true).");
    const url = new URL(`/api/v4/groups/${encodeURIComponent(groupId)}/labels/${labelId}`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: { "PRIVATE-TOKEN": this.token },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 204) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitLab ${response.status}: ${text.slice(0, 200)}`);
    }
  }

  async listProjectIssues(projectId: number, params?: {
    state?: string;
    search?: string;
    labels?: string;
    milestone?: string;
    assignee_username?: string;
  }): Promise<GitLabIssue[]> {
    const projectPath = await this.resolveProjectPath(projectId);
    return this.graphqlPaginate(
      Q_GROUP_ISSUES.replace("group(fullPath:", "project(fullPath:").replace("group {", "project {"),
      {
        fullPath: projectPath,
        state: params?.state && params.state !== "all" ? params.state : null,
        search: params?.search ?? null,
        labelName: params?.labels ? params.labels.split(",").map(s => s.trim()) : null,
        milestoneTitle: params?.milestone ? [params.milestone] : null,
        assigneeUsernames: params?.assignee_username ? [params.assignee_username] : null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.project?.issues,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (n: any) => mapIssue(n, this.baseUrl),
    );
  }

  async searchUsers(query: string): Promise<GitLabUser[]> {
    // REST — no good GraphQL equivalent for global user search
    const url = new URL("/api/v4/users", this.baseUrl);
    url.searchParams.set("search", query);
    url.searchParams.set("per_page", "20");
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`GitLab ${response.status}: user search failed`);
    }
    return (await response.json()) as GitLabUser[];
  }

  async reopenIssue(projectId: number, issueIid: number): Promise<GitLabIssue> {
    return this.updateIssue(projectId, issueIid, { state_event: "reopen" });
  }

  async reopenEpic(groupId: string, epicIid: number): Promise<GitLabEpic> {
    return this.updateEpic(groupId, epicIid, { state_event: "reopen" });
  }

  async getCurrentUser(): Promise<GitLabUser> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.graphql<any>(Q_CURRENT_USER);
    if (!data.currentUser) throw new Error("Authentification echouee. Verifiez votre GITLAB_TOKEN.");
    return mapUser(data.currentUser);
  }
}
