import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import nginx from 'highlight.js/lib/languages/nginx'
import yaml from 'highlight.js/lib/languages/yaml'
import json from 'highlight.js/lib/languages/json'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import ruby from 'highlight.js/lib/languages/ruby'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import ini from 'highlight.js/lib/languages/ini'
import plaintext from 'highlight.js/lib/languages/plaintext'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('nginx', nginx)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('plaintext', plaintext)

/** Escape raw HTML so user-written content can never inject markup. */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Slugify a heading so it can be linked from the table of contents. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Inline formatting: `code`, **bold**, ==highlight==, [label](url).
 * Code spans are extracted first so their contents are never re-processed.
 */
export function formatInline(text) {
  const codeSpans = []
  let html = escapeHtml(text ?? '')

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code)
    return `\u0000${codeSpans.length - 1}\u0000`
  })
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`)
  return html
}

const CALLOUT_ICON = {
  info: 'ℹ️',
  tip: '💡',
  warning: '⚠️',
  danger: '🚨',
}

function highlightCode(code, language) {
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value
    }
    // Unknown language (e.g. promql/kql): render plain, escaped code.
    return escapeHtml(code)
  } catch {
    return escapeHtml(code)
  }
}

/** Render one block object to HTML. */
export function renderBlock(block, index) {
  switch (block.type) {
    case 'heading': {
      const tag = block.level === 3 ? 'h3' : 'h2'
      const id = slugify(block.text)
      return `<${tag} id="${id}">${escapeHtml(block.text)}</${tag}>`
    }
    case 'paragraph':
      return `<p>${formatInline(block.text)}</p>`
    case 'callout': {
      const t = ['info', 'tip', 'warning', 'danger'].includes(block.kind) ? block.kind : 'info'
      const title = block.title ? `<div class="callout-title">${CALLOUT_ICON[t]} ${escapeHtml(block.title)}</div>` : ''
      return `<div class="callout callout-${t}">${title}<div>${formatInline(block.text)}</div></div>`
    }
    case 'code': {
      const lang = block.language || 'plaintext'
      const filename = block.filename
        ? `<span class="font-mono text-xs opacity-80">${escapeHtml(block.filename)}</span>`
        : `<span class="font-mono text-xs opacity-80">${escapeHtml(lang)}</span>`
      const highlighted = highlightCode(block.code ?? '', lang)
      return `<div class="codeblock">
        <div class="flex items-center justify-between px-4 py-2 text-slate-300 border-b border-white/10">
          ${filename}
          <button class="copy-btn text-xs px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 transition" data-code-index="${index}">📋 Salin</button>
        </div>
        <pre><code class="language-${escapeHtml(lang)}">${highlighted}</code></pre>
      </div>`
    }
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      const items = (block.items || []).map((item) => `<li>${formatInline(item)}</li>`).join('')
      return `<${tag}>${items}</${tag}>`
    }
    case 'table': {
      const headers = (block.headers || []).map((h) => `<th>${formatInline(h)}</th>`).join('')
      const rows = (block.rows || [])
        .map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`)
        .join('')
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
    }
    case 'quote':
      return `<blockquote><p>${formatInline(block.text)}</p>${block.cite ? `<footer>— ${escapeHtml(block.cite)}</footer>` : ''}</blockquote>`
    case 'image':
      return `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.caption || '')}" loading="lazy" class="w-full rounded-xl" onerror="this.onerror=null;this.src=window.__WIKI_FALLBACK_IMG__" /><figcaption>${escapeHtml(block.caption || '')}</figcaption></figure>`
    case 'divider':
      return '<hr />'
    default:
      return ''
  }
}

/** Render a full blocks[] array. Code blocks get their source stored for copy. */
export function renderBlocks(blocks) {
  return (blocks || []).map((b, i) => renderBlock(b, i)).join('\n')
}

/** Collect all level-2/3 headings for the table of contents. */
export function collectHeadings(blocks) {
  return (blocks || [])
    .filter((b) => b.type === 'heading' && (b.level === 2 || b.level === 3))
    .map((b) => ({ id: slugify(b.text), text: b.text, level: b.level }))
}

/** Plain text of all blocks (for search indexing). */
export function blocksText(blocks) {
  const parts = []
  for (const b of blocks || []) {
    if (b.text) parts.push(b.text)
    if (b.title) parts.push(b.title)
    if (b.code) parts.push(b.code)
    if (b.items) parts.push(...b.items)
    if (b.headers) parts.push(...b.headers)
    if (b.rows) parts.push(...b.rows.flat())
  }
  return parts.join(' ')
}

/** Word count of an article (all readable text). */
export function wordCount(article) {
  const text = [article.title, article.subtitle, blocksText(article.blocks)].join(' ')
  return text.split(/\s+/).filter(Boolean).length
}
