import type {
  GitLabUser, GitLabGroup, GitLabEpic, GitLabIssue, GitLabMilestone,
  GitLabMergeRequest, GitLabProject, GitLabMember, GitLabLabel,
  GitLabNote, GitLabBoard, GitLabBoardList, GitLabIteration, GitLabTimeStats,
} from "./types.js";

// ---------------------------------------------------------------------------
// GID helpers
// ---------------------------------------------------------------------------

export function toGid(type: string, id: number): string {
  return `gid://gitlab/${type}/${id}`;
}

export function fromGid(gid: string): number {
  const parts = gid.split("/");
  return parseInt(parts[parts.length - 1]!, 10);
}

// ---------------------------------------------------------------------------
// GraphQL types
// ---------------------------------------------------------------------------

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Connection<T> {
  pageInfo: PageInfo;
  nodes: T[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConnectionExtractor<T> = (data: any) => Connection<T>;

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

export const USER_FRAGMENT = `
  fragment UserF on User {
    id username name state avatarUrl webUrl
  }
`;

export const MILESTONE_FRAGMENT = `
  fragment MilestoneF on Milestone {
    id iid title description state webPath dueDate startDate
    createdAt updatedAt expired
  }
`;

export const LABEL_FRAGMENT = `
  fragment LabelF on Label {
    id title color textColor description
  }
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const Q_CURRENT_USER = `query { currentUser { id username name state avatarUrl webUrl } }`;

export const Q_GROUPS = `
  query($search: String, $after: String) {
    groups(search: $search, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name fullPath webUrl description parent { id } }
    }
  }
`;

export const Q_EPICS = `
  ${USER_FRAGMENT}
  query($fullPath: ID!, $state: EpicState, $search: String, $labelName: [String!], $after: String) {
    group(fullPath: $fullPath) {
      epics(state: $state, search: $search, labelName: $labelName, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id iid title description state webUrl
          labels { nodes { title } }
          startDate dueDate createdAt updatedAt closedAt
          author { ...UserF } upvotes downvotes
          group { id }
        }
      }
    }
  }
`;

export const Q_EPIC = `
  ${USER_FRAGMENT}
  query($fullPath: ID!, $iid: ID!) {
    group(fullPath: $fullPath) {
      epic(iid: $iid) {
        id iid title description state webUrl
        labels { nodes { title } }
        startDate dueDate createdAt updatedAt closedAt
        author { ...UserF } upvotes downvotes
        group { id }
      }
    }
  }
`;

export const Q_EPIC_ISSUES = `
  ${USER_FRAGMENT}
  ${MILESTONE_FRAGMENT}
  query($fullPath: ID!, $epicIid: ID!, $after: String) {
    group(fullPath: $fullPath) {
      epic(iid: $epicIid) {
        issues(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id iid title description state webUrl
            labels { nodes { title } }
            milestone { ...MilestoneF }
            assignees { nodes { ...UserF } }
            author { ...UserF }
            dueDate createdAt updatedAt closedAt
            weight
            epic { iid }
            projectId
            timeEstimate totalTimeSpent humanTimeEstimate humanTotalTimeSpent
          }
        }
      }
    }
  }
`;

export const Q_EPIC_NOTES = `
  ${USER_FRAGMENT}
  query($fullPath: ID!, $epicIid: ID!, $after: String) {
    group(fullPath: $fullPath) {
      epic(iid: $epicIid) {
        notes(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id body author { ...UserF } createdAt updatedAt system }
        }
      }
    }
  }
`;

export const Q_GROUP_ISSUES = `
  ${USER_FRAGMENT}
  ${MILESTONE_FRAGMENT}
  query($fullPath: ID!, $state: IssuableState, $search: String, $labelName: [String!],
        $milestoneTitle: [String!], $assigneeUsernames: [String!], $after: String) {
    group(fullPath: $fullPath) {
      issues(state: $state, search: $search, labelName: $labelName,
             milestoneTitle: $milestoneTitle, assigneeUsernames: $assigneeUsernames,
             first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id iid title description state webUrl
          labels { nodes { title } }
          milestone { ...MilestoneF }
          assignees { nodes { ...UserF } }
          author { ...UserF }
          dueDate createdAt updatedAt closedAt
          weight
          epic { iid }
          projectId
          timeEstimate totalTimeSpent humanTimeEstimate humanTotalTimeSpent
        }
      }
    }
  }
