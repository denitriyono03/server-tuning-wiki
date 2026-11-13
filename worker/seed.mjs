#!/usr/bin/env node
/**
 * Generate worker/seed.sql dari artikel JSON di public/content/.
 * Dijalankan setiap kali ada artikel baru/diubah:
 *
 *   node worker/seed.mjs
 *   wrangler d1 execute server-tuning-db --file=worker/seed.sql
 *
 * Seed memakai INSERT OR REPLACE supaya bisa dijalankan ulang dengan aman.
 * Setelah seed, /api/meta otomatis berubah versinya (count + max date_updated),
 * jadi website & APK akan mengambil data baru saat online.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'public', 'content')

const esc = (v) => String(v ?? '').replace(/'/g, "''")
const j = (v) => esc(JSON.stringify(v ?? []))

const files = readdirSync(contentDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()
const lines = [
  '-- Seed Server Tuning Wiki — digenerate dari public/content/*.json',
  `-- ${new Date().toISOString()}`,
  '',
]

for (const file of files) {
  const a = JSON.parse(readFileSync(join(contentDir, file), 'utf8'))
  lines.push(
    `INSERT OR REPLACE INTO articles (slug, title, subtitle, image, image_alt, category, difficulty, tags, author, date_created, date_updated, parent, order_index, related, source_label, source_url, blocks, updated_at) VALUES ('${esc(a.slug)}', '${esc(a.title)}', '${esc(a.subtitle)}', '${esc(a.image)}', '${esc(a.imageAlt)}', '${esc(a.category)}', '${esc(a.difficulty)}', '${j(a.tags)}', '${esc(a.author)}', '${esc(a.dateCreated)}', '${esc(a.dateUpdated)}', ${a.parent ? `'${esc(a.parent)}'` : 'NULL'}, ${a.order ?? 0}, '${j(a.related)}', '${esc(a.source?.label)}', '${esc(a.source?.url)}', '${j(a.blocks)}', '${esc(a.dateUpdated)}');`,
  )
}

writeFileSync(join(root, 'worker', 'seed.sql'), lines.join('\n') + '\n')
console.log(`seed.sql ditulis: ${files.length} artikel`)
