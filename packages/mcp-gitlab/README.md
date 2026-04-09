# @wanadev/mcp-gitlab

Serveur MCP (Model Context Protocol) pour gerer les **epics**, **issues** et **milestones** GitLab depuis Claude Desktop ou tout client MCP compatible.

## Prerequis

- **Node.js >= 20**
- **GitLab Premium ou Ultimate** (requis pour les epics — les issues et milestones fonctionnent avec toutes les editions)
- Un **Personal Access Token** (PAT) GitLab avec le scope `api` (lecture+ecriture) ou `read_api` (lecture seule)

## Generation du token GitLab

1. Aller dans **GitLab > Settings > Access Tokens**
2. Creer un token avec le scope `api` (ou `read_api` pour un acces en lecture seule)
3. Copier le token

## Configuration Claude Desktop

Ajouter dans `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npx",
      "args": ["-y", "@wanadev/mcp-gitlab"],
      "env": {
        "GITLAB_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_GROUP_ID": "mon-groupe",
        "GITLAB_BASE_URL": "https://gitlab.com",
        "GITLAB_READ_ONLY": "false"
      }
    }
  }
}
```

### Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `GITLAB_TOKEN` | Oui | Personal Access Token GitLab |
| `GITLAB_GROUP_ID` | Oui | ID ou chemin du groupe (ex: `12345` ou `wanadev`) |
| `GITLAB_BASE_URL` | Non | URL de l'instance GitLab (defaut: `https://gitlab.com`) |
| `GITLAB_READ_ONLY` | Non | `true` pour bloquer toutes les operations d'ecriture |

## Liste des 18 tools

### Epics (7 tools — necessite GitLab Premium/Ultimate)

| Tool | Description | Lecture seule |
|------|-------------|:---:|
| `list_epics` | Lister les epics (filtre par etat, recherche, labels) | Oui |
| `get_epic` | Details d'un epic par IID | Oui |
| `create_epic` | Creer un epic | Non |
| `update_epic` | Modifier un epic | Non |
| `close_epic` | Fermer un epic | Non |
| `list_epic_issues` | Issues rattachees a un epic | Oui |
| `add_issue_to_epic` | Rattacher une issue a un epic | Non |

### Issues (5 tools)

| Tool | Description | Lecture seule |
|------|-------------|:---:|
| `list_issues` | Lister les issues du groupe (filtre par etat, labels, milestone, assignee) | Oui |
| `get_issue` | Details d'une issue par projet + IID | Oui |
| `create_issue` | Creer une issue dans un projet | Non |
| `update_issue` | Modifier une issue | Non |
| `close_issue` | Fermer une issue | Non |

### Milestones (3 tools)

| Tool | Description | Lecture seule |
|------|-------------|:---:|
| `list_milestones` | Lister les milestones du groupe | Oui |
| `get_milestone` | Details d'un milestone | Oui |
| `create_milestone` | Creer un milestone | Non |

### Utilitaires (3 tools)

| Tool | Description | Lecture seule |
|------|-------------|:---:|
| `list_projects` | Lister les projets du groupe | Oui |
| `list_group_members` | Lister les membres du groupe | Oui |
| `get_current_user` | Info utilisateur connecte (test du token) | Oui |

## Exemples de prompts Claude Desktop

- "Liste les epics ouverts du groupe Wanadev"
- "Montre-moi les issues assignees a @jean avec le label bug"
- "Cree un epic 'Refonte homepage' avec une echeance au 30 avril"
- "Quelles issues sont dans l'epic #42 ?"
- "Liste les milestones actifs"
- "Ferme l'issue #15 du projet 789"
- "Qui sont les membres du groupe ?"

## Notes importantes

- **`issue_id` vs `issue_iid`** : pour `add_issue_to_epic`, il faut l'ID global de l'issue (pas le numero affiche dans le projet). Les outils `list_issues` et `list_epic_issues` affichent les deux.
- **Mode lecture seule** : avec `GITLAB_READ_ONLY=true`, toute tentative de creation/modification retourne une erreur claire.
- **Erreur 403 sur les epics** : les epics necessitent une licence GitLab Premium ou Ultimate.

## Developpement

```bash
npm install
npm run build      # Build ESM + CJS
npm run typecheck   # Verification TypeScript
npm run dev         # Build en mode watch
```
