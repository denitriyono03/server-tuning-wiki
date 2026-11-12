import './styles.css'
import 'highlight.js/styles/github-dark.css'
import { renderBlocks, collectHeadings, blocksText, wordCount, escapeHtml, formatInline } from './renderer.js'

// Gradient placeholder used when an article image URL fails to load.
const FALLBACK_IMG =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4f46e5'/><stop offset='1' stop-color='#059669'/></linearGradient></defs><rect width='1200' height='630' fill='url(#g)'/><text x='600' y='330' font-size='72' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold' opacity='0.9'>Server Tuning Wiki</text></svg>`,
  )
window.__WIKI_FALLBACK_IMG__ = FALLBACK_IMG

const BASE = import.meta.env.BASE_URL
const app = document.getElementById('app')

// ---------------------------------------------------------------------------
// Data loading — API dulu (Cloudflare Worker + D1), cache lokal, fallback bundle
// ---------------------------------------------------------------------------
const articleModules = import.meta.glob('./content/*.json', { eager: true })

/** Cache API di localStorage: dipakai offline & saat pertama buka (APK & web sama). */
const CACHE_KEY = 'stw-articles-v1'
const META_KEY = 'stw-articles-meta-v1'

let config = null
let articles = []
let currentArticle = null
/** bundled | cached | synced | offline */
let syncStatus = 'bundled'

function bundledArticles() {
  return Object.values(articleModules)
    .map((m) => m.default || m)
    .filter((a) => a && a.slug)
    .sort((a, b) => String(b.dateCreated).localeCompare(String(a.dateCreated)))
}

function loadArticles() {
  // 1. Bundle dulu — selalu ada, jadi aplikasi tetap jalan offline.
  articles = bundledArticles()
  // 2. Kalau ada cache API tersimpan, pakai itu (lebih baru dari bundle).
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Array.isArray(cached) && cached.length && cached.every((a) => a && a.slug && Array.isArray(a.blocks))) {
        articles = cached
        syncStatus = 'cached'
      }
    }
  } catch {
    // Cache rusak — tetap pakai bundle.
  }
}

/**
 * Ambil data terbaru dari API di latar belakang. Bila versi berubah, simpan
 * ke cache dan tampilkan lagi (kecuali sedang membaca artikel, supaya scroll
 * tidak reset — data baru dipakai saat navigasi berikutnya).
 */
async function refreshFromApi() {
  const base = (config.apiBaseUrl || '').replace(/\/$/, '')
  if (!base) {
    updateSyncBadge()
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const metaRes = await fetch(`${base}/api/meta`, { signal: controller.signal })
    if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`)
    const meta = await metaRes.json()
    const cachedMeta = JSON.parse(localStorage.getItem(META_KEY) || 'null')
    if (cachedMeta && cachedMeta.version === meta.version) {
      syncStatus = 'synced'
      updateSyncBadge()
      return
    }
    const res = await fetch(`${base}/api/articles`, { signal: controller.signal })
    if (!res.ok) throw new Error(`articles ${res.status}`)
    const data = await res.json()
    const list = Array.isArray(data) ? data : data.articles
    if (!Array.isArray(list) || !list.length || !list.every((a) => a && a.slug && Array.isArray(a.blocks))) {
      throw new Error('payload artikel tidak valid')
    }
    const changed = JSON.stringify(list) !== JSON.stringify(articles)
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
    localStorage.setItem(
      META_KEY,
      JSON.stringify({ version: meta.version, updatedAt: meta.updatedAt || new Date().toISOString() }),
    )
    if (!changed) {
      syncStatus = 'synced'
      updateSyncBadge()
      return
    }
    articles = list
    syncStatus = 'synced'
    updateSyncBadge()
    showToast('Data terbaru diunduh ✓')
    const hash = location.hash || '#/'
    if (!hash.startsWith('#/article/')) route()
  } catch {
    syncStatus = navigator.onLine === false ? 'offline' : 'cached'
    updateSyncBadge()
  } finally {
    clearTimeout(timer)
  }
}

function updateSyncBadge() {
  const el = document.getElementById('sync-status')
  if (!el) return
  const map = {
    bundled: 'Sumber data: bundle aplikasi',
    cached: '● Data tersimpan di perangkat',
    synced: '● Online — data terbaru',
    offline: '○ Offline — menampilkan data tersimpan',
  }
  el.textContent = map[syncStatus] || map.bundled
}

async function loadConfig() {
  try {
    const res = await fetch(`${BASE}config.json`)
    config = await res.json()
  } catch {
    config = {
      siteTitle: 'Code Wiki',
      siteSubtitle: 'Catatan teknis interaktif',
      siteDescription: '',
      defaultAuthor: 'Deni',
      colors: {},
      colorsDark: {},
    }
  }
  document.title = config.siteTitle
}

// ---------------------------------------------------------------------------
// Theme (light/dark) — palette comes from public/config.json
// ---------------------------------------------------------------------------
function getSavedTheme() {
  const saved = localStorage.getItem('wiki-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let theme = getSavedTheme()

function applyTheme() {
  const palette = theme === 'dark' ? { ...(config.colors || {}), ...(config.colorsDark || {}) } : config.colors || {}
  const root = document.documentElement
  const map = {
    primary: '--color-primary',
    secondary: '--color-secondary',
    accent: '--color-accent',
    background: '--color-background',
    surface: '--color-surface',
    text: '--color-text',
    muted: '--color-muted',
    border: '--color-border',
    codeBackground: '--color-code-bg',
  }
  for (const [key, cssVar] of Object.entries(map)) {
    if (palette[key]) root.style.setProperty(cssVar, palette[key])
  }
  root.classList.toggle('dark', theme === 'dark')
  const btn = document.getElementById('theme-toggle')
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙'
}

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark'
  localStorage.setItem('wiki-theme', theme)
  applyTheme()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readingTime(article) {
  const minutes = Math.max(1, Math.ceil(wordCount(article) / 200))
  return `${minutes} mnt baca`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return iso
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function articleUrl(slug) {
  return `#/article/${slug}`
}

function chip(text, href, active = false) {
  return `<a href="${href}" class="inline-block whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold border transition hover:opacity-85 ${active ? 'text-white border-transparent' : ''}" style="${active ? 'background:var(--color-primary)' : 'background:var(--color-surface);color:var(--color-text);border-color:var(--color-border)'}">${escapeHtml(text)}</a>`
}

function difficultyBadge(level) {
  const color = level === 'Pemula' ? '#16a34a' : level === 'Menengah' ? '#d97706' : '#dc2626'
  return `<span class="text-xs font-bold px-2 py-0.5 rounded-full text-white" style="background:${color}">${escapeHtml(level || '')}</span>`
}

function categoryBadge(category) {
  return `<span class="text-xs font-bold px-2 py-0.5 rounded-full text-white" style="background:var(--color-secondary)">${escapeHtml(category || '')}</span>`
}

function tagChips(tags) {
  return (tags || [])
    .map((t) => `<a href="#/tag/${encodeURIComponent(t)}" class="whitespace-nowrap text-xs px-2.5 py-1 rounded-full border hover:opacity-80 transition" style="border-color:var(--color-border);color:var(--color-muted)">#${escapeHtml(t)}</a>`)
    .join('')
}

function fallbackImgFor(article) {
  const letter = ((article.title || 'C').trim().charAt(0) || 'C').toUpperCase()
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4f46e5'/><stop offset='1' stop-color='#059669'/></linearGradient></defs><rect width='1200' height='630' fill='url(#g)'/><text x='600' y='365' font-size='280' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold' opacity='0.9'>${letter}</text></svg>`,
    )
  )
}

