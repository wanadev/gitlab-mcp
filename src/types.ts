export interface GitLabConfig {
  baseUrl: string;
  token: string;
  readOnly: boolean;
}

export interface GitLabGroup {
  id: number;
  name: string;
  full_path: string;
  web_url: string;
  description: string | null;
  parent_id: number | null;
}

export interface GitLabEpic {
  id: number;
  iid: number;
  group_id: number;
  title: string;
  description: string | null;
  state: "opened" | "closed";
  web_url: string;
  labels: string[];
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author: GitLabUser;
  upvotes: number;
  downvotes: number;
}

export interface GitLabTimeStats {
  time_estimate: number;
  total_time_spent: number;
  human_time_estimate: string | null;
  human_total_time_spent: string | null;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: "opened" | "closed";
  web_url: string;
  labels: string[];
  milestone: GitLabMilestone | null;
  assignees: GitLabUser[];
  author: GitLabUser;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  weight: number | null;
  epic_iid: number | null;
  time_stats: GitLabTimeStats;
}

export interface GitLabMilestone {
  id: number;
  iid: number;
  group_id?: number;
  project_id?: number;
  title: string;
  description: string | null;
  state: "active" | "closed";
  web_url: string;
  due_date: string | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
  expired: boolean;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  state: string;
  avatar_url: string;
  web_url: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  web_url: string;
  description: string | null;
  default_branch: string;
  archived: boolean;
}

export interface GitLabMember {
  id: number;
  username: string;
  name: string;
  state: string;
  access_level: number;
  web_url: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: "opened" | "closed" | "merged" | "locked";
  web_url: string;
  source_branch: string;
  target_branch: string;
  labels: string[];
  milestone: GitLabMilestone | null;
  author: GitLabUser;
  assignees: GitLabUser[];
  reviewers: GitLabUser[];
  draft: boolean;
  merge_status: string;
  has_conflicts: boolean;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

export interface GitLabLabel {
  id: number;
  name: string;
  color: string;
  text_color: string;
  description: string | null;
  open_issues_count: number;
  closed_issues_count: number;
  open_merge_requests_count: number;
  subscribed: boolean;
  priority: number | null;
}

export interface GitLabNote {
  id: number;
  body: string;
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  system: boolean;
  noteable_type: string;
}

export interface GitLabBoard {
  id: number;
  name: string;
  group?: { id: number; name: string; web_url: string };
  milestone: GitLabMilestone | null;
  labels: GitLabLabel[];
  lists: GitLabBoardList[];
}

export interface GitLabBoardList {
  id: number;
  label: GitLabLabel | null;
  position: number;
  max_issue_count: number;
  max_issue_weight: number;
}
