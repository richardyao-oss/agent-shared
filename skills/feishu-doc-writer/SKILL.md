---
name: feishu-doc-writer
description: "Use when the user wants to write or save content to a new Feishu/Lark cloud document, or append content to an existing one via URL. Covers saving task output, conversation results, or any text/markdown to Feishu. Keywords: feishu doc write, feishu create doc, feishu append, lark doc write, 写入飞书文档, 保存到飞书, 追加飞书文档, 飞书新建文档, 飞书写文档, 存入飞书."
argument-hint: "[content description, --file path, or feishu URL for append]"
---

# Feishu Doc Writer

这个 skill 负责两件事：

1. **创建新文档**：将内容写入一个新的飞书云文档
2. **追加到已有文档**：将内容追加到用户指定 URL 的飞书文档末尾

它适用于用户希望把文本、Markdown、任务输出等内容保存为飞书文档的场景。

它不负责读取文档、搜索文档、操作多维表格或其他飞书工作区操作。

## 适用场景

- 用户说"把这个写入飞书文档"、"保存到飞书"
- 用户说"上一个任务的输出写入飞书"
- 用户想把分析结果、总结、代码审查等内容存入飞书
- 用户提供了一个文件，希望将其内容上传为飞书文档
- 用户提供了飞书文档 URL，希望往该文档追加内容

## 不适用场景

- 读取飞书文档（使用 feishu-doc-reader）
- 替换已有文档的内容（只支持追加，不支持覆盖）
- 搜索飞书文档
- 操作多维表格、消息、日历、任务

## 判断使用哪个命令

- 用户**没有**提供飞书文档 URL → 使用 `create` 创建新文档
- 用户**提供了**飞书文档 URL，希望往里面加内容 → 使用 `append` 追加到已有文档

## 核心流程

### 第一步：确定内容

根据用户意图确定要写入的内容：

- 如果用户说"上一个任务的输出"，收集当前会话中最近一个任务的完整输出
- 如果用户指定了文件，读取文件内容
- 如果用户直接提供了文本，使用该文本

### 第二步：整理格式

AI 输出在终端中常常带有多余空格和格式问题。在写入前必须整理：

- 去除每行尾部空格
- 合并过多的连续空行（3 行以上压缩为 2 行）
- 去除首尾空白
- 确保 Markdown 格式正确（标题层级、列表缩进、代码块）

脚本默认自动执行这些清理。如果内容已经是格式良好的 Markdown，可加 `--no-clean` 跳过。

### 第三步：写入飞书

**创建新文档**：将整理好的内容写入临时文件，然后调用脚本：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" create --title "文档标题" --file /tmp/feishu-content.md
```

**追加到已有文档**：用户提供了飞书 URL 时，使用 `append` 命令：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" append --url "<feishu_url>" --file /tmp/feishu-content.md
```

支持 wiki URL（`/wiki/<token>`）、docx URL（`/docx/<document_id>`）和直接 `document_id`。

追加时默认在新内容前插入一条分割线（`---`），方便区分已有内容和追加内容。如不需要分割线，加 `--no-divider`。

### 第四步：确认结果

- 脚本成功后会输出 JSON，包含文档链接（`url`）
- 将 `url` 直接告知用户，方便点击访问
- 如果失败，原样展示错误信息

## 内容准备要点

当用户说"上一个任务的输出"或类似表述时：

1. 回顾当前会话中最近完成的任务
2. 收集该任务的完整输出（不是摘要）
3. 用 Markdown 格式组织内容
4. 写入临时文件再调用脚本（避免 shell 转义问题）

**推荐做法**：始终将内容先写入 `/tmp/feishu-content-<timestamp>.md`，再用 `--file` 参数传给脚本。这避免了内容过长或包含特殊字符导致的 shell 问题。

## 命令参考

### 创建新文档

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" create --title "周报" --file /tmp/weekly-report.md
```

### 追加到已有文档

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" append --url "https://futu.feishu.cn/docx/xxx" --file /tmp/new-content.md
```

Wiki URL 也支持：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" append --url "https://futu.feishu.cn/wiki/xxx" --file /tmp/new-content.md
```

### 追加时不加分割线

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" append --url "https://futu.feishu.cn/docx/xxx" --file /tmp/content.md --no-divider
```

### 从 stdin 写入

```bash
cat /tmp/analysis.md | node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" create --title "分析报告"
cat /tmp/content.md | node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" append --url "<feishu_url>"
```

