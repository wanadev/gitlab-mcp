# @wanadev/mcp-gitlab

A Model Context Protocol (MCP) server that gives project managers **and developers** full control over GitLab **epics**, **issues**, **milestones**, **iterations**, **merge requests**, **pipelines**, **branches**, **labels**, and **boards** from Claude Desktop, Claude Code, or any MCP-compatible client.

## Why this MCP server?

Existing tools like **glab** are developer-oriented and CLI-only. `@wanadev/mcp-gitlab` covers both lenses -- planning *and* code -- through a conversational interface:

- **Epics, milestones & iterations** -- create, update, close, reopen, and link issues to epics. Track sprints with iterations (CRUD). Set health status (on track / needs attention / at risk) and view progress via Work Items API.
- **Full MR lifecycle** -- create, update, merge, approve, diff, and comment on merge requests.
- **CI/CD** -- list and inspect pipelines, fetch job logs, retry or cancel runs.
- **Branches & repository** -- list/create branches, browse the tree, read files, list commits.
- **Labels & users** -- CRUD on labels, search users to assign work.
- **Cross-group visibility** -- query multiple GitLab groups in the same conversation (no hardcoded group ID).
- **Time tracking** -- see estimated vs. spent time on issues at a glance.
- **Comments (notes)** -- read, add, edit, and delete notes on issues, epics, and MRs.
- **Dry-run by default** -- every write operation previews what it will do before touching GitLab.

## Quick setup

### Prerequisites

- **Node.js >= 20**
- A GitLab **Personal Access Token** (PAT) with the `api` scope (or `read_api` for read-only access)
- **GitLab Premium/Ultimate** for epics and iterations (issues, milestones, MRs, labels, and boards work with all editions)

### 1. Generate a GitLab token

1. Go to **GitLab > Settings > Access Tokens**
2. Create a token with the `api` scope
3. Copy the token

### 2. Install

#### Claude Code (plugin)

```
/plugin marketplace add wanadev/gitlab-mcp
/plugin install wanadev-gitlab@wanadev-gitlab
```

Set `GITLAB_TOKEN` in your environment (`.bashrc`, `.zshrc`, or system variable). The plugin will guide you on first launch if it's missing.

#### Claude Desktop (manual config)

Add the following to your `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npx",
      "args": ["-y", "@wanadev/mcp-gitlab"],
      "env": {
        "GITLAB_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_BASE_URL": "https://gitlab.com",
        "GITLAB_READ_ONLY": "false"
      }
    }
  }
}
```

### 3. Restart and test

The MCP server will be available immediately. Test with: *"List my GitLab groups"*

## Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `GITLAB_TOKEN` | Yes | GitLab Personal Access Token |
| `GITLAB_BASE_URL` | No | GitLab instance URL (default: `https://gitlab.com`) |
| `GITLAB_READ_ONLY` | No | Set to `true` to block all write operations |

> **Note:** There is no `GITLAB_GROUP_ID` environment variable. Every group-scoped tool takes a `group_id` parameter. Use `list_groups` to discover accessible groups -- the LLM does this automatically.

## Dry-run safety

All write tools (`create_*`, `update_*`, `close_*`, `set_*`, `add_*`) include a `dry_run` parameter that defaults to **`true`**.

| Mode | Behavior |
|------|----------|
| `dry_run: true` (default) | Returns a summary of the planned action **without** executing anything on GitLab. |
| `dry_run: false` | Executes the action for real, after the user confirms. |

This prevents accidental changes: the LLM always shows what it intends to do first and only proceeds after your approval.

## All 69 tools

### Epics (12 tools -- requires GitLab Premium/Ultimate)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_epics` | List epics (filter by state, search, labels) | group | -- |
| `get_epic` | Get epic details by number | group | -- |
| `create_epic` | Create an epic | group | dry_run |
| `update_epic` | Update an epic (title, description, labels, dates) | group | dry_run |
| `close_epic` | Close an epic | group | dry_run |
| `reopen_epic` | Reopen a closed epic | group | dry_run |
| `list_epic_issues` | List issues linked to an epic | group | -- |
| `add_issue_to_epic` | Link an issue to an epic | group | dry_run |
| `list_epic_notes` | List comments on an epic | group | -- |
| `add_epic_note` | Add a comment to an epic | group | dry_run |
| `update_epic_note` | Edit an existing epic comment | group | dry_run |
| `delete_epic_note` | Delete an epic comment | group | dry_run |

