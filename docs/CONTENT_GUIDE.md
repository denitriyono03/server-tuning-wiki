# Panduan Menulis Artikel — Server Tuning Wiki

Setiap artikel adalah **satu file JSON** di `public/content/`. Nama file bebas, tapi disarankan sama dengan `slug`, mis. `public/content/nginx-cache.json`.

**Wajib:** setiap artikel harus didaftarkan di `public/content/index.json`
(manifest). Aplikasi hanya memuat artikel yang ada di manifest — file JSON
tanpa entri di `index.json` tidak akan tampil. Format entri:

```json
{
  "articles": [
    { "slug": "nginx-cache", "title": "Cache di NGINX: proxy_cache & fastcgi_cache", "category": "NGINX" }
  ]
}
```

Menambah artikel = tambah file JSON **+** tambah satu entri di `index.json`.
Menghapus artikel = hapus file JSON **dan** hapus entrinya dari `index.json`.

**Sudut pandang wajib: performa.** Setiap artikel harus menjawab: berapa
cepat, berapa banyak concurrent yang bisa ditangani, dan berapa biayanya
(CPU, memori, bandwidth). Sertakan angka konkret (latency, throughput,
ukuran cache/pool) dan konfigurasi nyata yang bisa dicopy-paste.

## Artikel & API (Cloudflare D1)

File JSON di `public/content/` punya dua peran:

1. **Bundle fallback** — terbungkus di dalam build website & APK, jadi aplikasi
   tetap jalan saat pertama dibuka offline.
2. **Sumber seed database** — isi D1 diambil dari file-file ini.

Setelah menambah/mengubah artikel, jalankan:

```bash
node worker/seed.mjs
wrangler d1 execute server-tuning-db --file=worker/seed.sql
```

`seed.mjs` membaca semua file `public/content/*.json` **kecuali** `index.json`
(manifest bukan artikel, jadi tidak ikut di-seed).

Lalu build & deploy ulang website/APK supaya bundle fallback-nya ikut baru.
Aplikasi yang sudah terinstal akan mengambil konten baru dari API saat online
(cek `/api/meta` → versi berubah → unduh → simpan ke cache).

## Skema artikel

```json
{
  "slug": "contoh-artikel",
  "title": "Judul Artikel",
  "subtitle": "Satu kalimat penjelasan singkat.",
  "image": "https://images.unsplash.com/photo-...?auto=format&fit=crop&w=1200&q=80",
  "imageAlt": "Deskripsi singkat gambar untuk aksesibilitas",
  "author": "Deni",
  "dateCreated": "2026-11-13",
  "dateUpdated": "2026-11-13",
  "category": "NGINX",
  "tags": ["tag-satu", "tag-dua"],
  "difficulty": "Pemula",
  "parent": null,
  "order": 1,
  "source": { "label": "Nama Dokumentasi", "url": "https://docs.example.com" },
  "blocks": [ ... ],
  "related": ["slug-artikel-lain", "slug-artikel-lainnya"]
}
```

| Field | Wajib | Keterangan |
|---|---|---|
| `slug` | Ya | Unik, huruf kecil, tanpa spasi. Menjadi URL: `#/article/<slug>`. |
| `title` | Ya | Judul utama, tampil di kartu dan halaman artikel. |
| `subtitle` | Ya | Satu kalimat, tampil di bawah judul. |
| `image` | Tidak | URL gambar cover (disarankan Unsplash, lebar 1200). Kalau gagal dimuat, otomatis diganti placeholder gradient. |
| `imageAlt` | Tidak | Teks alternatif gambar. |
| `author` | Tidak | Default dari `config.json` (`defaultAuthor`) kalau kosong. |
| `dateCreated` | Ya | Format `YYYY-MM-DD`. Dipakai untuk sorting (terbaru dulu). |
| `dateUpdated` | Tidak | Tampilkan kalau artikel diperbarui. |
| `category` | Ya | Satu kategori, mis. `NGINX`, `Database`, `Download & Cache`, `Sistem Operasi`. |
| `tags` | Ya | Array string, bisa diklik untuk filter. |
| `difficulty` | Ya | Salah satu: `"Pemula"`, `"Menengah"`, `"Mahir"`. |
| `parent` | Tidak | Slug artikel induk (`null` atau diisi slug yang sudah ada) — menempatkan artikel ini sebagai anak di sidebar tree. Lihat "Struktur tree" di bawah. |
| `order` | Tidak | Angka urutan di antara saudara kandung (level yang sama, induk yang sama). Angka kecil tampil dulu; kalau kosong, diurutkan setelah yang bernomor, lalu alfabetis. |
| `source` | Tidak | `{ label, url }` — sumber utama, ditampilkan di akhir artikel. |
| `blocks` | Ya | Isi artikel (lihat di bawah). |
| `related` | Tidak | Array slug artikel terkait (maks. 3 ditampilkan). Kalau kurang, aplikasi otomatis mengisi dari kategori/tag yang sama. |