function cardImage(article, cls) {
  return `<img src="${escapeHtml(article.image || FALLBACK_IMG)}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="lazy" class="${cls}" data-fallback="${fallbackImgFor(article)}" onerror="this.onerror=null;this.src=this.dataset.fallback" />`
}

function articleCard(article) {
  return `<article class="rounded-2xl overflow-hidden border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col" style="background:var(--color-surface);border-color:var(--color-border)">
    <a href="${articleUrl(article.slug)}" class="block overflow-hidden shrink-0">
      ${cardImage(article, 'w-full aspect-video object-cover hover:scale-105 transition duration-300')}
    </a>
    <div class="p-5 flex flex-col gap-3 flex-1">
      <div class="flex items-center gap-2 flex-wrap">
        ${categoryBadge(article.category)}
        ${difficultyBadge(article.difficulty)}
        <span class="text-xs ml-auto whitespace-nowrap" style="color:var(--color-muted)">⏱ ${readingTime(article)}</span>
      </div>
      <a href="${articleUrl(article.slug)}"><h3 class="text-lg font-bold leading-snug hover:underline" style="color:var(--color-text)">${escapeHtml(article.title)}</h3></a>
      <p class="text-sm leading-relaxed line-clamp-2" style="color:var(--color-muted)">${escapeHtml(article.subtitle || '')}</p>
      <div class="flex flex-wrap gap-2 mt-1">${tagChips(article.tags)}</div>
      <div class="mt-auto pt-3 text-xs border-t flex items-center gap-2 flex-wrap" style="border-color:var(--color-border);color:var(--color-muted)">
        <span>✍️ ${escapeHtml(article.author || config.defaultAuthor || '')}</span>
        <span aria-hidden="true">•</span>
        <span>📅 ${formatDate(article.dateCreated)}</span>
      </div>
    </div>
  </article>`
}