### Work Items (6 tools -- requires GitLab Premium/Ultimate)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `get_epic_widgets` | Get epic widgets: health status, progress, milestone, iteration, linked items | group | -- |
| `set_epic_milestone` | Associate a milestone with an epic | group | dry_run |
| `set_epic_health_status` | Set health status on an epic (onTrack / needsAttention / atRisk) | group | dry_run |
| `set_issue_health_status` | Set health status on an issue (onTrack / needsAttention / atRisk) | project | dry_run |
| `set_epic_iteration` | Associate an iteration (sprint) with an epic | group | dry_run |
| `add_linked_item` | Link work items (RELATED / BLOCKS / BLOCKED_BY) | group/project | dry_run |

### Issues (11 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_issues` | List issues for a group | group | -- |
| `list_project_issues` | List issues for a single project | project | -- |
| `get_issue` | Get issue details (with time tracking) | project | -- |
| `create_issue` | Create an issue | project | dry_run |
| `update_issue` | Update an issue | project | dry_run |
| `close_issue` | Close an issue | project | dry_run |
| `reopen_issue` | Reopen a closed issue | project | dry_run |
| `list_issue_notes` | List comments on an issue | project | -- |
| `add_issue_note` | Add a comment to an issue | project | dry_run |
| `update_issue_note` | Edit an existing issue comment | project | dry_run |
| `delete_issue_note` | Delete an issue comment | project | dry_run |

### Milestones (5 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_milestones` | List milestones for a group | group | -- |
| `get_milestone` | Get milestone details | group | -- |
| `create_milestone` | Create a milestone | group | dry_run |
| `update_milestone` | Update a milestone | group | dry_run |
| `close_milestone` | Close a milestone | group | dry_run |

### Merge Requests (11 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_merge_requests` | List merge requests for a group | group | -- |
| `get_merge_request` | Get merge request details | project | -- |
| `create_merge_request` | Open a new MR (source/target branch, title, description) | project | dry_run |
| `update_merge_request` | Update an MR (title, description, labels, assignees, reviewers) | project | dry_run |
| `merge_merge_request` | Merge an MR (optionally squash or delete source branch) | project | dry_run |
| `approve_merge_request` | Approve an MR | project | dry_run |
| `get_mr_diff` | Get the diff/changes for an MR | project | -- |
| `list_mr_notes` | List comments on an MR | project | -- |
| `add_mr_note` | Add a comment to an MR | project | dry_run |
| `update_mr_note` | Edit an existing MR comment | project | dry_run |
| `delete_mr_note` | Delete an MR comment | project | dry_run |

### CI/CD (5 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_pipelines` | List pipelines for a project (filter by ref, status, etc.) | project | -- |
| `get_pipeline` | Get pipeline details and jobs | project | -- |
| `get_job_log` | Fetch the trace/log of a CI job | project | -- |
| `retry_pipeline` | Retry a failed pipeline | project | dry_run |
| `cancel_pipeline` | Cancel a running pipeline | project | dry_run |

### Branches & Repository (5 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_branches` | List branches in a project | project | -- |
| `create_branch` | Create a branch from a ref | project | dry_run |
| `list_repository_tree` | List the files/folders in a repo path | project | -- |
| `get_file` | Read a file's contents at a given ref | project | -- |
| `list_commits` | List commits (filter by ref, author, date) | project | -- |

### Iterations (3 tools -- requires GitLab Premium/Ultimate)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_iterations` | List iterations/sprints (filter by state: upcoming, current, closed) | group | -- |
| `create_iteration` | Create an iteration | group | dry_run |
| `update_iteration` | Update an iteration (title, dates, state) | group | dry_run |

### Utilities (11 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_groups` | Discover accessible groups | -- | -- |
| `list_projects` | List projects in a group | group | -- |
| `list_group_members` | List members of a group | group | -- |
| `list_labels` | List labels for a group | group | -- |
| `create_label` | Create a label | group | dry_run |
| `update_label` | Update a label (name, color, description) | group | dry_run |
| `delete_label` | Delete a label | group | dry_run |
| `list_boards` | List issue boards for a group | group | -- |
| `list_workitem_statuses` | List available work item statuses (for health filtering) | group | -- |
| `search_users` | Search GitLab users by name or username | -- | -- |
| `get_current_user` | Check connection (current user info) | -- | -- |

