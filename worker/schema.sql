-- Skema D1 untuk Server Tuning Wiki.
-- Dijalankan sekali: wrangler d1 execute server-tuning-db --file=worker/schema.sql
-- (atau lewat Cloudflare dashboard / API).
-- tags, related, dan blocks disimpan sebagai JSON text.

CREATE TABLE IF NOT EXISTS articles (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'Pemula',
  tags TEXT NOT NULL DEFAULT '[]',
  author TEXT NOT NULL DEFAULT 'Deni',
  date_created TEXT NOT NULL DEFAULT '2026-11-13',
  date_updated TEXT NOT NULL DEFAULT '2026-11-13',
  parent TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  related TEXT NOT NULL DEFAULT '[]',
  source_label TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  blocks TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT '2026-11-13'
);

CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_parent ON articles(parent);