function featuredCard(article) {
  return `<article class="rounded-2xl overflow-hidden border shadow-md hover:shadow-xl transition-shadow duration-300 grid md:grid-cols-2" style="background:var(--color-surface);border-color:var(--color-border)">
    <a href="${articleUrl(article.slug)}" class="block overflow-hidden">
      ${cardImage(article, 'w-full h-56 md:h-full md:min-h-72 object-cover hover:scale-105 transition duration-300')}
    </a>
    <div class="p-6 md:p-8 flex flex-col gap-3 justify-center">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs font-bold px-2.5 py-1 rounded-full text-white" style="background:var(--color-accent)">⭐ Artikel Pilihan</span>
        ${categoryBadge(article.category)}
        ${difficultyBadge(article.difficulty)}
      </div>
      <a href="${articleUrl(article.slug)}"><h3 class="text-2xl md:text-3xl font-extrabold leading-tight tracking-tight hover:underline" style="color:var(--color-text)">${escapeHtml(article.title)}</h3></a>
      <p class="text-base leading-relaxed line-clamp-3" style="color:var(--color-muted)">${escapeHtml(article.subtitle || '')}</p>
      <div class="flex flex-wrap gap-2">${tagChips(article.tags)}</div>
      <div class="flex items-center gap-3 flex-wrap text-sm pt-1" style="color:var(--color-muted)">
        <span>✍️ ${escapeHtml(article.author || config.defaultAuthor || '')}</span>
        <span aria-hidden="true">•</span>
        <span>📅 ${formatDate(article.dateCreated)}</span>
        <span aria-hidden="true">•</span>
        <span>⏱ ${readingTime(article)}</span>
      </div>
      <div>
        <a href="${articleUrl(article.slug)}" class="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-full text-white text-sm font-bold shadow-sm hover:opacity-90 transition" style="background:var(--color-primary)">Baca artikel →</a>
      </div>
    </div>
  </article>`
}

// ---------------------------------------------------------------------------
// Sidebar tree (3 levels: category → article → child article)
// ---------------------------------------------------------------------------
const expandedCats = new Set()
const expandedParents = new Set()
let sidebarOpen = false
let activeSlug = null

