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
| `GITLAB_BASE_URL` | Non | URL de l'instance GitLab (defaut: `https://gitlab.com`) |
| `GITLAB_READ_ONLY` | Non | `true` pour bloquer toutes les operations d'ecriture |

> **Note :** Le `group_id` n'est plus une variable d'environnement. Chaque tool group-scoped prend un parametre `group_id` requis. Utilisez `list_groups` pour decouvrir les groupes accessibles.

## Liste des 19 tools

### Epics (7 tools — necessite GitLab Premium/Ultimate)

| Tool | Description | Lecture seule | `group_id` requis |
|------|-------------|:---:|:---:|
| `list_epics` | Lister les epics (filtre par etat, recherche, labels) | Oui | Oui |
| `get_epic` | Details d'un epic par IID | Oui | Oui |
| `create_epic` | Creer un epic | Non | Oui |
| `update_epic` | Modifier un epic | Non | Oui |
| `close_epic` | Fermer un epic | Non | Oui |
| `list_epic_issues` | Issues rattachees a un epic | Oui | Oui |
| `add_issue_to_epic` | Rattacher une issue a un epic | Non | Oui |

### Issues (5 tools)

| Tool | Description | Lecture seule | `group_id` requis |
|------|-------------|:---:|:---:|
| `list_issues` | Lister les issues d'un groupe (filtre par etat, labels, milestone, assignee) | Oui | Oui |
| `get_issue` | Details d'une issue par projet + IID | Oui | Non |
| `create_issue` | Creer une issue dans un projet | Non | Non |
| `update_issue` | Modifier une issue | Non | Non |
| `close_issue` | Fermer une issue | Non | Non |

### Milestones (3 tools)

| Tool | Description | Lecture seule | `group_id` requis |
|------|-------------|:---:|:---:|
| `list_milestones` | Lister les milestones d'un groupe | Oui | Oui |
| `get_milestone` | Details d'un milestone | Oui | Oui |
| `create_milestone` | Creer un milestone | Non | Oui |

### Utilitaires (4 tools)

| Tool | Description | Lecture seule | `group_id` requis |
|------|-------------|:---:|:---:|
| `list_groups` | Decouvrir les groupes accessibles | Oui | Non |
| `list_projects` | Lister les projets d'un groupe | Oui | Oui |
| `list_group_members` | Lister les membres d'un groupe | Oui | Oui |
| `get_current_user` | Info utilisateur connecte (test du token) | Oui | Non |

## Exemples de prompts Claude Desktop

- "Liste mes groupes GitLab"
- "Liste les epics ouverts du groupe 42"
- "Montre-moi les issues assignees a @jean avec le label bug dans le groupe wanadev"
- "Cree un epic 'Refonte homepage' dans le groupe 42 avec une echeance au 30 avril"
- "Quelles issues sont dans l'epic #42 du groupe wanadev ?"
- "Liste les milestones actifs du groupe wanadev"
- "Ferme l'issue #15 du projet 789"
- "Qui sont les membres du groupe wanadev ?"

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