## Struktur tree (sidebar) — maksimal 3 tingkat bersarang

Sidebar menampilkan artikel sebagai tree:

```
Level 1 — Kategori (mis. Web Server)          ← grup, bisa dilipat
  Artikel tingkat 1 — Induk (mis. NGINX)      ← parent: null
    Artikel tingkat 2 — Turunan (mis. Reverse Proxy)
      Artikel tingkat 3 — Turunan dari turunan (mis. Rate Limiting)
```

Aturan:

- **Level 1** adalah kategori — otomatis dari field `category` artikel induk.
- **Artikel tingkat 1** adalah artikel dengan `parent: null` (atau tanpa field `parent`).
- **Artikel tingkat 2** adalah artikel dengan `parent` berisi slug artikel tingkat 1 yang sudah ada. Contoh: artikel `nginx-cache` punya `"parent": "nginx-overview"`.
- **Artikel tingkat 3** adalah artikel dengan `parent` berisi slug artikel tingkat 2 yang sudah ada. Contoh: artikel `nginx-reverse-proxy-tuning` punya `"parent": "nginx-worker-tuning"`.
- **Maksimal 3 tingkat bersarang.** Artikel tingkat 3 **tidak boleh** punya anak — jangan mengisi `parent` dengan slug artikel tingkat 3. Kalau itu tetap terjadi, sidebar tetap menampilkannya (kode mendukung kedalaman berapa pun), tapi struktur jadi sulit dinavigasi.
- `parent` harus berisi slug yang sudah ada. Slug yang tidak ditemukan dianggap tidak punya induk (diperlakukan sebagai artikel tingkat 1).
- `order` mengatur urutan di antara saudara kandung. Contoh: dua anak NGINX, `"order": 1` tampil sebelum `"order": 2`.

Contoh — rantai NGINX yang sudah ada di wiki ini:

```json
// public/content/nginx-overview.json
{ "slug": "nginx-overview", "parent": null, "order": 1, "category": "NGINX", ... }

// public/content/nginx-worker-tuning.json
{ "slug": "nginx-worker-tuning", "parent": "nginx-overview", "order": 4, ... }

// public/content/nginx-reverse-proxy-tuning.json
{ "slug": "nginx-reverse-proxy-tuning", "parent": "nginx-worker-tuning", "order": 1, ... }

// public/content/nginx-load-balancing.json
{ "slug": "nginx-load-balancing", "parent": "nginx-reverse-proxy-tuning", "order": 1, ... }
```

Breadcrumb di halaman artikel mengikuti rantai yang sama, mis. `Beranda / NGINX / Tuning NGINX untuk Performa / Worker, Koneksi & Keepalive`.

## Tipe blok

### heading — judul bagian (otomatis masuk Daftar Isi)

```json
{ "type": "heading", "level": 2, "text": "Cara Kerja" }
```

`level` hanya `2` atau `3`. Heading level 2 dan 3 otomatis muncul di daftar isi (TOC) dengan scroll-spy.

### paragraph — teks dengan format inline

```json
{ "type": "paragraph", "text": "Teks **tebal**, `kode inline`, [tautan](https://example.com), dan ==teks yang di-highlight==." }
```

Format inline yang didukung:

- `**teks**` → **tebal**
- `` `kode` `` → `kode inline`
- `[label](https://url)` → link (dibuka di tab baru)
- `==teks==` → teks dengan highlight kuning

### callout — kotak catatan (info / tip / warning / danger)

```json
{ "type": "callout", "kind": "tip", "title": "Tips", "text": "Selalu jalankan `nginx -t` sebelum reload." }
```

`kind`: `info`, `tip`, `warning`, atau `danger`. `title` boleh dikosongkan.

### code — blok kode dengan syntax highlighting + tombol salin

```json
{
  "type": "code",
  "language": "bash",
  "filename": "contoh.sh",
  "code": "echo \"Hello, Wiki!\"\nls -la"
}
```