function sortSiblings(list) {
  return [...list].sort(
    (a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.title.localeCompare(b.title, 'id'),
  )
}

function treeData() {
  const bySlug = new Map(articles.map((a) => [a.slug, a]))
  const childrenOf = new Map()
  for (const a of articles) {
    if (a.parent && bySlug.has(a.parent)) {
      if (!childrenOf.has(a.parent)) childrenOf.set(a.parent, [])
      childrenOf.get(a.parent).push(a)
    }
  }
  const roots = articles.filter((a) => !a.parent || !bySlug.has(a.parent))
  const categories = [...new Set(roots.map((a) => a.category).filter(Boolean))].sort()
  return { bySlug, childrenOf, roots, categories }
}

function initTreeState() {
  const { categories, childrenOf } = treeData()
  for (const c of categories) expandedCats.add(c)
  for (const slug of childrenOf.keys()) expandedParents.add(slug)
}

/** Parent chain of an article, top-down (excluding the article itself). */
function ancestorsOf(article) {
  const { bySlug } = treeData()
  const chain = []
  const seen = new Set()
  let cur = article
  while (cur && cur.parent && bySlug.get(cur.parent) && !seen.has(cur.slug)) {
    seen.add(cur.slug)
    cur = bySlug.get(cur.parent)
    chain.unshift(cur)
  }
  return chain
}

function ensureAncestorsOpen(article) {
  if (!article) return
  expandedCats.add(article.category)
  for (const anc of ancestorsOf(article)) expandedParents.add(anc.slug)
}

function treeLinkHtml(a, level) {
  const active = a.slug === activeSlug
  const size = level === 3 ? 'text-[13px]' : 'text-sm'
  const style = active
    ? 'background:color-mix(in srgb, var(--color-primary) 14%, transparent);color:var(--color-primary);font-weight:700'
    : 'color:var(--color-text)'
  return `<a href="${articleUrl(a.slug)}" class="flex-1 min-w-0 px-2 py-1.5 rounded-lg ${size} truncate hover:opacity-80 transition" style="${style}" title="${escapeHtml(a.title)}">${escapeHtml(a.title)}</a>`
}

function treeInnerHtml() {
  const { childrenOf, roots, categories } = treeData()
  const countInCategory = (c) => {
    let n = 0
    const walk = (a) => {
      n++
      for (const k of childrenOf.get(a.slug) || []) walk(k)
    }
    for (const r of roots.filter((a) => a.category === c)) walk(r)
    return n
  }
  // Recursive: renders children at any depth (data guide caps nesting at 3
  // article levels, but the code itself does not hard-stop deeper trees).
  const nodeHtml = (a, depth) => {
    const kids = sortSiblings(childrenOf.get(a.slug) || [])
    const hasKids = kids.length > 0
    const open = expandedParents.has(a.slug)
    return `<div class="mb-0.5">
      <div class="flex items-center gap-0.5 rounded-lg">
        ${hasKids ? `<button data-toggle-parent="${escapeHtml(a.slug)}" class="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition" aria-label="Tampilkan turunan" aria-expanded="${open}"><span class="tree-chevron ${open ? 'open' : ''}">▸</span></button>` : `<span class="w-6 shrink-0" aria-hidden="true"></span>`}
        ${treeLinkHtml(a, depth)}
        ${hasKids ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mr-1" style="background:color-mix(in srgb, var(--color-primary) 12%, transparent);color:var(--color-primary)">${kids.length}</span>` : ''}
      </div>
      ${hasKids ? `<div class="${open ? '' : 'hidden'} ml-3 pl-2 border-l" style="border-color:var(--color-border)">${kids.map((k) => nodeHtml(k, depth + 1)).join('')}</div>` : ''}
    </div>`
  }
  return categories
    .map((c) => {
      const catOpen = expandedCats.has(c)
      const tops = sortSiblings(roots.filter((a) => a.category === c))
      return `<div class="mb-1">
        <button data-toggle-cat="${escapeHtml(c)}" class="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-bold text-left transition hover:opacity-80" style="color:var(--color-text)" aria-expanded="${catOpen}">
          <span class="tree-chevron ${catOpen ? 'open' : ''}">▸</span>
          <span class="flex-1 min-w-0 truncate">${escapeHtml(c)}</span>
          <span class="text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style="background:color-mix(in srgb, var(--color-primary) 12%, transparent);color:var(--color-primary)">${countInCategory(c)}</span>
        </button>
        <div class="${catOpen ? '' : 'hidden'}">
          ${tops.map((a) => nodeHtml(a, 2)).join('')}
        </div>
      </div>`
    })
    .join('')
}

function renderSidebarTree() {
  const nav = document.getElementById('sidebar-tree')
  if (nav) nav.innerHTML = treeInnerHtml()
}

function setSidebarOpen(open) {
  sidebarOpen = open
  const sb = document.getElementById('sidebar')
  const bd = document.getElementById('sidebar-backdrop')
  if (sb) {
    sb.classList.toggle('-translate-x-full', !open)
    sb.classList.toggle('translate-x-0', open)
  }
  if (bd) bd.classList.toggle('hidden', !open)
  document.body.style.overflow = open && window.innerWidth < 1024 ? 'hidden' : ''
}

function sidebarHtml() {
  return `
  <aside id="sidebar" class="fixed z-40 lg:z-30 top-0 lg:top-[65px] bottom-0 left-0 w-72 flex flex-col border-r shadow-xl lg:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0" style="background:var(--color-surface);border-color:var(--color-border)">
    <div class="flex items-center justify-between pl-4 pr-3 pt-4 pb-3 border-b shrink-0" style="border-color:var(--color-border)">
      <p class="font-extrabold text-sm tracking-wide" style="color:var(--color-text)">📚 Daftar Konten</p>
      <button id="sidebar-close" class="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-lg transition hover:bg-black/5 dark:hover:bg-white/10" style="color:var(--color-muted)" aria-label="Tutup sidebar">✕</button>
    </div>
    <nav id="sidebar-tree" class="flex-1 overflow-y-auto px-3 py-3">${treeInnerHtml()}</nav>
  </aside>
  <div id="sidebar-backdrop" class="${sidebarOpen ? '' : 'hidden'} lg:hidden fixed inset-0 z-30 bg-black/50"></div>
  `
}

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------
function shell(content) {
  const categories = [...new Set(articles.map((a) => a.category).filter(Boolean))].sort()
  return `
  <div id="progress-bar" class="fixed top-0 left-0 h-1 z-50 transition-all" style="background:var(--color-primary);width:0%"></div>
  <header class="sticky top-0 z-40 backdrop-blur-md border-b shadow-sm" style="background:color-mix(in srgb, var(--color-surface) 88%, transparent);border-color:var(--color-border)">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
      <button id="sidebar-toggle" class="lg:hidden w-10 h-10 rounded-full border flex items-center justify-center text-lg transition hover:opacity-85 shrink-0" style="border-color:var(--color-border);background:var(--color-surface);color:var(--color-text)" aria-label="Buka daftar konten">☰</button>
      <a href="#/" class="flex items-center gap-2.5 font-extrabold text-lg tracking-tight shrink-0" style="color:var(--color-text)">
        <span class="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-extrabold shadow-sm" style="background:linear-gradient(135deg, var(--color-primary), var(--color-secondary))">⚡</span>
        ${escapeHtml(config.siteTitle)}
      </a>
      <nav class="hidden md:flex items-center gap-1 ml-2 text-sm font-medium" style="color:var(--color-muted)">
        <a href="#/" class="px-3 py-2 rounded-lg hover:opacity-75 hover:bg-black/5 dark:hover:bg-white/10 transition">Beranda</a>
        ${categories.map((c) => `<a href="#/category/${encodeURIComponent(c)}" class="px-3 py-2 rounded-lg hover:opacity-75 hover:bg-black/5 dark:hover:bg-white/10 transition whitespace-nowrap">${escapeHtml(c)}</a>`).join('')}
      </nav>
      <div class="ml-auto flex items-center gap-2">
        <button id="header-search-btn" class="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-sm font-semibold transition hover:opacity-85" style="border-color:var(--color-border);color:var(--color-text);background:var(--color-surface)">🔍 Cari <kbd class="text-xs px-1.5 py-0.5 rounded border" style="border-color:var(--color-border);color:var(--color-muted)">/</kbd></button>
        <button id="theme-toggle" class="w-10 h-10 rounded-full border flex items-center justify-center transition hover:opacity-85" style="border-color:var(--color-border);background:var(--color-surface)" title="Ganti tema (terang/gelap)">🌙</button>
      </div>
    </div>
  </header>
  ${sidebarHtml()}
  <div class="lg:pl-72">
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">${content}</main>
  <footer class="border-t mt-4" style="border-color:var(--color-border);background:var(--color-surface)">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div class="flex flex-col md:flex-row gap-6 md:items-start justify-between">
        <div class="max-w-md">
          <p class="flex items-center gap-2 font-extrabold text-base" style="color:var(--color-text)"><span class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-extrabold" style="background:linear-gradient(135deg, var(--color-primary), var(--color-secondary))">⚡</span>${escapeHtml(config.siteTitle)}</p>
          <p class="text-sm mt-3 leading-relaxed" style="color:var(--color-muted)">${escapeHtml(config.siteDescription || '')}</p>
        </div>
        <div class="text-sm" style="color:var(--color-muted)">
          <p class="font-bold mb-2" style="color:var(--color-text)">Kategori</p>
          <div class="flex flex-col gap-1.5">
            ${categories.map((c) => `<a href="#/category/${encodeURIComponent(c)}" class="hover:underline">${escapeHtml(c)}</a>`).join('')}
          </div>
        </div>
        <div class="text-sm" style="color:var(--color-muted)">
          <p class="font-bold mb-2" style="color:var(--color-text)">Tentang Wiki Ini</p>
          <p>${articles.length} artikel • Semua konten berbasis JSON</p>
          <p class="mt-1">Dibangun dengan Vite + TailwindCSS</p>
          <p class="mt-1" id="sync-status">Sumber data: bundle aplikasi</p>
          <p class="mt-1">© ${new Date().getFullYear()} ${escapeHtml(config.siteTitle)}</p>
        </div>
      </div>
    </div>
  </footer>
  </div>
  <button id="back-to-top" class="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full text-white shadow-lg hidden items-center justify-center text-xl" style="background:var(--color-primary)" title="Kembali ke atas">↑</button>
  <div id="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm font-semibold shadow-lg opacity-0 pointer-events-none" style="background:var(--color-secondary)">Disalin!</div>
  `
}

// ---------------------------------------------------------------------------
// Home view
// ---------------------------------------------------------------------------
const homeState = { q: '', category: '', tag: '', sort: 'newest' }

function filteredArticles() {
  const q = homeState.q.trim().toLowerCase()
  let list = articles.filter((a) => {
    if (homeState.category && a.category !== homeState.category) return false
    if (homeState.tag && !(a.tags || []).includes(homeState.tag)) return false
    if (!q) return true
    const hay = [a.title, a.subtitle, a.category, (a.tags || []).join(' '), blocksText(a.blocks)].join(' ').toLowerCase()
    return q.split(/\s+/).every((word) => hay.includes(word))
  })
  if (homeState.sort === 'oldest') list = [...list].sort((a, b) => String(a.dateCreated).localeCompare(String(b.dateCreated)))
  else if (homeState.sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'id'))
  else list = [...list].sort((a, b) => String(b.dateCreated).localeCompare(String(a.dateCreated)))
  return list
}

function renderHome() {
  const categories = [...new Set(articles.map((a) => a.category).filter(Boolean))].sort()
  const allTags = [...new Set(articles.flatMap((a) => a.tags || []))].sort()
  const list = filteredArticles()
  const featured = !homeState.q && !homeState.category && !homeState.tag ? articles[0] : null
  const rest = featured ? list.filter((a) => a.slug !== featured.slug) : list

  const filterActive = homeState.q || homeState.category || homeState.tag

  app.innerHTML = shell(`
    <section class="hero-bg -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-12 pb-10 md:pt-16 md:pb-14 text-center">
      <p class="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border" style="border-color:var(--color-border);color:var(--color-primary);background:var(--color-surface)">⚡ Wiki Performa • Tuning Server</p>
      <h1 class="mt-5 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]"><span class="hero-title-gradient">${escapeHtml(config.siteTitle)}</span></h1>
      <p class="mt-4 text-xl md:text-2xl font-bold" style="color:var(--color-text)">${escapeHtml(config.siteSubtitle || '')}</p>
      <p class="mt-3 max-w-2xl mx-auto text-base leading-relaxed" style="color:var(--color-muted)">${escapeHtml(config.siteDescription || '')}</p>
      <div class="mt-8 max-w-xl mx-auto relative">
        <span class="absolute left-5 top-1/2 -translate-y-1/2 text-lg pointer-events-none">🔍</span>
        <input id="search-input" type="search" value="${escapeHtml(homeState.q)}" placeholder="Cari artikel, topik, atau kata kunci…" class="search-input w-full pl-12 pr-12 py-4 rounded-2xl border text-base outline-none shadow-lg transition" style="background:var(--color-surface);border-color:var(--color-border);color:var(--color-text)" />
        <kbd class="absolute right-4 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-md border font-sans" style="color:var(--color-muted);border-color:var(--color-border);background:var(--color-background)">/</kbd>
      </div>
      <div class="mt-7 flex items-center justify-center gap-3 sm:gap-8 flex-wrap text-sm font-semibold" style="color:var(--color-muted)">
        <span><strong class="text-lg" style="color:var(--color-text)">${articles.length}</strong> Artikel</span>
        <span class="hidden sm:inline" aria-hidden="true">•</span>
        <span><strong class="text-lg" style="color:var(--color-text)">${categories.length}</strong> Kategori</span>
        <span class="hidden sm:inline" aria-hidden="true">•</span>
        <span><strong class="text-lg" style="color:var(--color-text)">${allTags.length}</strong> Tag</span>
      </div>
    </section>

    <section class="flex flex-wrap items-center gap-2 mt-8 mb-5">
      ${chip('Semua', '#/', !homeState.category && !homeState.tag)}
      ${categories.map((c) => chip(c, `#/category/${encodeURIComponent(c)}`, homeState.category === c)).join('')}
      <select id="sort-select" class="ml-auto px-3.5 py-2 rounded-full border text-sm font-medium cursor-pointer" style="background:var(--color-surface);border-color:var(--color-border);color:var(--color-text)">
        <option value="newest" ${homeState.sort === 'newest' ? 'selected' : ''}>Terbaru</option>
        <option value="oldest" ${homeState.sort === 'oldest' ? 'selected' : ''}>Terlama</option>
        <option value="title" ${homeState.sort === 'title' ? 'selected' : ''}>Judul A–Z</option>
      </select>
    </section>

    ${homeState.tag ? `<section class="mb-5"><span class="text-sm" style="color:var(--color-muted)">Tag: </span>${chip('#' + homeState.tag, '#/', true)} <a href="#/" class="text-sm underline ml-2">Hapus filter ✕</a></section>` : ''}
    ${homeState.category ? `<section class="mb-5"><span class="text-sm" style="color:var(--color-muted)">Kategori: <strong>${escapeHtml(homeState.category)}</strong></span> <a href="#/" class="text-sm underline ml-2">Hapus filter ✕</a></section>` : ''}

    <section class="mb-8">
      <p class="text-sm font-semibold mb-3" style="color:var(--color-muted)">${list.length} artikel ditemukan ${filterActive ? 'dengan filter aktif' : ''}</p>
      ${allTags.length ? `<div class="flex flex-wrap gap-2">${allTags.map((t) => chip('#' + t, `#/tag/${encodeURIComponent(t)}`, homeState.tag === t)).join('')}</div>` : ''}
    </section>

    ${featured ? `<section id="featured-section" class="mb-10">${featuredCard(featured)}</section>` : ''}

    <div id="results">
    ${rest.length ? `
    <section>
      <h2 class="text-2xl font-extrabold tracking-tight mb-5">Semua Artikel</h2>
      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        ${rest.map((a) => articleCard(a)).join('')}
      </div>
    </section>` : `
    <section class="text-center py-16 rounded-2xl border" style="border-color:var(--color-border)">
      <p class="text-4xl mb-3">🔍</p>
      <p class="text-lg font-bold">Tidak ada artikel yang cocok</p>
      <p class="text-sm mt-1" style="color:var(--color-muted)">Coba kata kunci lain, atau <a href="#/" class="underline" style="color:var(--color-primary)">reset semua filter</a>.</p>
    </section>`}
    </div>
  `)
  bindHomeEvents()
}

function resultsHtml(list) {
  if (!list.length) {
    return `<section class="text-center py-16 rounded-2xl border" style="border-color:var(--color-border)">
      <p class="text-4xl mb-3">🔍</p>
      <p class="text-lg font-bold">Tidak ada artikel yang cocok</p>
      <p class="text-sm mt-1" style="color:var(--color-muted)">Coba kata kunci lain, atau <a href="#/" class="underline" style="color:var(--color-primary)">reset semua filter</a>.</p>
    </section>`
  }
  return `<section>
      <h2 class="text-2xl font-extrabold tracking-tight mb-5">Semua Artikel</h2>
      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">${list.map((a) => articleCard(a)).join('')}</div>
    </section>`
}

function bindHomeEvents() {
  const search = document.getElementById('search-input')
  if (search) {
    search.addEventListener('input', () => {
      homeState.q = search.value
      const list = filteredArticles()
      const count = document.querySelector('section.mb-8 p')
      if (count) count.textContent = `${list.length} artikel ditemukan dengan filter aktif`
      const feat = document.getElementById('featured-section')
      if (feat) feat.style.display = homeState.q.trim() ? 'none' : ''
      const results = document.getElementById('results')
      if (results) results.innerHTML = resultsHtml(list)
    })
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault()
    })
  }
  const sort = document.getElementById('sort-select')
  if (sort) {
    sort.addEventListener('change', () => {
      homeState.sort = sort.value
      renderHome()
      const s2 = document.getElementById('search-input')
      if (s2) s2.focus()
    })
  }
}

// ---------------------------------------------------------------------------
// Article view
// ---------------------------------------------------------------------------
function relatedArticles(article) {
  const bySlug = new Map(articles.map((a) => [a.slug, a]))
  const picked = []
  for (const slug of article.related || []) {
    const a = bySlug.get(slug)
    if (a && a.slug !== article.slug && !picked.includes(a)) picked.push(a)
  }
  if (picked.length < 3) {
    const same = articles.filter(
      (a) =>
        a.slug !== article.slug &&
        !picked.includes(a) &&
        (a.category === article.category || (a.tags || []).some((t) => (article.tags || []).includes(t))),
    )
    for (const a of same) {
      if (picked.length >= 3) break
      picked.push(a)
    }
  }
  return picked.slice(0, 3)
}

function renderArticle(slug) {
  const article = articles.find((a) => a.slug === slug)
  if (!article) {
    app.innerHTML = shell(`
      <section class="text-center py-20">
        <p class="text-5xl mb-4">😕</p>
        <h1 class="text-2xl font-bold">Artikel tidak ditemukan</h1>
        <p class="mt-2" style="color:var(--color-muted)">Slug “${escapeHtml(slug)}” tidak ada di wiki ini.</p>
        <a href="#/" class="inline-block mt-6 px-5 py-2.5 rounded-full text-white font-semibold" style="background:var(--color-primary)">← Kembali ke Beranda</a>
      </section>`)
    return
  }
  currentArticle = article
  ensureAncestorsOpen(article)
  const headings = collectHeadings(article.blocks)
  const idx = articles.findIndex((a) => a.slug === slug)
  const prev = articles[idx + 1] || null
  const next = articles[idx - 1] || null
  const related = relatedArticles(article)
  const source = article.source || {}
  const chain = ancestorsOf(article)

  app.innerHTML = shell(`
    <article class="pt-6">
      <nav class="text-sm no-print flex flex-wrap items-center gap-x-1.5 gap-y-1" aria-label="Breadcrumb" style="color:var(--color-muted)">
        <a href="#/" class="hover:underline">Beranda</a><span aria-hidden="true">/</span>
        <a href="#/category/${encodeURIComponent(article.category || '')}" class="hover:underline">${escapeHtml(article.category || '')}</a><span aria-hidden="true">/</span>
        ${chain.map((a) => `<a href="${articleUrl(a.slug)}" class="hover:underline">${escapeHtml(a.title)}</a><span aria-hidden="true">/</span>`).join('')}
        <span class="font-semibold" style="color:var(--color-text)">${escapeHtml(article.title)}</span>
      </nav>
      <div class="mt-4 rounded-2xl overflow-hidden border shadow-sm" style="border-color:var(--color-border)">
        ${cardImage(article, 'w-full h-56 sm:h-72 md:h-96 object-cover')}
      </div>
      <div class="mt-6 lg:flex lg:gap-10">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <a href="#/category/${encodeURIComponent(article.category || '')}">${categoryBadge(article.category)}</a>
            ${difficultyBadge(article.difficulty)}
          </div>
          <h1 class="text-3xl md:text-4xl font-extrabold leading-tight mt-3">${escapeHtml(article.title)}</h1>
          <p class="text-lg mt-2" style="color:var(--color-muted)">${escapeHtml(article.subtitle || '')}</p>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pb-4 text-sm border-b" style="border-color:var(--color-border);color:var(--color-muted)">
            <span>✍️ ${escapeHtml(article.author || config.defaultAuthor || '')}</span>
            <span>📅 ${formatDate(article.dateCreated)}</span>
            ${article.dateUpdated ? `<span>🔄 Diperbarui ${formatDate(article.dateUpdated)}</span>` : ''}
            <span>⏱ ${readingTime(article)}</span>
          </div>
          <div class="flex flex-wrap gap-2 mt-4">${tagChips(article.tags)}</div>

          <div class="article-body mt-6 max-w-3xl">
            ${renderBlocks(article.blocks)}
          </div>

          ${source.url ? `<div class="mt-8 p-4 rounded-xl border text-sm" style="border-color:var(--color-border);background:var(--color-surface)">
            <strong>📚 Sumber:</strong>
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--color-primary)">${escapeHtml(source.label || source.url)}</a>
          </div>` : ''}

          ${related.length ? `<section class="mt-10">
            <h2 class="text-2xl font-bold mb-4">🔗 Konten Terkait</h2>
            <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              ${related.map((a) => articleCard(a)).join('')}
            </div>
          </section>` : ''}

          <nav class="mt-10 grid sm:grid-cols-2 gap-4 no-print">
            ${prev ? `<a href="${articleUrl(prev.slug)}" class="p-4 rounded-xl border hover:shadow transition" style="border-color:var(--color-border);background:var(--color-surface)"><span class="text-xs font-bold" style="color:var(--color-muted)">← SEBELUMNYA</span><span class="block font-bold mt-1">${escapeHtml(prev.title)}</span></a>` : '<span></span>'}
            ${next ? `<a href="${articleUrl(next.slug)}" class="p-4 rounded-xl border hover:shadow transition text-right" style="border-color:var(--color-border);background:var(--color-surface)"><span class="text-xs font-bold" style="color:var(--color-muted)">BERIKUTNYA →</span><span class="block font-bold mt-1">${escapeHtml(next.title)}</span></a>` : '<span></span>'}
          </nav>
        </div>

        ${headings.length ? `<aside id="toc" class="hidden xl:block w-72 shrink-0 no-print">
          <div class="sticky top-24 rounded-2xl border p-4 shadow-sm" style="border-color:var(--color-border);background:var(--color-surface)">
            <p class="font-bold text-sm mb-3 px-2">📑 Daftar Isi</p>
            <nav class="space-y-0.5">
              ${headings.map((h) => `<a href="#${h.id}" data-toc="${h.id}" class="toc-link ${h.level === 3 ? 'l3' : ''}">${escapeHtml(h.text)}</a>`).join('')}
            </nav>
          </div>
        </aside>` : ''}
      </div>
    </article>
  `)
  bindArticleEvents(headings)
}

function bindArticleEvents(headings) {
  // Smooth scroll for TOC links (offset handled by scroll-margin-top in CSS)
  document.querySelectorAll('[data-toc]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      const el = document.getElementById(link.dataset.toc)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
      history.replaceState(null, '', `#${link.dataset.toc}`)
    })
  })

  // Scroll spy + progress bar + back-to-top
  const onScroll = () => {
    const h = document.documentElement
    const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight || 1)
    const bar = document.getElementById('progress-bar')
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, scrolled * 100))}%`
    const btt = document.getElementById('back-to-top')
    if (btt) {
      const show = h.scrollTop > 400
      btt.classList.toggle('hidden', !show)
      btt.classList.toggle('flex', show)
    }
    let current = ''
    for (const hd of headings) {
      const el = document.getElementById(hd.id)
      if (el && el.getBoundingClientRect().top <= 120) current = hd.id
    }
    document.querySelectorAll('[data-toc]').forEach((link) => {
      link.classList.toggle('active', link.dataset.toc === current)
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
}

// ---------------------------------------------------------------------------
// Global events (delegated)
// ---------------------------------------------------------------------------
function showToast(msg) {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = msg
  toast.style.opacity = '1'
  toast.style.transform = 'translate(-50%, -8px)'
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translate(-50%, 0)'
  }, 1800)
}

document.addEventListener('click', async (e) => {
  const toggleCat = e.target.closest('[data-toggle-cat]')
  if (toggleCat) {
    const c = toggleCat.dataset.toggleCat
    if (expandedCats.has(c)) expandedCats.delete(c)
    else expandedCats.add(c)
    renderSidebarTree()
    return
  }
  const toggleParent = e.target.closest('[data-toggle-parent]')
  if (toggleParent) {
    const s = toggleParent.dataset.toggleParent
    if (expandedParents.has(s)) expandedParents.delete(s)
    else expandedParents.add(s)
    renderSidebarTree()
    return
  }
  if (e.target.closest('#sidebar-toggle')) {
    setSidebarOpen(true)
    return
  }
  if (e.target.closest('#sidebar-close') || e.target.closest('#sidebar-backdrop')) {
    setSidebarOpen(false)
    return
  }
  const copyBtn = e.target.closest('.copy-btn')
  if (copyBtn && currentArticle) {
    const idx = Number(copyBtn.dataset.codeIndex)
    const codeBlocks = (currentArticle.blocks || []).filter((b) => b.type === 'code')
    // data-code-index counts all blocks; map back to code blocks in order
    const all = currentArticle.blocks || []
    let codeIdx = -1
    let target = null
    all.forEach((b, i) => {
      if (b.type === 'code') {
        codeIdx++
        if (i === idx) target = b
      }
    })
    void codeBlocks
    const code = target ? target.code : ''
    try {
      await navigator.clipboard.writeText(code)
      showToast('Disalin!')
    } catch {
      showToast('Gagal menyalin')
    }
    return
  }
  const themeBtn = e.target.closest('#theme-toggle')
  if (themeBtn) {
    toggleTheme()
    return
  }
  const searchBtn = e.target.closest('#header-search-btn')
  if (searchBtn) {
    const search = document.getElementById('search-input')
    if (search) {
      search.focus()
      search.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      location.hash = '#/'
      setTimeout(() => document.getElementById('search-input')?.focus(), 80)
    }
    return
  }
  const btt = e.target.closest('#back-to-top')
  if (btt) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebarOpen) {
    setSidebarOpen(false)
    return
  }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
    const search = document.getElementById('search-input')
    if (search) {
      e.preventDefault()
      search.focus()
    } else {
      location.hash = '#/'
      setTimeout(() => document.getElementById('search-input')?.focus(), 50)
    }
  }
})

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function route() {
  const hash = location.hash || '#/'
  const parts = hash.replace(/^#\/?/, '').split('/')
  const [page, param] = parts

  window.scrollTo({ top: 0 })
  // Navigating closes the mobile drawer (desktop sidebar stays visible).
  if (window.innerWidth < 1024 && sidebarOpen) {
    sidebarOpen = false
    document.body.style.overflow = ''
  }
  const btt = document.getElementById('back-to-top')
  if (btt) btt.classList.add('hidden')

  if (page === 'article' && param) {
    homeState.q = ''
    activeSlug = decodeURIComponent(param)
    renderArticle(decodeURIComponent(param))
  } else if (page === 'tag' && param) {
    activeSlug = null
    homeState.tag = decodeURIComponent(param)
    homeState.category = ''
    renderHome()
  } else if (page === 'category' && param) {
    activeSlug = null
    homeState.category = decodeURIComponent(param)
    homeState.tag = ''
    renderHome()
  } else {
    activeSlug = null
    homeState.category = ''
    homeState.tag = ''
    renderHome()
  }
  applyTheme()
}

window.addEventListener('hashchange', route)

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  loadArticles()
  initTreeState()
  await loadConfig()
  applyTheme()
  route()
  // Sinkronisasi data di latar belakang; jangan blokir tampilan pertama.
  refreshFromApi()
  window.addEventListener('online', () => refreshFromApi())
  window.addEventListener('offline', () => {
    syncStatus = 'offline'
    updateSyncBadge()
  })
}

boot()