`;

export const Q_ISSUE = `
  ${USER_FRAGMENT}
  ${MILESTONE_FRAGMENT}
  query($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      issue(iid: $iid) {
        id iid title description state webUrl
        labels { nodes { title } }
        milestone { ...MilestoneF }
        assignees { nodes { ...UserF } }
        author { ...UserF }
        dueDate createdAt updatedAt closedAt
        weight
        epic { iid }
        projectId
        timeEstimate totalTimeSpent humanTimeEstimate humanTotalTimeSpent
      }
    }
  }
`;

export const Q_ISSUE_NOTES = `
  ${USER_FRAGMENT}
  query($projectPath: ID!, $issueIid: String!, $after: String) {
    project(fullPath: $projectPath) {
      issue(iid: $issueIid) {
        notes(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id body author { ...UserF } createdAt updatedAt system }
        }
      }
    }
  }
`;

export const Q_MILESTONES = `
  ${MILESTONE_FRAGMENT}
  query($fullPath: ID!, $state: MilestoneStateEnum, $searchTitle: String, $after: String) {
    group(fullPath: $fullPath) {
      milestones(state: $state, searchTitle: $searchTitle, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...MilestoneF }
      }
    }
  }
`;

export const Q_MILESTONE = `
  ${MILESTONE_FRAGMENT}
  query($fullPath: ID!, $ids: [MilestoneID!]) {
    group(fullPath: $fullPath) {
      milestones(ids: $ids) {
        nodes { ...MilestoneF }
      }
    }
  }
`;

export const Q_MERGE_REQUESTS = `
  ${USER_FRAGMENT}
  ${MILESTONE_FRAGMENT}
  query($fullPath: ID!, $state: MergeRequestState, $labels: [String!],
        $milestoneTitle: String, $authorUsername: String, $reviewerUsername: String, $after: String) {
    group(fullPath: $fullPath) {
      mergeRequests(state: $state, labels: $labels, milestoneTitle: $milestoneTitle,
                    authorUsername: $authorUsername, reviewerUsername: $reviewerUsername,
                    first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id iid title description state webUrl
          sourceBranch targetBranch
          labels { nodes { title } }
          milestone { ...MilestoneF }
          author { ...UserF }
          assignees { nodes { ...UserF } }
          reviewers { nodes { ...UserF } }
          draft mergeStatusEnum conflicts
          createdAt updatedAt mergedAt closedAt
          projectId
        }
      }
    }
  }
`;

export const Q_MERGE_REQUEST = `
  ${USER_FRAGMENT}
  ${MILESTONE_FRAGMENT}
  query($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      mergeRequest(iid: $iid) {
        id iid title description state webUrl
        sourceBranch targetBranch
        labels { nodes { title } }
        milestone { ...MilestoneF }
        author { ...UserF }
        assignees { nodes { ...UserF } }
        reviewers { nodes { ...UserF } }
        draft mergeStatusEnum conflicts
        createdAt updatedAt mergedAt closedAt
        projectId
      }
    }
  }
`;

export const Q_ITERATIONS = `
  query($fullPath: ID!, $state: IterationState, $search: String, $after: String) {
    group(fullPath: $fullPath) {
      iterations(state: $state, search: $search, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id iid title description state webUrl startDate dueDate createdAt updatedAt }
      }
    }
  }
`;

export const Q_PROJECTS = `
  query($fullPath: ID!, $search: String, $includeSubgroups: Boolean, $after: String) {
    group(fullPath: $fullPath) {
      projects(search: $search, includeSubgroups: $includeSubgroups, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id name nameWithNamespace path fullPath webUrl description
          archived
        }
      }
    }
  }
`;

export const Q_MEMBERS = `
  query($fullPath: ID!, $search: String, $after: String) {
    group(fullPath: $fullPath) {
      groupMembers(search: $search, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          user { id username name state webUrl }
          accessLevel { integerValue }
        }
      }
    }
  }
`;

export const Q_LABELS = `
  ${LABEL_FRAGMENT}
  query($fullPath: ID!, $searchTerm: String, $after: String) {
    group(fullPath: $fullPath) {
      labels(searchTerm: $searchTerm, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...LabelF }
      }
    }
  }
