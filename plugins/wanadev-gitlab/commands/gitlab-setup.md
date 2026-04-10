---
name: gitlab-setup
description: Configure the GitLab MCP server (set your Personal Access Token)
---

Check if the `GITLAB_TOKEN` environment variable is set.

**If GITLAB_TOKEN is NOT set or empty**, guide the user step by step in their language:

1. Go to **GitLab > Settings > Access Tokens**
2. Create a token with the `api` scope (or `read_api` for read-only access)
3. Copy the token
4. Set it as an environment variable:
   - **Linux/macOS**: add `export GITLAB_TOKEN=glpat-xxxx` to `~/.bashrc` or `~/.zshrc`, then run `source ~/.bashrc`
   - **Windows**: add it via System Properties > Environment Variables, or run `setx GITLAB_TOKEN glpat-xxxx`
5. Restart Claude Code with `/reload-plugins`

Also ask if they need to configure `GITLAB_BASE_URL` (for self-hosted GitLab instances — default is `https://gitlab.com`).

**If GITLAB_TOKEN IS set**, confirm that the connection works by calling the `get_current_user` tool. Show the user their GitLab identity and confirm everything is working.
