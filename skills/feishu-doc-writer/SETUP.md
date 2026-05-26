# Feishu Doc Writer Setup

这个文档说明如何配置 `feishu-doc-writer` skill。由于 writer 和 reader 共用同一个飞书 MCP URL，如果你已经配置过 `feishu-doc-reader`，通常无需额外操作。

## 前置条件

飞书 MCP 后台需要启用以下工具：

- `docx_builtin_import`（创建新文档）
- `docx_v1_documentBlockChildren_create`（追加内容到已有文档）
- `docx_v1_documentBlock_list`（追加时读取文档 block 结构）
- `wiki_v2_space_getNode`（解析 wiki URL，追加到 wiki 文档时需要）

如果你同时使用 `feishu-doc-reader`，还需要启用它所依赖的工具（`wiki_v2_space_getNode`、`docx_v1_documentBlock_list`、`docx_v1_document_rawContent`）。

## 已有 feishu-doc-reader 配置

如果你已经配置过 `feishu-doc-reader`（即 `feishu-doc-reader/config.json` 已存在），**无需做任何事**。脚本会自动读取 reader 的配置。

验证方式：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" --help
```

如果没有报 `FEISHU_MCP_URL is not set` 错误，说明配置已生效。

## 首次配置（未使用过 feishu-doc-reader）

### 1. 获取 FEISHU_MCP_URL

1. 打开飞书 MCP 页面：`https://open.feishu.cn/page/mcp/`
2. 复制你自己的 `FEISHU_MCP_URL`
3. 确认已启用 `docx_builtin_import` 工具

### 2. 配置方式（任选其一）

**方式 A：配置在 writer 自身目录**

```bash
cp "${CLAUDE_SKILL_DIR}/config.template.json" "${CLAUDE_SKILL_DIR}/config.json"
```

编辑 `config.json`，将 URL 替换为真实值：

```json
{
  "FEISHU_MCP_URL": "https://open.feishu.cn/mcp/stream/your-real-url"
}
```

**方式 B：配置在 reader 目录（推荐，两个 skill 共享）**

```bash
cp ~/.claude/skills/feishu-doc-reader/config.template.json ~/.claude/skills/feishu-doc-reader/config.json
```

同样编辑填入真实 URL。这样 reader 和 writer 都能使用。

**方式 C：使用环境变量**

```bash
export FEISHU_MCP_URL="https://open.feishu.cn/mcp/stream/your-real-url"
```

## 配置查找优先级

脚本按以下顺序查找 `FEISHU_MCP_URL`：

1. `feishu-doc-writer/config.json`（本 skill 目录）
2. `feishu-doc-reader/config.json`（reader 目录，自动复用）
3. 环境变量 `FEISHU_MCP_URL`

## 安全要求

- 真实 `FEISHU_MCP_URL` 只放在本地 `config.json` 或本地环境变量中
- 不要把包含真实密钥的 `config.json` 提交到代码仓库
- 仓库已通过 `.gitignore` 忽略本 skill 下的 `config.json`
- 如果需要分享配置方式，只分享 `config.template.json`

## 自检

### 检查帮助命令

```bash
node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" --help
```

### 测试创建文档

```bash
echo "# 测试\n\n这是一个测试文档。" | node "${CLAUDE_SKILL_DIR}/scripts/write-feishu-doc.js" create --title "配置测试"
```

成功时输出 JSON，包含 `url` 字段即为新文档链接。

### 常见问题

- `FEISHU_MCP_URL is not set or invalid`：检查 config.json 或环境变量是否配置正确
- `502 Bad Gateway` / `504 Gateway Timeout`：飞书 MCP 服务暂时不稳定，脚本会自动重试最多 3 次
- 创建成功但飞书文档内容为空：检查传入的 Markdown 是否格式正确
- 权限错误：检查飞书 MCP 后台是否已启用 `docx_builtin_import` 工具
