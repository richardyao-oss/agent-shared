# Feishu docx writing notes

- Local Feishu helper path: `C:\Users\richardyao\.claude\feishu`.
- Auth/status command: `py $env:USERPROFILE\.claude\feishu\cli.py status`; authorize with `py $env:USERPROFILE\.claude\feishu\cli.py auth --force`.
- Existing CLI supports `auth`, `status`, `logout`, `create`, and `read`.
- CLI can create a new document from Markdown: `py $env:USERPROFILE\.claude\feishu\cli.py create --title "..." --md "..."`.
- CLI `read` reads docx raw content by doc id: `py $env:USERPROFILE\.claude\feishu\cli.py read <doc_id>`.
- Existing CLI does not expose a general edit/update command for existing docs.
- Underlying library is `C:\Users\richardyao\.claude\feishu\lib\feishu_doc.py`.
- The Markdown quote parser in `feishu_doc.markdown_to_blocks()` currently converts `>` quote lines into italic text blocks, not real Feishu quote blocks. Do not rely on Markdown `>` when true quote formatting matters.
- To append to an existing doc, use Feishu docx descendant API through `feishu_doc._post()`:
  `https://open.feishu.cn/open-apis/docx/v1/documents/{doc_id}/blocks/{doc_id}/descendant`
- Real quote block works with block type `34` and key `quote_container`, with a text child block:
  `{"block_id":"quote1","block_type":34,"quote_container":{},"children":["quote_text1"]}`
  plus child:
  `{"block_id":"quote_text1","block_type":2,"text":{"elements":[{"text_run":{"content":"..."}}]}}`
- Ordered list block works with block type `13` and key `ordered`:
  `{"block_id":"ord1","block_type":13,"ordered":{"elements":[{"text_run":{"content":"..."}}]}}`
- Heading2 block type is `4` with key `heading2`; normal text block type is `2` with key `text`; bullet list block type is `12` with key `bullet`.
- Use temporary `block_id` values in `children_id` and `descendants`; Feishu returns `block_id_relations` mapping temporary ids to real block ids.
- After writing, open the doc with `Start-Process "https://feishu.cn/docx/<doc_id>"`.
- Verified test doc: `https://feishu.cn/docx/IgyLdBlrJoCQKkxCZE2cE4MDnJh`.
