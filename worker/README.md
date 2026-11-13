# Server Tuning Wiki — API (Cloudflare Worker + D1)

API read-only untuk konten wiki. Website (GitHub Pages) dan APK (Capacitor)
mengambil data dari sini; keduanya menyimpan hasil di `localStorage` supaya
tetap bisa dibaca **offline**, dan otomatis mengambil data terbaru saat online.

## Endpoint

| Route | Keterangan |
| --- | --- |
| `GET /` | Health check |
| `GET /api/meta` | `{ version, updatedAt, count }` — versi berubah tiap ada artikel baru/diubah |
| `GET /api/articles` | Semua artikel lengkap (termasuk `blocks`) |
| `GET /api/articles/:slug` | Satu artikel |

## Setup (sekali saja)

```bash
# 1. Buat database D1
wrangler d1 create server-tuning-db
#    -> salin database_id yang muncul ke worker/wrangler.toml

# 2. Buat tabel
wrangler d1 execute server-tuning-db --file=worker/schema.sql

# 3. Seed artikel dari public/content/*.json
node worker/seed.mjs
wrangler d1 execute server-tuning-db --file=worker/seed.sql

# 4. Deploy Worker
wrangler deploy
#    -> catat URL-nya, mis. https://server-tuning-api.<subdomain>.workers.dev
```

## Menghubungkan website & APK

Isi `apiBaseUrl` di `public/config.json` dengan URL Worker (tanpa trailing
slash). Contoh:

```json
{ "apiBaseUrl": "https://server-tuning-api.denitriyono03.workers.dev" }
```

Selama `apiBaseUrl` kosong, aplikasi memakai artikel JSON yang terbungkus di
dalam build (mode bundle) — tetap jalan penuh, hanya tidak bisa update dari
server.

## Menambah / mengubah artikel

1. Tambah atau ubah file JSON di `public/content/` (lihat `docs/CONTENT_GUIDE.md`).
2. Jalankan `node worker/seed.mjs`, lalu execute `worker/seed.sql` ke D1.
3. Build & deploy ulang website/APK supaya bundle fallback-nya ikut baru.
   Aplikasi yang sudah terinstal akan mengambil konten baru dari API saat
   online (cek `/api/meta` → versi berubah → unduh → simpan ke cache).
