# Feishu docx Tool

Use this when Richard asks to create, read, or append Feishu/Lark cloud docs.

## Source of Truth

- Memory: `C:\Users\richardyao\agent-shared\memories\feishu-docx.md`
- Existing CLI: `C:\Users\richardyao\.claude\feishu\cli.py`
- Existing library: `C:\Users\richardyao\.claude\feishu\lib\feishu_doc.py`

## Commands

```powershell
py $env:USERPROFILE\.claude\feishu\cli.py status
py $env:USERPROFILE\.claude\feishu\cli.py auth --force
py $env:USERPROFILE\.claude\feishu\cli.py create --title "Title" --md "# Heading"
py $env:USERPROFILE\.claude\feishu\cli.py read <doc_id>
```

## Important Notes

- Do not store token/config copies in `agent-shared`.
- Markdown `>` in the current helper becomes italic text, not a true quote block.
- For true quote blocks and ordered lists in existing docs, use the docx descendant API pattern documented in `memories/feishu-docx.md`.
