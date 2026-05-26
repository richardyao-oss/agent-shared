#!/usr/bin/env node

const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const { URL } = require('url')

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function loadMcpUrl() {
  // Try skill-local config.json first.
  const localConfig = path.resolve(__dirname, '..', 'config.json')

  try {
    const raw = fs.readFileSync(localConfig, 'utf-8')
    const config = JSON.parse(raw)

    if (config.FEISHU_MCP_URL) {
      return config.FEISHU_MCP_URL
    }
  } catch (_) {
    // Fall through.
  }

  // Try feishu-doc-reader's config.json (shared MCP URL).
  const readerConfig = path.resolve(__dirname, '..', '..', 'feishu-doc-reader', 'config.json')

  try {
    const raw = fs.readFileSync(readerConfig, 'utf-8')
    const config = JSON.parse(raw)

    if (config.FEISHU_MCP_URL) {
      return config.FEISHU_MCP_URL
    }
  } catch (_) {
    // Fall through.
  }

  return process.env.FEISHU_MCP_URL
}

const MCP_URL = loadMcpUrl()
const PROTOCOL_VERSION = '2024-11-05'
const CLIENT_INFO = { name: 'feishu-doc-writer', version: '1.0.0' }

let jsonRpcId = 0
let initPromise = null

// ---------------------------------------------------------------------------
// MCP transport (shared pattern with feishu-doc-reader)
// ---------------------------------------------------------------------------

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http

    const req = transport.request(
      url,
      {
        method: options.method || 'POST',
        headers: options.headers || {},
        timeout: 120000,
      },
      (res) => {
        const chunks = []

        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            contentType: res.headers['content-type'] || '',
            text,
          })
        })
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout (120s)'))
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

function parseSseResponse(text) {
  const lines = text.split('\n')
  let lastData = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data:')) {
      lastData = trimmed.slice(5).trim()
    }
  }

  if (!lastData) {
    throw new Error('No data received from SSE response')
  }

  const parsed = JSON.parse(lastData)

  if (parsed.error) {
    throw new Error(`Feishu MCP error: ${parsed.error.message || JSON.stringify(parsed.error)}`)
  }

  return parsed.result
}

async function sendJsonRpc(method, params) {
  if (!MCP_URL || !MCP_URL.includes('http')) {
    throw new Error(
      'FEISHU_MCP_URL is not set or invalid.\n' +
      'Options:\n' +
      '  1. Copy feishu-doc-reader/config.json (already configured? It will be shared automatically)\n' +
      '  2. Create config.json in this skill directory with { "FEISHU_MCP_URL": "..." }\n' +
      '  3. Set FEISHU_MCP_URL environment variable\n' +
      'Setup guide: see feishu-doc-reader/SETUP.md'
    )
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: ++jsonRpcId,
    method,
    params: params || {},
  })

  const response = await httpRequest(
    MCP_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
    },
    body
  )

  if (!response.ok) {
    let hint = ''
    if (response.status === 504) {
      hint = '\nHint: MCP gateway timeout — content may be too large for a single docx_builtin_import call.'
    } else if (response.status === 401) {
      hint = '\nHint: MCP URL token may have expired. Re-obtain the MCP URL from Feishu open platform.'
    }
    throw new Error(`Feishu MCP HTTP error: ${response.status} ${response.statusText}${hint}`)
  }

  if (response.contentType.includes('text/event-stream')) {
    return parseSseResponse(response.text)
  }

  const payload = JSON.parse(response.text)

  if (payload.error) {
    throw new Error(`Feishu MCP error: ${payload.error.message || JSON.stringify(payload.error)}`)
  }

  return payload.result
}

