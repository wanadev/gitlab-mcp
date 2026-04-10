# @wanadev/mcp-gitlab

Serveur MCP (Model Context Protocol) pour gerer les **epics**, **issues** et **milestones** GitLab depuis Claude Desktop ou tout client MCP compatible.

## Installation rapide

### Prerequis

- **Node.js >= 20**
- Un **Personal Access Token** (PAT) GitLab avec le scope `api` (ou `read_api` pour lecture seule)
- **GitLab Premium/Ultimate** pour les epics (issues et milestones fonctionnent avec toutes les editions)

### 1. Generer un token GitLab

1. Aller dans **GitLab > Settings > Access Tokens**
2. Creer un token avec le scope `api`
3. Copier le token

### 2. Configurer Claude Desktop

Ajouter dans votre fichier `claude_desktop_config.json` :

**Windows :** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS :** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npx",
      "args": ["-y", "https://github.com/wanadev/gitlab-mcp/releases/download/v1.0.0/wanadev-mcp-gitlab-1.0.0.tgz"],
      "env": {
        "GITLAB_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_BASE_URL": "https://gitlab.com",
        "GITLAB_READ_ONLY": "false"
      }
    }
  }
}
```

> Remplacer `v1.0.0` par la [derniere release](https://github.com/wanadev/gitlab-mcp/releases).

### 3. Redemarrer Claude Desktop

Le serveur MCP sera disponible immediatement. Testez avec : *"Liste mes groupes GitLab"*

## Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `GITLAB_TOKEN` | Oui | Personal Access Token GitLab |
| `GITLAB_BASE_URL` | Non | URL de l'instance GitLab (defaut: `https://gitlab.com`) |
| `GITLAB_READ_ONLY` | Non | `true` pour bloquer toutes les operations d'ecriture |

> **Note :** Le `group_id` n'est plus une variable d'environnement. Chaque tool group-scoped prend un parametre `group_id` requis. Utilisez `list_groups` pour decouvrir les groupes accessibles.

## Mode dry-run (confirmation avant ecriture)

Tous les tools d'ecriture (`create_*`, `update_*`, `close_*`, `add_issue_to_epic`) ont un parametre `dry_run` qui vaut **`true` par defaut**.

- **`dry_run: true`** (defaut) — retourne un resume de l'action prevue sans rien executer sur GitLab.
- **`dry_run: false`** — execute reellement l'action apres confirmation de l'utilisateur.

Cela evite toute modification accidentelle : le LLM montre d'abord ce qu'il va faire, et n'execute qu'apres votre accord.

## Les 19 tools disponibles

### Epics (necessite GitLab Premium/Ultimate)

| Tool | Description | `group_id` requis | dry_run |
|------|-------------|:---:|:---:|
| `list_epics` | Lister les epics (filtre par etat, recherche, labels) | Oui | — |
| `get_epic` | Details d'un epic par numero | Oui | — |
| `create_epic` | Creer un epic | Oui | Oui |
| `update_epic` | Modifier un epic | Oui | Oui |
| `close_epic` | Fermer un epic | Oui | Oui |
| `list_epic_issues` | Issues rattachees a un epic | Oui | — |
| `add_issue_to_epic` | Rattacher une issue a un epic | Oui | Oui |

### Issues

| Tool | Description | `group_id` requis | dry_run |
|------|-------------|:---:|:---:|
| `list_issues` | Lister les issues d'un groupe | Oui | — |
| `get_issue` | Details d'une issue (project-scoped) | Non | — |
| `create_issue` | Creer une issue (project-scoped) | Non | Oui |
| `update_issue` | Modifier une issue (project-scoped) | Non | Oui |
| `close_issue` | Fermer une issue (project-scoped) | Non | Oui |

### Milestones

| Tool | Description | `group_id` requis | dry_run |
|------|-------------|:---:|:---:|
| `list_milestones` | Lister les milestones d'un groupe | Oui | — |
| `get_milestone` | Details d'un milestone | Oui | — |
| `create_milestone` | Creer un milestone | Oui | Oui |

### Utilitaires

| Tool | Description | `group_id` requis | dry_run |
|------|-------------|:---:|:---:|
| `list_groups` | Decouvrir les groupes accessibles | Non | — |
| `list_projects` | Lister les projets d'un groupe | Oui | — |
| `list_group_members` | Lister les membres d'un groupe | Oui | — |
| `get_current_user` | Verifier la connexion (info utilisateur) | Non | — |

## Exemples de prompts

- *"Liste mes groupes GitLab"*
- *"Liste les epics ouverts du groupe 42"*
- *"Montre-moi les issues avec le label bug dans le groupe wanadev"*
- *"Cree un epic 'Refonte homepage' dans le groupe 42 avec une echeance au 30 avril"*
- *"Quelles issues sont dans l'epic #42 du groupe wanadev ?"*
- *"Ferme l'issue #15 du projet 789"*
- *"Qui sont les membres du groupe wanadev ?"*

## Developpement

```bash
git clone https://github.com/wanadev/gitlab-mcp.git
cd gitlab-mcp
npm install
npm run build       # Build ESM (tsc)
npm run typecheck   # Verification TypeScript
npm run dev         # Build en mode watch
```

## Notes

- **`issue_id` vs `issue_iid`** : pour `add_issue_to_epic`, il faut l'ID global de l'issue (pas le numero affiche dans le projet). Les outils `list_issues` et `list_epic_issues` affichent les deux.
- **Mode lecture seule** : avec `GITLAB_READ_ONLY=true`, toute tentative de creation/modification retourne une erreur claire.
- **Erreur 403 sur les epics** : necessite une licence GitLab Premium ou Ultimate.
