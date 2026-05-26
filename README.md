# Agent Shared

Shared capability directory for Claude, Codex, and other local AI agents.

## Layout

- `skills/`: reusable cross-agent skills and skill source copies.
- `memories/`: durable operational knowledge and user preferences.
- `tools/`: wrapper scripts and tool usage notes. Secrets must not live here.
- `templates/`: reusable templates and boilerplate.
- `docs/`: index and operating notes for the shared layer.

## Current Shared Capabilities

- Feishu docx writing and append workflow: `memories/feishu-docx.md`, `tools/feishu-docx/`.
- Git package and push workflow: `memories/git-package-push-workflow.md`, `tools/git-package-push/`.
- Frontend/design workflow preference: `memories/frontend-design-preferences.md`, `skills/huashu-design/`.
- Feishu doc writer skill source: `skills/feishu-doc-writer/`.

## Git Remotes

- GitLab: `git@gitlab.futunn.com:richardyao/agent-shared.git`
- GitHub: `git@github.com:richardyao-oss/agent-shared.git`

On this Windows machine, pushes may need the explicit SSH key:

```powershell
$key = ($env:USERPROFILE -replace '\\','/') + '/.ssh/id_ed25519_gitlab_futunn'
$env:GIT_SSH_COMMAND = "ssh -i $key -o IdentitiesOnly=yes"
```

## Rules

- Do not store tokens, API keys, OAuth secrets, `.env`, logs, session history, or cache files here.
- Keep agent-specific runtime files in `.claude/` or `.codex/`.
- Put reusable instructions, scripts, templates, and skill source here.
- When an agent learns a reusable workflow, write it under `memories/` and add or update a short pointer in that agent's own memory system.
