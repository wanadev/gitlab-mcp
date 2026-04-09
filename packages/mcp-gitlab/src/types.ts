export interface GitLabConfig {
  baseUrl: string;
  token: string;
  groupId: string;
  readOnly: boolean;
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
