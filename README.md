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

### 3. Redemarrer Claude Desktop

Le serveur MCP sera disponible immediatement. Testez avec : *"Qui suis-je sur GitLab ?"*

## Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `GITLAB_TOKEN` | Oui | Personal Access Token GitLab |
| `GITLAB_GROUP_ID` | Oui | ID ou chemin du groupe (ex: `12345` ou `wanadev`) |
| `GITLAB_BASE_URL` | Non | URL de l'instance GitLab (defaut: `https://gitlab.com`) |
| `GITLAB_READ_ONLY` | Non | `true` pour bloquer toutes les operations d'ecriture |

## Les 18 tools disponibles

### Epics (necessite GitLab Premium/Ultimate)

| Tool | Description |
|------|-------------|
| `list_epics` | Lister les epics (filtre par etat, recherche, labels) |
| `get_epic` | Details d'un epic par numero |
| `create_epic` | Creer un epic |
| `update_epic` | Modifier un epic |
| `close_epic` | Fermer un epic |
| `list_epic_issues` | Issues rattachees a un epic |
| `add_issue_to_epic` | Rattacher une issue a un epic |

### Issues

| Tool | Description |
|------|-------------|
| `list_issues` | Lister les issues du groupe |
| `get_issue` | Details d'une issue |
| `create_issue` | Creer une issue |
| `update_issue` | Modifier une issue |
| `close_issue` | Fermer une issue |

### Milestones

| Tool | Description |
|------|-------------|
| `list_milestones` | Lister les milestones du groupe |
| `get_milestone` | Details d'un milestone |
| `create_milestone` | Creer un milestone |

### Utilitaires

| Tool | Description |
|------|-------------|
| `list_projects` | Lister les projets du groupe |
| `list_group_members` | Lister les membres du groupe |
| `get_current_user` | Verifier la connexion (info utilisateur) |

## Exemples de prompts

- *"Liste les epics ouverts du groupe Wanadev"*
- *"Montre-moi les issues avec le label bug"*
- *"Cree un epic 'Refonte homepage' avec une echeance au 30 avril"*
- *"Quelles issues sont dans l'epic #42 ?"*
- *"Ferme l'issue #15 du projet 789"*
- *"Qui sont les membres du groupe ?"*

## Developpement

```bash
cd packages/mcp-gitlab
npm install
npm run build       # Build ESM + CJS
npm run typecheck   # Verification TypeScript
npm run dev         # Build en mode watch
```

## Notes

- **`issue_id` vs `issue_iid`** : pour `add_issue_to_epic`, il faut l'ID global de l'issue (pas le numero affiche dans le projet). Les outils `list_issues` et `list_epic_issues` affichent les deux.
- **Mode lecture seule** : avec `GITLAB_READ_ONLY=true`, toute tentative de creation/modification retourne une erreur claire.
- **Erreur 403 sur les epics** : necessite une licence GitLab Premium ou Ultimate.
