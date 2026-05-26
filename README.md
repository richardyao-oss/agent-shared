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

## Rules

- Do not store tokens, API keys, OAuth secrets, `.env`, logs, session history, or cache files here.
- Keep agent-specific runtime files in `.claude/` or `.codex/`.
- Put reusable instructions, scripts, templates, and skill source here.
- When an agent learns a reusable workflow, write it under `memories/` and add or update a short pointer in that agent's own memory system.