`;

export const Q_BOARDS = `
  ${LABEL_FRAGMENT}
  query($fullPath: ID!, $after: String) {
    group(fullPath: $fullPath) {
      boards(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id name
          lists { nodes { id label { ...LabelF } position maxIssueCount maxIssueWeight } }
        }
      }
    }
  }
`;

export const Q_PROJECT_PATH = `
  query($ids: [ID!]!) {
    projects(ids: $ids) {
      nodes { id fullPath }
    }
  }
`;

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const M_CREATE_EPIC = `
  ${USER_FRAGMENT}
  mutation($input: CreateEpicInput!) {
    createEpic(input: $input) {
      epic {
        id iid title description state webUrl
        labels { nodes { title } }
        startDate dueDate createdAt updatedAt closedAt
        author { ...UserF } upvotes downvotes
        group { id }
      }
      errors
    }
  }
`;

export const M_UPDATE_EPIC = `
  ${USER_FRAGMENT}
  mutation($input: UpdateEpicInput!) {
    updateEpic(input: $input) {
      epic {
        id iid title description state webUrl
        labels { nodes { title } }
        startDate dueDate createdAt updatedAt closedAt
        author { ...UserF } upvotes downvotes
        group { id }
      }
      errors
    }
  }
`;

export const M_CREATE_MILESTONE = `
  ${MILESTONE_FRAGMENT}
  mutation($input: CreateMilestoneInput!) {
    createMilestone(input: $input) {
      milestone { ...MilestoneF }
      errors
    }
  }
`;

export const M_UPDATE_MILESTONE = `
  ${MILESTONE_FRAGMENT}
  mutation($input: UpdateMilestoneInput!) {
    updateMilestone(input: $input) {
      milestone { ...MilestoneF }
      errors
    }
  }
`;

export const M_CREATE_ISSUE = `
  ${USER_FRAGMENT}
  ${MILESTONE_FRAGMENT}
  mutation($input: CreateIssueInput!) {
    createIssue(input: $input) {
      issue {
        id iid title description state webUrl
        labels { nodes { title } }
        milestone { ...MilestoneF }
        assignees { nodes { ...UserF } }
        author { ...UserF }
        dueDate createdAt updatedAt closedAt
        weight epic { iid } projectId
        timeEstimate totalTimeSpent humanTimeEstimate humanTotalTimeSpent
      }
      errors
    }
  }
`;

export const M_UPDATE_ISSUE = `
  ${USER_FRAGMENT}
  ${MILESTONE_FRAGMENT}
  mutation($input: UpdateIssueInput!) {
    updateIssue(input: $input) {
      issue {
        id iid title description state webUrl
        labels { nodes { title } }
        milestone { ...MilestoneF }
        assignees { nodes { ...UserF } }
        author { ...UserF }
        dueDate createdAt updatedAt closedAt
        weight epic { iid } projectId
        timeEstimate totalTimeSpent humanTimeEstimate humanTotalTimeSpent
      }
      errors
    }
  }
`;

export const M_CREATE_NOTE = `
  ${USER_FRAGMENT}
  mutation($input: CreateNoteInput!) {
    createNote(input: $input) {
      note { id body author { ...UserF } createdAt updatedAt system }
      errors
    }
  }
`;

export const M_EPIC_ADD_ISSUE = `
  mutation($input: EpicAddIssueInput!) {
    epicAddIssue(input: $input) {
      epicIssue { id }
      errors
    }
  }
`;

// --- Work Items mutations ---

export const Q_EPIC_WORK_ITEM_ID = `
  query($fullPath: ID!, $iid: String!) {
    group(fullPath: $fullPath) {
      workItems(types: EPIC, iid: $iid, first: 1) {
        nodes { id }
      }
    }
  }
`;

export const Q_WORK_ITEM_WIDGETS = `
  query($id: WorkItemID!) {
    workItem(id: $id) {
      id title webUrl
      widgets {
        type
        ... on WorkItemWidgetHealthStatus { healthStatus }
        ... on WorkItemWidgetProgress { progress currentValue }
        ... on WorkItemWidgetMilestone { milestone { id title } }
        ... on WorkItemWidgetIteration { iteration { id title startDate dueDate } }
        ... on WorkItemWidgetLinkedItems {
          linkedItems(first: 100) {
            nodes {
              linkType
              workItem { id title state webUrl workItemType { name } }
            }
          }
        }
      }
    }
  }