> A `gitlab_setup` helper tool is also registered automatically when `GITLAB_TOKEN` is missing or `GITLAB_BASE_URL` is invalid — it guides the user through configuration and is not counted in the 69 above.

## Example prompts

- *"List my GitLab groups"*
- *"Show open epics in group 42"*
- *"What's the health status and progress of epic #5?"*
- *"Set epic #12 health status to 'needs attention'"*
- *"Link epic #3 as blocking issue #45"*
- *"List issues labeled `bug` in the wanadev group"*
- *"Create an epic called 'Homepage Redesign' in group 42 with a deadline of April 30"*
- *"Which issues are linked to epic #5 in the wanadev group?"*
- *"Close issue #15 in project 789"*
- *"Who are the members of the wanadev group?"*
- *"Show me all open merge requests in group 42"*
- *"How much time has been spent on issue #23 in project 456?"*
- *"Add a comment on epic #3 in group 42: Specs validated, ready for dev"*
- *"What milestones are coming up in the wanadev group?"*
- *"List the boards for group 42"*
- *"Open an MR from `feat/new-login` to `main` in project 789, then request review from @alice"*
- *"Show me the diff of MR !42 and summarize the changes"*
- *"List the last 5 failed pipelines on `main` in project 789 and fetch the log of the failing job"*
- *"Retry pipeline 12345 in project 789"*
- *"Create a `release/2026.05` branch from `main` in project 789"*
- *"Read the contents of `package.json` on branch `main` in project 789"*
- *"Find a user named 'Jean Dupont' and assign them issue #15"*

## Use cases for project managers

### Sprint planning

> *"List the active milestones in the wanadev group. For each one, show me the open issues and how many are unassigned."*

Claude calls `list_milestones` → `list_issues` per milestone → summarizes the gaps. You see at a glance what's on track and what needs attention.

### Daily standup prep

> *"Show me all open MRs in the [project] group that have been waiting for review for more than 3 days. Also list any issues that were closed yesterday."*

Claude calls `list_merge_requests` (state: opened) → `list_issues` (state: closed, sort: updated_at) → gives you a ready-made standup brief.

### Epic progress review

> *"Give me a status report on epic #12 in group wanadev: how many issues are done vs. open, what's the total time spent, and list the latest comments."*

Claude chains `get_epic` → `list_epic_issues` → reads `time_stats` from each issue → `list_epic_notes` → returns a structured progress report.

### Cross-group dashboard

> *"Compare the open issue count across my three groups: wanadev, [project], and infra. Which group has the most overdue issues?"*

Claude calls `list_groups` → `list_issues` for each group with due date filtering → builds a comparison table.

### Quick issue triage

> *"In the [project] group, find all issues labeled 'urgent' with no assignee. Assign them to @jean and add a comment saying 'Triaged in weekly review'."*

Claude calls `list_issues` (labels: urgent) → for each unassigned issue, dry-runs `update_issue` (assignee) + `add_issue_note` → shows you the plan → you confirm → done.

### Milestone closure

> *"Close milestone 'Sprint 14' in group wanadev. Before that, show me any issues still open in it."*

Claude calls `list_issues` (milestone: Sprint 14, state: opened) → warns you about remaining items → dry-runs `close_milestone` → you confirm.

## Development

```bash
git clone https://github.com/wanadev/gitlab-mcp.git
cd gitlab-mcp
npm install
npm run build       # Build ESM (tsc)
npm run typecheck   # TypeScript type checking
npm run dev         # Build in watch mode
```

## Notes

- **`issue_id` vs `issue_iid`** -- `add_issue_to_epic` requires the global issue ID (not the `#iid` displayed in the project). Both `list_issues` and `list_epic_issues` return both values.
- **Read-only mode** -- With `GITLAB_READ_ONLY=true`, any create/update/close attempt returns a clear error.
- **403 on epics** -- Epic endpoints require a GitLab Premium or Ultimate license.
- **Multi-group workflow** -- You can work across several groups in a single conversation. The LLM will call `list_groups` to discover them, then pass the right `group_id` to each tool.
- **GitLab CE / Free support** -- The server introspects your GitLab instance at startup and detects whether `Issue.weight` / `Issue.epic` are available (Premium/Ultimate-only fields). On Free/CE, those fields are silently omitted from queries and mutations, so all issue tools work — only epic-specific features remain Premium. The detected tier is logged at startup: `[..., Premium/Ultimate]` or `[..., Free/CE]`.
