# @wanadev/mcp-gitlab

A Model Context Protocol (MCP) server that gives project managers full control over GitLab **epics**, **issues**, **milestones**, **merge requests**, **labels**, and **boards** from Claude Desktop or any MCP-compatible client.

## Why this MCP server?

Existing tools like **glab** are developer-oriented: they focus on merge requests, pipelines, and code review. Project managers need a different lens -- one centered on **planning and tracking**.

`@wanadev/mcp-gitlab` fills that gap:

- **Epics & milestones** -- create, update, close, and link issues to epics.
- **Cross-group visibility** -- query multiple GitLab groups in the same conversation (no hardcoded group ID).
- **Time tracking** -- see estimated vs. spent time on issues at a glance.
- **Labels & boards** -- list labels and issue boards without leaving your chat.
- **Comments (notes)** -- read and add notes on both issues and epics.
- **Merge request monitoring** -- track MR status without switching to the developer workflow.
- **Dry-run by default** -- every write operation previews what it will do before touching GitLab.

## Quick setup

### Prerequisites

- **Node.js >= 20**
- A GitLab **Personal Access Token** (PAT) with the `api` scope (or `read_api` for read-only access)
- **GitLab Premium/Ultimate** for epics (issues, milestones, MRs, and utilities work with all editions)

### 1. Generate a GitLab token

1. Go to **GitLab > Settings > Access Tokens**
2. Create a token with the `api` scope
3. Copy the token

### 2. Configure Claude Desktop

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

### 3. Restart Claude Desktop

The MCP server will be available immediately. Test with: *"List my GitLab groups"*

## Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `GITLAB_TOKEN` | Yes | GitLab Personal Access Token |
| `GITLAB_BASE_URL` | No | GitLab instance URL (default: `https://gitlab.com`) |
| `GITLAB_READ_ONLY` | No | Set to `true` to block all write operations |

> **Note:** There is no `GITLAB_GROUP_ID` environment variable. Every group-scoped tool takes a `group_id` parameter. Use `list_groups` to discover accessible groups -- the LLM does this automatically.

## Dry-run safety

All write tools (`create_*`, `update_*`, `close_*`, `add_issue_to_epic`, `add_issue_note`, `add_epic_note`) include a `dry_run` parameter that defaults to **`true`**.

| Mode | Behavior |
|------|----------|
| `dry_run: true` (default) | Returns a summary of the planned action **without** executing anything on GitLab. |
| `dry_run: false` | Executes the action for real, after the user confirms. |

This prevents accidental changes: the LLM always shows what it intends to do first and only proceeds after your approval.

## All 30 tools

### Epics (9 tools -- requires GitLab Premium/Ultimate)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_epics` | List epics (filter by state, search, labels) | group | -- |
| `get_epic` | Get epic details by number | group | -- |
| `create_epic` | Create an epic | group | dry_run |
| `update_epic` | Update an epic | group | dry_run |
| `close_epic` | Close an epic | group | dry_run |
| `list_epic_issues` | List issues linked to an epic | group | -- |
| `add_issue_to_epic` | Link an issue to an epic | group | dry_run |
| `list_epic_notes` | List comments on an epic | group | -- |
| `add_epic_note` | Add a comment to an epic | group | dry_run |

### Issues (7 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_issues` | List issues for a group | group | -- |
| `get_issue` | Get issue details (with time tracking) | project | -- |
| `create_issue` | Create an issue | project | dry_run |
| `update_issue` | Update an issue | project | dry_run |
| `close_issue` | Close an issue | project | dry_run |
| `list_issue_notes` | List comments on an issue | project | -- |
| `add_issue_note` | Add a comment to an issue | project | dry_run |

### Milestones (5 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_milestones` | List milestones for a group | group | -- |
| `get_milestone` | Get milestone details | group | -- |
| `create_milestone` | Create a milestone | group | dry_run |
| `update_milestone` | Update a milestone | group | dry_run |
| `close_milestone` | Close a milestone | group | dry_run |

### Merge Requests (2 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_merge_requests` | List merge requests for a group | group | -- |
| `get_merge_request` | Get merge request details | project | -- |

### Iterations (1 tool -- requires GitLab Premium/Ultimate)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_iterations` | List iterations/sprints (filter by state: upcoming, current, closed) | group | -- |

### Utilities (6 tools)

| Tool | Description | Scope | Write |
|------|-------------|:-----:|:-----:|
| `list_groups` | Discover accessible groups | -- | -- |
| `list_projects` | List projects in a group | group | -- |
| `list_group_members` | List members of a group | group | -- |
| `list_labels` | List labels for a group | group | -- |
| `list_boards` | List issue boards for a group | group | -- |
| `get_current_user` | Check connection (current user info) | -- | -- |

## Example prompts

- *"List my GitLab groups"*
- *"Show open epics in group 42"*
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

## Use cases for project managers

### Sprint planning

> *"List the active milestones in the wanadev group. For each one, show me the open issues and how many are unassigned."*

Claude calls `list_milestones` → `list_issues` per milestone → summarizes the gaps. You see at a glance what's on track and what needs attention.

### Daily standup prep

> *"Show me all open MRs in the kp1 group that have been waiting for review for more than 3 days. Also list any issues that were closed yesterday."*

Claude calls `list_merge_requests` (state: opened) → `list_issues` (state: closed, sort: updated_at) → gives you a ready-made standup brief.

### Epic progress review

> *"Give me a status report on epic #12 in group wanadev: how many issues are done vs. open, what's the total time spent, and list the latest comments."*

Claude chains `get_epic` → `list_epic_issues` → reads `time_stats` from each issue → `list_epic_notes` → returns a structured progress report.

### Cross-group dashboard

> *"Compare the open issue count across my three groups: wanadev, kp1, and infra. Which group has the most overdue issues?"*

Claude calls `list_groups` → `list_issues` for each group with due date filtering → builds a comparison table.

### Quick issue triage

> *"In the kp1 group, find all issues labeled 'urgent' with no assignee. Assign them to @jean and add a comment saying 'Triaged in weekly review'."*

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