async function ensureInitialized() {
  if (initPromise) {
    return initPromise
  }

  initPromise = sendJsonRpc('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  })

  try {
    await initPromise
  } catch (err) {
    initPromise = null
    throw err
  }
}

async function callTool(name, args) {
  await ensureInitialized()
  return sendJsonRpc('tools/call', {
    name,
    arguments: args || {},
  })
}

// ---------------------------------------------------------------------------
// Content cleanup — fix terminal output artifacts
// ---------------------------------------------------------------------------

function cleanContent(raw) {
  let text = raw

  // Normalize line endings.
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Strip trailing whitespace from each line.
  text = text.split('\n').map(line => line.trimEnd()).join('\n')

  // Collapse 3+ consecutive blank lines into 2.
  text = text.replace(/\n{3,}/g, '\n\n')

  // Trim leading/trailing blank lines.
  text = text.trim()

  return text
}

// ---------------------------------------------------------------------------
// MCP payload normalization (same as feishu-doc-reader)
// ---------------------------------------------------------------------------

function tryParseJson(text) {
  if (typeof text !== 'string') {
    return null
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch (_) {
    return null
  }
}

function normalizeToolPayload(result) {
  if (!result || typeof result !== 'object') {
    return result
  }

  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item && typeof item.text === 'string') {
        const parsed = tryParseJson(item.text)
        if (parsed) {
          return parsed
        }
      }
    }
  }

  if (typeof result.text === 'string') {
    const parsed = tryParseJson(result.text)
    if (parsed) {
      return parsed
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// URL parsing and wiki resolution (shared with feishu-doc-reader)
// ---------------------------------------------------------------------------

function parseFeishuUrl(input) {
  let parsed

  try {
    parsed = new URL(input)
  } catch (_) {
    throw new Error('Invalid Feishu URL')
  }

  const origin = parsed.origin

  const wikiMatch = parsed.pathname.match(/\/wiki\/([^/?#]+)/)
  if (wikiMatch) {
    return { sourceType: 'wiki', wikiToken: wikiMatch[1], origin }
  }

  const docxMatch = parsed.pathname.match(/\/docx\/([^/?#]+)/)
  if (docxMatch) {
    return { sourceType: 'docx', documentId: docxMatch[1], origin }
  }

  throw new Error('Unsupported Feishu URL. Only /wiki/<token> and /docx/<document_id> are supported.')
}

async function resolveWikiDocument(wikiToken, origin) {
  const result = await callTool('wiki_v2_space_getNode', {
    query: { token: wikiToken },
  })

  const normalized = normalizeToolPayload(result)
  const node = normalized && normalized.data && normalized.data.node

  if (!node || !node.obj_token) {
    throw new Error(
      'Failed to resolve document_id from wiki node. ' +
      `API response: ${JSON.stringify(normalized, null, 2)}`
    )
  }

  const objType = node.obj_type || 'unknown'
  process.stderr.write(
    `Wiki node resolved: obj_token=${node.obj_token}, obj_type=${objType}, title=${node.title || '(none)'}\n`
  )

  if (objType !== 'docx' && objType !== 'doc') {
    throw new Error(
      `Wiki node obj_type is "${objType}" (expected "docx"). ` +
      'This skill only supports docx-type wiki pages.'
    )
  }

  if (objType === 'doc') {
    process.stderr.write(
      'Warning: Wiki node uses legacy "doc" format. ' +
      'Block-based APIs may not work correctly. Consider converting to "docx".\n'
    )
  }

  return {
    documentId: node.obj_token,
    title: node.title || null,
    wikiToken,
    origin,
  }
}

async function resolveDocumentId(urlOrId) {
  // Try as URL first.
  try {
    const parsed = parseFeishuUrl(urlOrId)

    if (parsed.sourceType === 'docx') {
      return { documentId: parsed.documentId, origin: parsed.origin }
    }

    // Wiki — need to resolve.
    const resolved = await resolveWikiDocument(parsed.wikiToken, parsed.origin)
    return resolved
  } catch (urlErr) {
    // If not a valid URL, treat as raw document_id.
    if (urlOrId && !urlOrId.includes('/')) {
      return { documentId: urlOrId }
    }

    throw urlErr
  }
}

// ---------------------------------------------------------------------------
// Block extraction from temporary document (import-based append)
// ---------------------------------------------------------------------------

const BLOCK_META_KEYS = new Set([
  'block_id', 'parent_id', 'children',
  'comment_ids', 'revision_id', 'update_time', 'create_time',
])

// Container block types that have children and require multi-step creation.
// Note: 31 (table) is handled separately with text fallback rendering.
const CONTAINER_BLOCK_TYPES = new Set([
  18, // synced_block
  19, // callout（暂不支持）
  24, // grid
  25, // grid_column
])

// Property keys that may contain an `elements` array (matches feishu-doc-reader).
const ELEMENT_CONTAINER_KEYS = [
  'text',
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5',
  'heading6', 'heading7', 'heading8', 'heading9',
  'bullet', 'ordered', 'code', 'quote', 'todo', 'callout',
  'page',
]

/**
 * Extract plain text from a block by finding the first property with an
 * `elements` array and concatenating all text_run.content values.
 */
function getBlockText(block) {
  for (const key of ELEMENT_CONTAINER_KEYS) {
    const prop = block[key]
    if (prop && Array.isArray(prop.elements)) {
      return prop.elements.map(el => {
        if (el.text_run) {
          const content = el.text_run.content || ''
          const style = el.text_run.text_element_style || {}

          let result = content

          if (style.inline_code) {
            result = `\`${result}\``
          } else {
            if (style.bold) {
              result = `**${result}**`
            }
            if (style.link && style.link.url) {
              let url = style.link.url
              try { url = decodeURIComponent(url) } catch (_) {}
              result = `[${result}](${url})`
            }
          }

          return result
        }
        return ''
      }).join('')
    }
  }
  return ''
}

/**
 * Render a table block as a Markdown-formatted text string.
 * Returns null if the table is empty or cannot be rendered.
 */
function renderTableAsText(tableBlock, blockMap) {
  function escapeTableCell(text) {
    return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  }

  const prop = tableBlock.table && tableBlock.table.property
  const cols = (prop && prop.column_size) || 0
  const cellIds = tableBlock.children || []

  if (!cols || !cellIds.length) {
    return null
  }

  const rows = []

  for (let i = 0; i < cellIds.length; i += cols) {
    const row = []

    for (let j = 0; j < cols; j++) {
      const cellId = cellIds[i + j]
      const cellBlock = cellId && blockMap.get(cellId)

      if (!cellBlock) {
        row.push('')
        continue
      }

      const childIds = cellBlock.children || []
      const cellParts = []

      for (const childId of childIds) {
        const child = blockMap.get(childId)
        if (child) {
          const text = getBlockText(child)
          if (text) {
            cellParts.push(text)
          }
        }
      }

      row.push(escapeTableCell(cellParts.join(' ')))
    }

    rows.push(row)
  }

  if (!rows.length) {
    return null
  }

  const mdLines = []
  const header = rows[0]
  mdLines.push('| ' + header.join(' | ') + ' |')
  mdLines.push('| ' + header.map(() => '---').join(' | ') + ' |')

  for (let r = 1; r < rows.length; r++) {
    mdLines.push('| ' + rows[r].join(' | ') + ' |')
  }

  return mdLines.join('\n')
}

/**
 * Fetch all blocks from a document, handling pagination.
 */
async function getAllDocumentBlocks(documentId) {
  const allBlocks = []
  let pageToken = null
  const MAX_PAGES = 100
  let pageCount = 0

  do {
    if (++pageCount > MAX_PAGES) {
      process.stderr.write(`Warning: Pagination exceeded ${MAX_PAGES} pages, stopping.\n`)
      break
    }

    const query = { page_size: 500 }
    if (pageToken) {
      query.page_token = pageToken
    }

    const result = await callTool('docx_v1_documentBlock_list', {
      path: { document_id: documentId },
      query,
    })

    const normalized = normalizeToolPayload(result)
    const data = normalized && normalized.data

    if (data && Array.isArray(data.items)) {
      allBlocks.push(...data.items)
    }

    pageToken = data && data.page_token
    if (!pageToken && data && data.has_more === false) {
      break
    }
  } while (pageToken)

  return allBlocks
}

/**
 * Strip read-only metadata fields from a block.
 * Does NOT recurse into children — the batch create API only accepts flat blocks.
 */
function cleanBlockForCreate(block) {
  const cleaned = {}

  for (const [key, value] of Object.entries(block)) {
    if (BLOCK_META_KEYS.has(key)) continue
    cleaned[key] = value
  }

  return cleaned
}

/**
 * Recursively flatten a block that has children (e.g. nested list/quote/todo).
 * The block itself is cleaned (children removed) and added first, then each
 * child is processed recursively. Container blocks (grid, callout, etc.) are
 * skipped; tables are rendered as code blocks.
 */
function flattenBlockWithChildren(block, blockMap, visited = new Set()) {
  if (visited.has(block.block_id)) return []
  visited.add(block.block_id)

  const result = []

  // Add the block itself (stripped of children).
  result.push(cleanBlockForCreate(block))

  const childIds = block.children
  if (!Array.isArray(childIds) || childIds.length === 0) {
    return result
  }

  for (const childId of childIds) {
    const child = blockMap.get(childId)
    if (!child) continue

    // Table — render as Markdown code block.
    if (child.block_type === 31) {
      const tableText = renderTableAsText(child, blockMap)
      if (tableText) {
        process.stderr.write(
          `Note: Table rendered as code block fallback (block_id=${child.block_id})\n`
        )
        result.push({
          block_type: 14,
          code: {
            elements: [{ text_run: { content: tableText, text_element_style: {} } }],
            style: { language: 1 },
          },
        })
      } else {
        process.stderr.write(
          `Warning: Skipping empty table block (block_id=${child.block_id})\n`
        )
      }
      continue
    }

    // Container blocks — skip with warning.
    if (CONTAINER_BLOCK_TYPES.has(child.block_type)) {
      process.stderr.write(
        `Warning: Skipping container block (block_type=${child.block_type}, ` +
        `block_id=${child.block_id}) — nested block creation is not yet supported.\n`
      )
      continue
    }

    // Regular block (with or without children) — recurse.
    result.push(...flattenBlockWithChildren(child, blockMap, visited))
  }

  return result
}

/**
 * Build a lookup map from flat block list and return the cleaned top-level
 * content blocks (direct children of the page block).
 * Leaf blocks are returned as-is (cleaned). Table blocks (type 31) are
 * rendered as Markdown text inside a code block. Other container blocks
 * (callout, grid, etc.) are skipped with a warning.
 */
function extractContentBlocks(blocks, documentId) {
  const blockMap = new Map()
  for (const block of blocks) {
    blockMap.set(block.block_id, block)
  }

  // Find the page block — its block_id equals the document_id,
  // or it has block_type 1 (page).
  let pageBlock = blockMap.get(documentId)
  if (!pageBlock || pageBlock.block_type !== 1) {
    for (const block of blocks) {
      if (block.block_type === 1) {
        pageBlock = block
        break
      }
    }
  }

  if (!pageBlock || !Array.isArray(pageBlock.children) || pageBlock.children.length === 0) {
    return []
  }

  const result = []

  for (const childId of pageBlock.children) {
    const child = blockMap.get(childId)
    if (!child) continue

    // Skip the page block type itself (should not appear as a child, but guard).
    if (child.block_type === 1) continue

    // Table block — render as Markdown text inside a code block.
    if (child.block_type === 31) {
      const tableText = renderTableAsText(child, blockMap)
      if (tableText) {
        process.stderr.write(
          `Note: Table rendered as code block fallback (block_id=${child.block_id})\n`
        )
        result.push({
          block_type: 14,
          code: {
            elements: [{ text_run: { content: tableText, text_element_style: {} } }],
            style: { language: 1 },
          },
        })
      } else {
        process.stderr.write(
          `Warning: Skipping empty table block (block_id=${child.block_id})\n`
        )
      }
      continue
    }

    // Container blocks (grid, callout, etc.) — skip with warning.
    if (CONTAINER_BLOCK_TYPES.has(child.block_type)) {
      process.stderr.write(
        `Warning: Skipping container block (block_type=${child.block_type}, ` +
        `block_id=${child.block_id}) — nested block creation is not yet supported.\n`
      )
      continue
    }

    // Block with children (e.g. nested list, quote, todo) — flatten recursively.
    const hasChildren = Array.isArray(child.children) && child.children.length > 0
    if (hasChildren) {
      result.push(...flattenBlockWithChildren(child, blockMap))
      continue
    }

    result.push(cleanBlockForCreate(child))
  }

  return result
}

/**
 * Attempt to delete a document. Returns true on success, false on failure.
 * Never throws — deletion failure is non-fatal (user may lack permission).
 */
async function tryDeleteDocument(documentId) {
  try {
    await callTool('drive_v1_file_delete', {
      path: { file_token: documentId },
      query: { type: 'docx' },
    })
    process.stderr.write('Temporary document deleted.\n')
    return true
  } catch (err) {
    process.stderr.write(
      `Note: Could not delete temporary document (token: ${documentId}). ` +
      'You may delete it manually from Feishu, ' +
      'or grant the "drive:file" permission scope. ' +
      `(${err.message})\n`
    )
    return false
  }
}

/**
 * Fetch the page block ID of a document. For standard docx documents the page
 * block_id equals the document_id, but for wiki-managed documents they may
 * differ. We fetch the first page of blocks and look for block_type 1 (page).
 */
async function getPageBlockId(documentId) {
  const result = await callTool('docx_v1_documentBlock_list', {
    path: { document_id: documentId },
    query: { page_size: 50 },
  })

  const normalized = normalizeToolPayload(result)
  const items = normalized && normalized.data && normalized.data.items

  if (Array.isArray(items)) {
    for (const block of items) {
      if (block.block_type === 1) {
        if (block.block_id !== documentId) {
          process.stderr.write(
            `Page block_id (${block.block_id}) differs from document_id (${documentId}). ` +
            'Using actual page block_id for append.\n'
          )
        }
        return block.block_id
      }
    }
  }

  // Fallback: assume page block_id == document_id (standard behavior).
  return documentId
}

/**
 * Append Markdown content to an existing document by:
 *  1. Creating a temporary document via docx_builtin_import (full Markdown fidelity)
 *  2. Extracting the rendered blocks from the temporary document
 *  3. Inserting those blocks into the target document
 *  4. Deleting the temporary document (best-effort)
 */
async function appendViaImport(documentId, markdown, addDivider) {
  // Step 1: Resolve target page block first (fast), then create temp doc.
  // Sequential to avoid temp doc leak if getPageBlockId fails.
  process.stderr.write('Resolving target page block...\n')
  const pageBlockId = await getPageBlockId(documentId)

  process.stderr.write('Creating temporary document for Markdown conversion...\n')
  const tempResult = await createDocument(markdown, `_tmp_append_${Date.now()}`)

  let tempDocId = null
  if (tempResult && tempResult.data && tempResult.data.result) {
    tempDocId = tempResult.data.result.token
  } else if (tempResult && tempResult.result) {
    tempDocId = tempResult.result.token
  } else if (tempResult && tempResult.token) {
    tempDocId = tempResult.token
  }

  if (!tempDocId) {
    throw new Error(
      'Failed to create temporary document — could not extract document token from response:\n' +
      JSON.stringify(tempResult, null, 2)
    )
  }

  process.stderr.write(`Temporary document created: ${tempDocId}\n`)

  try {
    // Step 2: Retrieve all blocks from the temporary document.
    process.stderr.write('Retrieving rendered blocks...\n')
    const allBlocks = await getAllDocumentBlocks(tempDocId)

    if (allBlocks.length === 0) {
      throw new Error('Temporary document returned no blocks')
    }

    // Step 3: Extract top-level content blocks (skip the page block itself).
    const contentBlocks = extractContentBlocks(allBlocks, tempDocId)

    if (contentBlocks.length === 0) {
      throw new Error('No content blocks found in temporary document')
    }

    // Prepend a divider if requested (default behaviour).
    const blocksToAppend = addDivider
      ? [{ block_type: 22, divider: {} }, ...contentBlocks]
      : contentBlocks

    // Step 4: Append blocks to the target document (with batching).
    process.stderr.write(
      `Appending ${blocksToAppend.length} blocks to target document (page block: ${pageBlockId})...\n`
    )
    const confirmedCount = await appendToDocument(documentId, pageBlockId, blocksToAppend)

    if (confirmedCount === 0 && blocksToAppend.length > 0) {
      throw new Error(
        `Feishu API confirmed 0 blocks created out of ${blocksToAppend.length} sent. ` +
        'The blocks may contain unsupported fields or structures.'
      )
    } else if (confirmedCount !== blocksToAppend.length) {
      process.stderr.write(
        `Warning: Sent ${blocksToAppend.length} blocks but API confirmed ${confirmedCount}.\n`
      )
    }

    return confirmedCount
  } finally {
    // Step 5: Clean up temporary document (best-effort, never throws).
    await tryDeleteDocument(tempDocId)
  }
}

// ---------------------------------------------------------------------------
// Append blocks to existing document (with batching)
// ---------------------------------------------------------------------------

// Feishu Block API silently drops blocks when too many are sent at once.
// Split into batches to ensure all blocks are written.
const APPEND_BATCH_SIZE = 50

async function appendBlockBatch(documentId, pageBlockId, blocks) {
  let lastError

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await callTool('docx_v1_documentBlockChildren_create', {
        path: {
          document_id: documentId,
          block_id: pageBlockId,
        },
        query: {
          document_revision_id: -1,
        },
        body: {
          children: blocks,
        },
      })

      const normalized = normalizeToolPayload(result)

      // Verify the API actually created blocks.
      // A successful HTTP response with empty/null children means silent failure.
      const created = normalized
        && normalized.data
        && normalized.data.children

      if (Array.isArray(created) && created.length === 0 && blocks.length > 0) {
        throw new Error(
          `Feishu API returned empty children array for ${blocks.length} blocks. ` +
          'Batch may exceed API limits.'
        )
      }

      // Return the count of blocks the API actually confirmed creating.
      const confirmedCount = Array.isArray(created) ? created.length : 0
      return { normalized, confirmedCount }
    } catch (err) {
      lastError = err

      if (attempt < 3 && /\b(502|503|504|Gateway|Timeout)\b/i.test(err.message)) {
        const delay = attempt * 5000
        process.stderr.write(`Retry ${attempt}/3 after ${delay / 1000}s (${err.message})\n`)
        await new Promise(r => setTimeout(r, delay))
        initPromise = null
        continue
      }

      throw err
    }
  }

  throw lastError
}

async function appendToDocument(documentId, pageBlockId, blocks) {
  if (blocks.length <= APPEND_BATCH_SIZE) {
    const { confirmedCount } = await appendBlockBatch(documentId, pageBlockId, blocks)
    return confirmedCount
  }

  // Split into batches.
  const totalBatches = Math.ceil(blocks.length / APPEND_BATCH_SIZE)
  let totalConfirmed = 0

  for (let i = 0; i < blocks.length; i += APPEND_BATCH_SIZE) {
    const batch = blocks.slice(i, i + APPEND_BATCH_SIZE)
    const batchNum = Math.floor(i / APPEND_BATCH_SIZE) + 1

    process.stderr.write(
      `Writing batch ${batchNum}/${totalBatches} (${batch.length} blocks)...\n`
    )

    const { confirmedCount } = await appendBlockBatch(documentId, pageBlockId, batch)
    totalConfirmed += confirmedCount
  }

  return totalConfirmed
}

// ---------------------------------------------------------------------------
// Create document via docx_builtin_import
// ---------------------------------------------------------------------------

async function createDocument(markdown, fileName) {
  const args = { markdown }

  if (fileName) {
    // Strip common document extensions — Feishu titles shouldn't have them.
    args.file_name = fileName.replace(/\.(md|markdown|txt|html|htm)$/i, '')
  }

  // No retry for create — docx_builtin_import is NOT idempotent.
  // A 504 timeout may mean the doc was already created server-side;
  // retrying would produce a duplicate document.
  const result = await callTool('docx_builtin_import', args)
  return normalizeAndExtract(result)
}

function normalizeAndExtract(result) {
  const normalized = normalizeToolPayload(result)

  // The docx_builtin_import response often wraps the real result in a text
  // string like "导入文档成功:{json}". Try to extract the inner JSON.
  if (typeof normalized === 'string') {
    const jsonStart = normalized.indexOf('{')

    if (jsonStart !== -1) {
      const inner = tryParseJson(normalized.slice(jsonStart))

      if (inner) {
        return inner
      }
    }
  }

  // Also handle the content[].text wrapper.
  if (normalized && Array.isArray(normalized.content)) {
    for (const item of normalized.content) {
      if (item && typeof item.text === 'string') {
        const jsonStart = item.text.indexOf('{')

        if (jsonStart !== -1) {
          const inner = tryParseJson(item.text.slice(jsonStart))

          if (inner) {
            return inner
          }
        }
      }
    }
  }

  return normalized
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(
    'Feishu Doc Writer\n\n' +
    'Commands:\n' +
    '  create   Create a new Feishu document from Markdown content\n' +
    '  append   Append content to an existing Feishu document\n\n' +
    'Usage:\n' +
    '  node write-feishu-doc.js create [--title <title>] [--file <path>] [--content <text>]\n' +
    '  node write-feishu-doc.js append --url <feishu_url> [--file <path>] [--content <text>]\n' +
    '  echo "content" | node write-feishu-doc.js create [--title <title>]\n' +
    '  echo "content" | node write-feishu-doc.js append --url <feishu_url>\n\n' +
    'Content source (in priority order):\n' +
    '  --file <path>     Read content from a file\n' +
    '  --content <text>  Use inline text\n' +
    '  stdin             Pipe content via stdin (when not a TTY)\n\n' +
    'Options:\n' +
    '  --title <title>   Document title (create only)\n' +
    '  --url <url>       Feishu wiki/docx URL or document_id (append only)\n' +
    '  --no-clean        Skip content cleanup (trailing whitespace, blank lines)\n' +
    '  --no-divider      Do not insert a divider before appended content (append only)\n\n' +
    'By default, trailing whitespace and excessive blank lines are cleaned up.\n' +
    'When appending, a divider (---) is inserted before the new content by default.'
  )
}

function parseArgs(args) {
  const result = {
    command: null, title: null, file: null, content: null,
    clean: true, url: null, divider: true,
  }

  let i = 0

  if (args.length > 0 && !args[0].startsWith('-')) {
    result.command = args[0]
    i = 1
  }

  while (i < args.length) {
    const arg = args[i]

    if (arg === '--title' && i + 1 < args.length) {
      result.title = args[++i]
    } else if (arg === '--file' && i + 1 < args.length) {
      result.file = args[++i]
    } else if (arg === '--content' && i + 1 < args.length) {
      result.content = args[++i]
    } else if (arg === '--url' && i + 1 < args.length) {
      result.url = args[++i]
    } else if (arg === '--no-clean') {
      result.clean = false
    } else if (arg === '--no-divider') {
      result.divider = false
    }

    i++
  }

  return result
}

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve(null)
      return
    }

    const chunks = []
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(chunks.join('')))
    process.stdin.on('error', reject)
  })
}

async function main() {
  const args = process.argv.slice(2)
  const parsed = parseArgs(args)

  if (!parsed.command || parsed.command === '--help' || parsed.command === '-h') {
    printHelp()
    process.exit(0)
  }

  if (parsed.command !== 'create' && parsed.command !== 'append') {
    console.error(`Unknown command: ${parsed.command}`)
    process.exit(1)
  }

  try {
    // Resolve content from file, inline, or stdin.
    let content = null

    if (parsed.file) {
      content = fs.readFileSync(parsed.file, 'utf-8')
    } else if (parsed.content) {
      content = parsed.content
    } else {
      content = await readStdin()
    }

    if (!content || !content.trim()) {
      throw new Error(
        'No content provided.\n' +
        'Use --file <path>, --content <text>, or pipe via stdin.'
      )
    }

    // Clean up terminal artifacts by default.
    if (parsed.clean) {
      content = cleanContent(content)
    }

    if (parsed.command === 'create') {
      // Large content (> 4KB) triggers MCP gateway timeout on docx_builtin_import.
      // Strategy: create with title-only placeholder, then append full content.
      const IMPORT_SIZE_LIMIT = 4000
      const isLarge = Buffer.byteLength(content, 'utf-8') > IMPORT_SIZE_LIMIT

      let result
      if (isLarge) {
        process.stderr.write(
          `Content is ${Buffer.byteLength(content, 'utf-8')} bytes (> ${IMPORT_SIZE_LIMIT}). ` +
          'Using chunked create (create + append) to avoid gateway timeout.\n'
        )
        result = await createDocument(
          `# ${parsed.title || 'Untitled'}`,
          parsed.title,
        )
      } else {
        result = await createDocument(content, parsed.title)
      }

      // Extract document URL from the (possibly nested) response.
      let url = null
      let token = null

      if (result && result.data && result.data.result) {
        url = result.data.result.url || null
        token = result.data.result.token || null
      } else if (result && result.result) {
        url = result.result.url || null
        token = result.result.token || null
      } else if (result && result.url) {
        url = result.url
        token = result.token || null
      }

      // For large content, append the full content to the newly created doc.
      if (isLarge && token) {
        process.stderr.write('Appending full content to the new document...\n')
        await appendViaImport(token, content, false)
      }

      console.log(JSON.stringify({
        success: true,
        command: 'create',
        title: parsed.title || null,
        url,
        token,
        contentLength: content.length,
      }, null, 2))
    } else if (parsed.command === 'append') {
      if (!parsed.url) {
        throw new Error(
          'Missing --url parameter.\n' +
          'Usage: node write-feishu-doc.js append --url <feishu_url> --file <path>'
        )
      }

      const resolved = await resolveDocumentId(parsed.url)
      const blocksAppended = await appendViaImport(
        resolved.documentId,
        content,
        parsed.divider,
      )

      // Preserve the original wiki URL when the source was a wiki link.
      const baseUrl = resolved.origin || 'https://futu.feishu.cn'
      const url = resolved.wikiToken
        ? `${baseUrl}/wiki/${resolved.wikiToken}`
        : `${baseUrl}/docx/${resolved.documentId}`

      console.log(JSON.stringify({
        success: true,
        command: 'append',
        documentId: resolved.documentId,
        title: resolved.title || null,
        url,
        blocksAppended,
        contentLength: content.length,
      }, null, 2))
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  cleanContent,
  createDocument,
  appendToDocument,
  appendViaImport,
  extractContentBlocks,
  parseFeishuUrl,
  resolveDocumentId,
  loadMcpUrl,
}
