# Git Package Push Tool

Use this when Richard asks to package deliverables, verify zip contents, commit, or push.

## Source of Truth

- Memory: `C:\Users\richardyao\agent-shared\memories\git-package-push-workflow.md`

## Standard Checks

```powershell
git status --short --branch
git remote -v
git log --oneline --decorate -5
```

## Archive Verification

```powershell
tar -tf <zip>
tar -tf <zip> | Select-String -Pattern 'config.json|\.git/|\.assistant|\.claude|\.codex|__pycache__|\.log|\.venv|venv/|build/|\.spec'
```

## Push Verification

```powershell
git push origin <branch>
git status --short --branch
git log --oneline --decorate -3
```
