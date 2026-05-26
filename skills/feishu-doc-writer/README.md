# Feishu Doc Writer

Write text or Markdown content to Feishu cloud documents. Two modes are supported:

- **Create** (`create`): Import Markdown content as a new Feishu document
- **Append** (`append`): Append content to the end of an existing Feishu document by URL

将文本或 Markdown 内容写入飞书云文档。支持两种模式：

- **创建新文档**（`create`）：将 Markdown 内容导入为新的飞书文档
- **追加到已有文档**（`append`）：将内容追加到指定 URL 的飞书文档末尾

## Key Features / 核心特性

- **Full Markdown fidelity**: Uses Feishu native import (`docx_builtin_import`) — tables, nested lists, code highlighting all preserved / 完整 Markdown 保真：使用飞书原生导入，表格、嵌套列表、代码高亮均完整保留
- **Import-based append**: Append uses same import API as create for consistent rendering quality / 基于导入的追加：append 与 create 使用相同的导入 API，渲染质量一致
- **Auto-chunking for large content**: Automatically splits large content to avoid MCP gateway timeout / 大内容自动分块：避免 MCP 网关超时
- **Auto-batching (50+ blocks)**: Splits into batches of 50 blocks to prevent silent data loss / 自动分批（50+ blocks）：避免飞书 Block API 静默丢失数据
- **Retry on gateway errors**: Auto-retries on 502/504 with backoff / 网关错误自动重试

## Content Cleanup / 内容清理

AI terminal output often contains extra whitespace. The script cleans it up by default:

AI 在终端中的输出常带有多余空格。脚本默认自动清理：

| Issue / 问题 | Handling / 处理方式 |
|------|---------|
| Trailing spaces / 行尾空格 | Auto-removed / 自动去除 |
| Excessive blank lines (3+) / 连续空行过多 | Collapsed to 2 / 压缩为 2 行 |
| Leading/trailing whitespace / 首尾空白 | Auto-trimmed / 自动去除 |
| `\r\n` line endings / 换行符 | Normalized to `\n` / 统一为 `\n` |

Skip cleanup with `--no-clean` if the content is already well-formatted Markdown.

如果内容已经是格式良好的 Markdown，可加 `--no-clean` 跳过清理。

## Input Methods / 输入方式

| Method / 方式 | Usage / 用法 |
|------|------|
| File / 文件 | `--file /path/to/content.md` |
| Inline text / 内联文本 | `--content "# Title\nContent"` |
| Pipe / 管道 | `cat file.md \| node write-feishu-doc.js create` |

`--file` is recommended to avoid shell escaping issues.

推荐使用 `--file` 方式，避免 shell 转义问题。

## Use Cases / 适用场景

- Save task output or analysis results to Feishu / 把任务输出、分析结果写入飞书文档
- Save conversation summaries as Feishu documents / 把会话中的总结保存为飞书文档
- Upload local file content as a Feishu document / 把本地文件内容上传为飞书文档
- Append new content to an existing Feishu document by URL / 往已有飞书文档追加新内容

## Config Reuse / 配置复用

No extra config needed if `feishu-doc-reader` is already set up — the script auto-reads its `config.json`.

如果已经配置过 `feishu-doc-reader`，无需额外配置。脚本会自动读取 `feishu-doc-reader` 的 `config.json`。

## Tags / 标签

Feishu Doc, Write Doc, Create Doc, Append Doc, MCP, Markdown Import, Block API, Content Cleanup, Auto Chunking

飞书文档, 写入文档, 创建文档, 追加文档, MCP, Markdown 导入, Block API, 内容清理, 自动分块
