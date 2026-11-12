/**
 * Server Tuning Wiki API — Cloudflare Worker + D1.
 *
 * Read-only API publik untuk konten wiki. Dipakai oleh website (GitHub Pages)
 * dan APK (Capacitor): aplikasi mengambil /api/meta dulu, lalu /api/articles
 * hanya bila versinya berubah, dan menyimpan hasilnya di localStorage supaya
 * tetap bisa dibaca offline.
 *
 * Routes:
 *   GET /                    -> { ok: true, service }
 *   GET /api/meta            -> { version, updatedAt, count }
 *   GET /api/articles        -> [ artikel, ... ] (lengkap, termasuk blocks)
 *   GET /api/articles/:slug  -> satu artikel, 404 bila tidak ada
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data, status = 200, cacheSeconds = 60) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}`,
      ...CORS,
    },
  })
}

function rowToArticle(row) {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    image: row.image,
    imageAlt: row.image_alt,
    category: row.category,
    difficulty: row.difficulty,
    tags: safeParse(row.tags, []),
    author: row.author,
    dateCreated: row.date_created,
    dateUpdated: row.date_updated,
    parent: row.parent || null,
    order: row.order_index,
    related: safeParse(row.related, []),
    source: { label: row.source_label, url: row.source_url },
    blocks: safeParse(row.blocks, []),
  }
}

function safeParse(text, fallback) {
  try {
    return JSON.parse(text ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, 0)
    }

    if (url.pathname === '/') {
      return json({ ok: true, service: 'server-tuning-wiki-api' })
    }

    if (url.pathname === '/api/meta') {
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS count, MAX(date_updated) AS updated_at FROM articles',
      ).first()
      const count = row?.count ?? 0
      const updatedAt = row?.updated_at ?? '1970-01-01'
      return json({ version: `v${count}-${updatedAt}`, updatedAt, count })
    }

    if (url.pathname === '/api/articles') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM articles ORDER BY date_created DESC, slug ASC',
      ).all()
      return json((results || []).map(rowToArticle))
    }

    const single = url.pathname.match(/^\/api\/articles\/([a-z0-9-]+)$/)
    if (single) {
      const row = await env.DB.prepare('SELECT * FROM articles WHERE slug = ?')
        .bind(single[1])
        .first()
      if (!row) return json({ error: 'Artikel tidak ditemukan' }, 404, 0)
      return json(rowToArticle(row))
    }

    return json({ error: 'Not found' }, 404, 0)
  },
}