### 跳过内容清理

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" create --title "原始输出" --file /tmp/raw.md --no-clean
```

## 输出格式

### create 命令

- `success`: `true`
- `command`: `create`
- `title`: 文档标题
- `url`: 新创建的飞书文档链接
- `token`: 文档 token
- `contentLength`: 写入内容长度（清理后）

### append 命令

- `success`: `true`
- `command`: `append`
- `documentId`: 目标文档 ID
- `title`: 文档标题（如果通过 wiki URL 可获取）
- `url`: 目标文档链接
- `blocksAppended`: 追加的 block 数量
- `contentLength`: 追加内容长度（清理后）

操作成功后，将 `url` 直接告知用户。

**实现原理**：`append` 命令通过先创建临时文档（使用与 `create` 相同的 `docx_builtin_import` API），再将临时文档中的 block 提取并插入到目标文档，最后尝试删除临时文档。这确保 `append` 与 `create` 拥有完全相同的 Markdown 渲染保真度（表格、嵌套列表、代码高亮等均完整支持）。

**临时文档清理**：脚本会自动尝试删除临时文档。如果用户未授予 `drive:file` 删除权限，脚本会在 stderr 输出提示，不影响追加操作本身。用户可以手动从飞书云空间删除以 `_tmp_append_` 开头的文档。

**自动分批**：飞书 Block API 单次写入超过约 50 个 block 时会静默丢失数据。脚本自动将大内容拆分为每批最多 50 个 block 分批写入，进度输出到 stderr。调用方无需手动拆分。

## Markdown 格式支持

`create` 和 `append` 命令均使用飞书原生 Markdown 导入（`docx_builtin_import`），支持完整的 Markdown 语法，包括但不限于：

- 标题（`#` ~ `######`）
- 表格（`| col | col |` 语法）
- 嵌套列表（有序、无序、多级缩进）
- 代码块（带语言高亮）
- 引用、分割线、待办事项
- 加粗、斜体、删除线、行内代码、链接
- 以及飞书服务端支持的其他 Markdown 扩展

**表格在 append 中的处理**：`append` 命令中，由于飞书 Block API 不支持通过 batch create 递归创建表格等容器块，表格内容会自动提取纯文本并以 code block（Markdown 表格语法）的形式追加到目标文档。`create` 命令不受影响，仍然生成飞书原生表格。这是 append 路径的已知限制。

## 配置说明

脚本按以下顺序查找 `FEISHU_MCP_URL`：

1. 本 skill 目录下的 `config.json`
2. `feishu-doc-reader` 目录下的 `config.json`（自动复用）
3. 环境变量 `FEISHU_MCP_URL`

如果已经配置过 feishu-doc-reader，无需额外配置。

完整配置步骤、模板用法和常见问题，见同目录下的 `SETUP.md`。

## 错误处理

- `FEISHU_MCP_URL` 缺失或无效：把错误原样展示给用户，提示配置方式
- 内容为空：提示用户提供内容
- `502`/`504` 网关错误：脚本自动重试最多 3 次，间隔递增
- 其他 API 错误：把飞书返回错误原样展示给用户

## 安全要求

- 真实 `FEISHU_MCP_URL` 只放在本地 `config.json` 或本地环境变量中
- 不要把包含真实密钥的 `config.json` 提交到代码仓库
- 仓库已通过 `.gitignore` 忽略本 skill 下的 `config.json`
- 如果需要分享配置方式，只分享 `config.template.json`，不要分享真实 URL

不要在输出中泄露完整 MCP URL。

## 验证

- 确认用户明确要求了"写入飞书"、"保存到飞书"等操作
- 确认内容非空且格式合理
- 确认脚本输出包含 `url` 或清晰的错误信息
- 如遇失败，优先检查 `FEISHU_MCP_URL` 配置和 MCP 后台工具启用情况

## Guardrails

- 只创建新文档或追加到已有文档，不覆盖/替换已有内容
- 不在用户未明确要求的情况下创建或修改文档
- 不猜测用户想写入的内容——不确定时先确认
- 追加时必须确认用户提供了正确的目标文档 URL
- 不吞掉飞书原始错误
- 不在输出中泄露完整 MCP URL

## 避免

- 把这个 skill 写成通用飞书操作入口
- 在用户没有说要写入飞书的情况下主动创建文档
- 对写入内容做静默截断且不说明
- 忽略内容格式清理——终端输出的原始文本通常不适合直接写入
- 在没有用户确认的情况下往已有文档追加大量内容
