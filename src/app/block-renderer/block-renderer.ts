import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import nginx from 'highlight.js/lib/languages/nginx';
import sql from 'highlight.js/lib/languages/sql';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import json from 'highlight.js/lib/languages/json';
import ini from 'highlight.js/lib/languages/ini';
import plaintext from 'highlight.js/lib/languages/plaintext';
import 'highlight.js/styles/github-dark.css';
import { ArticleBlock } from '../models/article.model';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('python', python);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('plaintext', plaintext);

/** Placeholder gradient bila URL gambar gagal dimuat. */
export const FALLBACK_IMG =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4f46e5'/><stop offset='1' stop-color='#059669'/></linearGradient></defs><rect width='1200' height='630' fill='url(#g)'/><text x='600' y='330' font-size='72' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold' opacity='0.9'>Server Tuning Wiki</text></svg>`,
  );

export function escapeHtml(str: string | undefined | null): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Format inline: `kode`, **tebal**, ==highlight==, [label](url). */
export function formatInline(text: string | undefined | null): string {
  const codeSpans: string[] = [];
  let html = escapeHtml(text ?? '');
  html = html.replace(/`([^`]+)`/g, (_, code: string) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  html = html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${codeSpans[Number(i)]}</code>`);
  return html;
}

const CALLOUT_ICON: Record<string, string> = {
  info: 'info',
  tip: 'lightbulb',
  warning: 'warning',
  danger: 'error',
};

function highlightCode(code: string, language?: string): string {
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return escapeHtml(code);
  } catch {
    return escapeHtml(code);
  }
}

function renderBlock(block: ArticleBlock, index: number): string {
  switch (block.type) {
    case 'heading': {
      const tag = block.level === 3 ? 'h3' : 'h2';
      const id = slugify(block.text ?? '');
      return `<${tag} id="${id}">${escapeHtml(block.text)}</${tag}>`;
    }
    case 'paragraph':
      return `<p>${formatInline(block.text)}</p>`;
    case 'callout': {
      const kind = ['info', 'tip', 'warning', 'danger'].includes(block.kind ?? '')
        ? block.kind!
        : 'info';
      const title = block.title
        ? `<div class="callout-title"><span class="material-icons callout-icon">${CALLOUT_ICON[kind]}</span> ${escapeHtml(block.title)}</div>`
        : '';
      return `<div class="callout callout-${kind}">${title}<div>${formatInline(block.text)}</div></div>`;
    }
    case 'code': {
      const lang = block.language ?? 'plaintext';
      const label = block.filename ?? lang;
      const highlighted = highlightCode(block.code ?? '', lang);
      return `<div class="codeblock">
        <div class="codeblock-header">
          <span class="codeblock-label">${escapeHtml(label)}</span>
          <button class="copy-btn" type="button" data-copy-index="${index}">
            <span class="material-icons copy-btn-icon">content_copy</span> Salin
          </button>
        </div>
        <pre><code class="language-${escapeHtml(lang)}">${highlighted}</code></pre>
      </div>`;
    }
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = (block.items ?? []).map((item) => `<li>${formatInline(item)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'table': {
      const headers = (block.headers ?? []).map((h) => `<th>${formatInline(h)}</th>`).join('');
      const rows = (block.rows ?? [])
        .map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`)
        .join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    case 'quote':
      return `<blockquote><p>${formatInline(block.text)}</p>${
        block.cite ? `<footer>— ${escapeHtml(block.cite)}</footer>` : ''
      }</blockquote>`;
    case 'image':
      return `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.caption ?? '')}" loading="lazy" class="block-image" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'" /><figcaption>${escapeHtml(block.caption ?? '')}</figcaption></figure>`;
    case 'divider':
      return '<hr />';
    default:
      return '';
  }
}

@Component({
  selector: 'app-block-renderer',
  standalone: true,
  templateUrl: './block-renderer.html',
  styleUrl: './block-renderer.scss',
})
export class BlockRendererComponent {
  blocks = input<ArticleBlock[]>([]);

  private sanitizer = inject(DomSanitizer);

  readonly safeHtml = computed<SafeHtml>(() => {
    const html = (this.blocks() ?? []).map((b, i) => renderBlock(b, i)).join('\n');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  static collectHeadings(blocks: ArticleBlock[]): { id: string; text: string; level: number }[] {
    return (blocks ?? [])
      .filter((b) => b.type === 'heading' && (b.level === 2 || b.level === 3))
      .map((b) => ({ id: slugify(b.text ?? ''), text: b.text ?? '', level: b.level ?? 2 }));
  }

  static blocksText(blocks: ArticleBlock[]): string {
    const parts: string[] = [];
    for (const b of blocks ?? []) {
      if (b.text) parts.push(b.text);
      if (b.title) parts.push(b.title);
      if (b.code) parts.push(b.code);
      if (b.items) parts.push(...b.items);
      if (b.headers) parts.push(...b.headers);
      if (b.rows) parts.push(...b.rows.flat());
    }
    return parts.join(' ');
  }

  /** Delegasi klik: tombol Salin di dalam HTML hasil render. */
  onContainerClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest?.('[data-copy-index]') as HTMLElement | null;
    if (!btn) return;
    const index = Number(btn.dataset['copyIndex']);
    const block = (this.blocks() ?? [])[index];
    const code = block?.type === 'code' ? (block.code ?? '') : '';
    if (!code) return;
    const done = () => {
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="material-icons copy-btn-icon">check</span> Disalin!';
      btn.classList.add('copied');
      window.setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('copied');
      }, 1800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done, () => this.fallbackCopy(code, done));
    } else {
      this.fallbackCopy(code, done);
    }
  }

  private fallbackCopy(code: string, done: () => void): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch {
      // Abaikan bila penyalinan tidak didukung.
    }
  }
}