`;

export const Q_ISSUE_WORK_ITEM_ID = `
  query($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      issue(iid: $iid) { id }
    }
  }
`;

export const M_WORK_ITEM_UPDATE = `
  mutation($input: WorkItemUpdateInput!) {
    workItemUpdate(input: $input) {
      workItem {
        id
        widgets {
          type
          ... on WorkItemWidgetHealthStatus { healthStatus }
          ... on WorkItemWidgetProgress { progress currentValue }
          ... on WorkItemWidgetMilestone { milestone { id title } }
          ... on WorkItemWidgetIteration { iteration { id title } }
        }
      }
      errors
    }
  }
`;

export const M_WORK_ITEM_ADD_LINKED = `
  mutation($input: WorkItemAddLinkedItemsInput!) {
    workItemAddLinkedItems(input: $input) {
      workItem { id }
      errors
    }
  }
`;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapUser(n: any): GitLabUser {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    username: n.username,
    name: n.name,
    state: n.state,
    avatar_url: n.avatarUrl ?? "",
    web_url: n.webUrl ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMilestone(n: any, baseUrl: string): GitLabMilestone {
  const id = typeof n.id === "string" ? fromGid(n.id) : n.id;
  return {
    id,
    iid: typeof n.iid === "string" ? parseInt(n.iid, 10) : n.iid,
    title: n.title,
    description: n.description ?? null,
    state: n.state === "closed" ? "closed" : "active",
    web_url: n.webPath ? `${baseUrl}${n.webPath}` : (n.webUrl ?? ""),
    due_date: n.dueDate ?? null,
    start_date: n.startDate ?? null,
    created_at: n.createdAt ?? "",
    updated_at: n.updatedAt ?? "",
    expired: n.expired ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapEpic(n: any): GitLabEpic {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    iid: typeof n.iid === "string" ? parseInt(n.iid, 10) : n.iid,
    group_id: n.group?.id ? fromGid(n.group.id) : 0,
    title: n.title,
    description: n.description ?? null,
    state: n.state === "closed" ? "closed" : "opened",
    web_url: n.webUrl ?? "",
    labels: n.labels?.nodes?.map((l: { title: string }) => l.title) ?? [],
    start_date: n.startDate ?? null,
    due_date: n.dueDate ?? null,
    created_at: n.createdAt ?? "",
    updated_at: n.updatedAt ?? "",
    closed_at: n.closedAt ?? null,
    author: n.author ? mapUser(n.author) : { id: 0, username: "", name: "", state: "", avatar_url: "", web_url: "" },
    upvotes: n.upvotes ?? 0,
    downvotes: n.downvotes ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapIssue(n: any, baseUrl: string): GitLabIssue {
  const timeStats: GitLabTimeStats = {
    time_estimate: n.timeEstimate ?? 0,
    total_time_spent: n.totalTimeSpent ?? 0,
    human_time_estimate: n.humanTimeEstimate ?? null,
    human_total_time_spent: n.humanTotalTimeSpent ?? null,
  };
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    iid: typeof n.iid === "string" ? parseInt(n.iid, 10) : n.iid,
    project_id: typeof n.projectId === "string" ? fromGid(n.projectId) : (n.projectId ?? 0),
    title: n.title,
    description: n.description ?? null,
    state: n.state === "closed" ? "closed" : "opened",
    web_url: n.webUrl ?? "",
    labels: n.labels?.nodes?.map((l: { title: string }) => l.title) ?? [],
    milestone: n.milestone ? mapMilestone(n.milestone, baseUrl) : null,
    assignees: n.assignees?.nodes?.map(mapUser) ?? [],
    author: n.author ? mapUser(n.author) : { id: 0, username: "", name: "", state: "", avatar_url: "", web_url: "" },
    due_date: n.dueDate ?? null,
    created_at: n.createdAt ?? "",
    updated_at: n.updatedAt ?? "",
    closed_at: n.closedAt ?? null,
    weight: n.weight ?? null,
    epic_iid: n.epic?.iid ? (typeof n.epic.iid === "string" ? parseInt(n.epic.iid, 10) : n.epic.iid) : null,
    time_stats: timeStats,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMergeRequest(n: any, baseUrl: string): GitLabMergeRequest {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    iid: typeof n.iid === "string" ? parseInt(n.iid, 10) : n.iid,
    project_id: typeof n.projectId === "string" ? fromGid(n.projectId) : (n.projectId ?? 0),
    title: n.title,
    description: n.description ?? null,
    state: n.state ?? "opened",
    web_url: n.webUrl ?? "",
    source_branch: n.sourceBranch ?? "",
    target_branch: n.targetBranch ?? "",
    labels: n.labels?.nodes?.map((l: { title: string }) => l.title) ?? [],
    milestone: n.milestone ? mapMilestone(n.milestone, baseUrl) : null,
    author: n.author ? mapUser(n.author) : { id: 0, username: "", name: "", state: "", avatar_url: "", web_url: "" },
    assignees: n.assignees?.nodes?.map(mapUser) ?? [],
    reviewers: n.reviewers?.nodes?.map(mapUser) ?? [],
    draft: n.draft ?? false,
    merge_status: n.mergeStatusEnum ?? n.mergeStatus ?? "",
    has_conflicts: n.conflicts ?? false,
    created_at: n.createdAt ?? "",
    updated_at: n.updatedAt ?? "",
    merged_at: n.mergedAt ?? null,
    closed_at: n.closedAt ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapGroup(n: any): GitLabGroup {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    name: n.name,
    full_path: n.fullPath ?? "",
    web_url: n.webUrl ?? "",
    description: n.description ?? null,
    parent_id: n.parent?.id ? fromGid(n.parent.id) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProject(n: any): GitLabProject {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    name: n.name,
    name_with_namespace: n.nameWithNamespace ?? "",
    path: n.path ?? "",
    path_with_namespace: n.fullPath ?? n.pathWithNamespace ?? "",
    web_url: n.webUrl ?? "",
    description: n.description ?? null,
    default_branch: n.repository?.rootRef ?? "main",
    archived: n.archived ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMember(n: any): GitLabMember {
  const user = n.user ?? {};
  return {
    id: user.id ? (typeof user.id === "string" ? fromGid(user.id) : user.id) : 0,
    username: user.username ?? "",
    name: user.name ?? "",
    state: user.state ?? "",
    access_level: n.accessLevel?.integerValue ?? 0,
    web_url: user.webUrl ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLabel(n: any): GitLabLabel {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    name: n.title ?? n.name ?? "",
    color: n.color ?? "",
    text_color: n.textColor ?? "",
    description: n.description ?? null,
    open_issues_count: 0,
    closed_issues_count: 0,
    open_merge_requests_count: 0,
    subscribed: false,
    priority: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNote(n: any): GitLabNote {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    body: n.body ?? "",
    author: n.author ? mapUser(n.author) : { id: 0, username: "", name: "", state: "", avatar_url: "", web_url: "" },
    created_at: n.createdAt ?? "",
    updated_at: n.updatedAt ?? "",
    system: n.system ?? false,
    noteable_type: n.noteableType ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBoard(n: any): GitLabBoard {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    name: n.name ?? "",
    milestone: null,
    labels: [],
    lists: (n.lists?.nodes ?? []).map(mapBoardList),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBoardList(n: any): GitLabBoardList {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    label: n.label ? mapLabel(n.label) : null,
    position: n.position ?? 0,
    max_issue_count: n.maxIssueCount ?? 0,
    max_issue_weight: n.maxIssueWeight ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapIteration(n: any): GitLabIteration {
  return {
    id: typeof n.id === "string" ? fromGid(n.id) : n.id,
    iid: typeof n.iid === "string" ? parseInt(n.iid, 10) : n.iid,
    group_id: 0,
    title: n.title ?? "",
    description: n.description ?? null,
    state: n.state ?? "upcoming",
    web_url: n.webUrl ?? "",
    start_date: n.startDate ?? "",
    due_date: n.dueDate ?? "",
    created_at: n.createdAt ?? "",
    updated_at: n.updatedAt ?? "",
  };
}