`language` mengikuti nama bahasa highlight.js yang didaftarkan di aplikasi: `nginx`, `bash`, `sql`, `python`, `yaml`, `json`, `ini`, `plaintext`. Bahasa di luar daftar ini tetap tampil sebagai teks biasa (tanpa highlight). `filename` ditampilkan di header blok; kalau dikosongkan, yang tampil nama bahasanya. Tulis `code` dengan `\n` untuk baris baru.

### list — daftar berpoin / bernomor

```json
{ "type": "list", "ordered": false, "items": ["Item **pertama**", "Item `kedua`", "Item [ketiga](https://example.com)"] }
```

`ordered: true` untuk daftar bernomor. Item mendukung format inline yang sama seperti paragraph.

### table — tabel

```json
{
  "type": "table",
  "headers": ["Kolom 1", "Kolom 2"],
  "rows": [
    ["Baris 1 **tebal**", "Nilai 1"],
    ["Baris 2", "`kode`"]
  ]
}
```

Sel header dan isi mendukung format inline.

### quote — kutipan

```json
{ "type": "quote", "text": "Premature optimization is the root of all evil.", "cite": "Donald Knuth" }
```

### image — gambar di tengah artikel

```json
{ "type": "image", "url": "https://images.unsplash.com/photo-...?auto=format&fit=crop&w=1200&q=80", "caption": "Keterangan gambar" }
```

### divider — garis pemisah

```json
{ "type": "divider" }
```

## Template lengkap (copy-paste)

```json
{
  "slug": "template-artikel",
  "title": "Judul Artikel Baru",
  "subtitle": "Satu kalimat penjelasan singkat tentang artikel ini.",
  "image": "https://images.unsplash.com/photo-1518432031352-d6fc5c10da5a?auto=format&fit=crop&w=1200&q=80",
  "imageAlt": "Kode program di layar",
  "author": "Deni",
  "dateCreated": "2026-11-13",
  "dateUpdated": "2026-11-13",
  "category": "NGINX",
  "tags": ["contoh", "template"],
  "difficulty": "Pemula",
  "parent": null,
  "order": 1,
  "source": { "label": "Dokumentasi Resmi", "url": "https://example.com/docs" },
  "blocks": [
    { "type": "paragraph", "text": "Paragraf pembuka dengan **tebal**, `kode inline`, [tautan](https://example.com), dan ==highlight==." },
    { "type": "callout", "kind": "tip", "title": "Tips", "text": "Ini kotak tips yang menonjol." },
    { "type": "heading", "level": 2, "text": "Bagian Pertama" },
    { "type": "paragraph", "text": "Penjelasan bagian pertama." },
    { "type": "code", "language": "bash", "filename": "contoh.sh", "code": "echo \"Hello\"\nls -la" },
    { "type": "list", "ordered": false, "items": ["Poin satu", "Poin dua"] },
    { "type": "table", "headers": ["A", "B"], "rows": [["1", "2"]] },
    { "type": "quote", "text": "Sebuah kutipan penting.", "cite": "Seseorang" },
    { "type": "image", "url": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80", "caption": "Contoh gambar" },
    { "type": "divider" },
    { "type": "heading", "level": 2, "text": "Referensi" },
    { "type": "paragraph", "text": "Baca [Dokumentasi Resmi](https://example.com/docs) untuk detail lebih lanjut." }
  ],
  "related": ["nginx-cache", "nginx-worker-tuning"]
}
```

## Tips menulis

- **Panjang ideal:** 800–1500 kata isi (tidak termasuk kode). To-the-point, tanpa filler.
- **Setiap artikel sebaiknya punya:** minimal 2 blok kode, minimal 2 callout, minimal 3 link ke dokumentasi resmi.
- **Sudut pandang performa:** tiap teknik wajib menyebut dampaknya (mis. "cache hit memangkas latency dari 200 ms jadi 5 ms", "pool 20 koneksi cukup untuk 500 req/detik"). Kalau ada trade-off (CPU vs ukuran, memori vs kecepatan), sebutkan.
- **Gambar:** pakai URL Unsplash (`images.unsplash.com`) dengan parameter `?auto=format&fit=crop&w=1200&q=80`. Cek dengan `curl -sI <url>` — harus mengembalikan HTTP 200.
- **Bahasa:** tulis dalam Bahasa Indonesia, istilah teknis tetap dalam Bahasa Inggris (mis. `reverse proxy`, `cache hit ratio`, `file descriptor`).
- **Judul blok `heading`:** pakai kalimat pendek dan deskriptif — judul ini yang muncul di Daftar Isi.
