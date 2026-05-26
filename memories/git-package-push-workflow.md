# Git package and push workflow

Use this memory when Richard asks to package a project, prepare a distributable zip, commit changes, or push to Git.

## General workflow

1. Inspect state first:
   - `git status --short --branch`
   - `git remote -v`
   - `git log --oneline --decorate -5`
   - `rg --files` or targeted file listing

2. Identify deliverables:
   - Source zip for code recipients.
   - Platform-specific app zip/exe for non-technical users.
   - Skill-only zip for AI-agent users.

3. Exclude local or sensitive files:
   - `config.json`
   - API keys, token files, local settings
   - `*.log`
   - `.assistant/`, `.claude/`, `.codex/`
   - `__pycache__/`, `.venv/`, `venv/`
   - `build/`, `dist-win/`, generated `.spec` files unless explicitly meant to be versioned
   - `.git/`

4. Verify generated archives before sharing:
   - `tar -tf <zip>`
   - Search archive listing for sensitive/unwanted patterns:
     `config.json|\.git/|\.assistant|\.claude|\.codex|__pycache__|\.log|\.venv|venv/|build/|\.spec`
   - If packaging a runnable app, unpack to a temporary directory and run a smoke test when feasible.

5. Commit only source-controlled changes:
   - Keep generated zips in ignored `dist/` unless Richard explicitly asks to version them.
   - Review with `git diff` and `git diff --cached --stat`.
   - Commit with a concise message describing user-facing value.

6. Push only after confirming branch/remote:
   - `git status --short --branch`
   - `git push origin <branch>`
   - Confirm with `git status --short --branch` and `git log --oneline --decorate -3`.

## compliance-checker specifics

Project path used in May 2026:
`C:\Users\richardyao\Desktop\project 2\compliance-checker`

Remote:
`gitlab.futunn.com:richardyao/compliance-checker-for-th.git`

Important deliverables:

- Windows exe zip:
  `dist\compliance-checker-for-th-windows-exe.zip`
- Skill-only zip:
  `dist\moomoo-th-compliance-check-skill.zip`
- Source zip:
  `dist\compliance-checker-for-th.zip`

Windows exe package structure should include:

- `START-HERE.md`
- `ComplianceCheckerTH\ComplianceCheckerTH.exe`
- `ComplianceCheckerTH\_internal\...`
- bundled `market check` regulation files

Skill package structure should include:

- `moomoo-th-compliance-check\SKILL.md`
- `moomoo-th-compliance-check\agents\openai.yaml`
- `moomoo-th-compliance-check\references\sec-regulations.txt`
- `moomoo-th-compliance-check\references\asco-regulations.txt`
- `moomoo-th-compliance-check\assets\regulations\*.docx`

When packaging `compliance-checker`, validate:

- No `config.json` in any shared zip.
- No logs in any shared zip.
- SEC and ASCO regulation files are included where needed.
- For exe zip, start the unpacked `ComplianceCheckerTH.exe` on a test port with `NO_BROWSER_OPEN=1`, then request `/api/config`; `sec_loaded` and `asco_loaded` should both be true.

Recent known commits:

- `a46663b Add Windows exe distribution notes`
- `fbf75dc Add moomoo Thailand compliance skill`

After `fbf75dc`, local and `origin/main` were confirmed synchronized.
