# Server Tuning Wiki

Wiki performa server: panduan tuning NGINX, download file, database, caching,
dan Linux — supaya aplikasi cepat, tahan banyak concurrent, dan hemat resource.
Dibangun dengan **Angular 22 + Angular Material**, komponen standalone dan
routing lazy.

🌐 **Live:** https://denitriyono03.github.io/server-tuning-wiki/

## Satu kode, dua bentuk: website + APK

Kode yang sama dipakai untuk website dan aplikasi Android (APK):

| Bentuk | Cara jalan | Data |
| --- | --- | --- |
| Website | GitHub Pages | Ambil dari API Cloudflare, simpan cache di browser |
| APK Android | Capacitor (WebView) | Sama — ambil dari API saat online, baca cache saat offline |

**Tidak ada kode ganda.** Tambahan khusus APK hanya: `capacitor.config.ts`,
folder `android/`, dan workflow `build-apk.yml` — logika aplikasi, artikel,
dan sinkronisasi datanya 100% sama dengan website.

## Arsitektur

- **Angular 22** (standalone components, lazy routes) + **Angular Material 22**
  (sidenav, toolbar, card, chip, dialog, tabel) + **Material Symbols** untuk ikon.
- **Tema & identitas** di `public/config.json` (warna terang/gelap, judul situs,
  `apiBaseUrl`); palet diterapkan lewat `ThemeService` + `src/styles.scss`.
- **Maskot & logo:** Scout si raven (`public/scout-logo.webp`,
  `public/scout-mascot.webp`) — tampil di header, sidebar, dan empty state.
- **API & database:** Cloudflare Worker + D1 (gratis). Endpoint:
  `GET /api/meta`, `GET /api/articles`, `GET /api/articles/:slug`
  (lihat `worker/README.md`).

## Cara kerja data (API dulu, offline tetap jalan)

```
API Cloudflare Worker + D1 ──► /api/meta (cek versi)
        │                          │ versi baru?
        ▼                          ▼ ya
  Artikel terbaru            /api/articles ──► simpan ke localStorage
        │                          │ tidak / offline
        ▼                          ▼
  localStorage (cache) ──► tampil di aplikasi
        ▲
  Bundle JSON (fallback pertama kali buka offline)
```

1. Saat pertama dibuka, aplikasi menampilkan artikel dari **bundle JSON**
   (`public/content/*.json`, didaftar di `public/content/index.json`) — jadi
   tetap jalan walau offline total.
2. Di latar belakang, `ContentService` cek `/api/meta`. Kalau versinya berubah,
   aplikasi unduh `/api/articles` dan simpan ke `localStorage`.
3. Buka berikutnya (online maupun offline) memakai cache terbaru.
4. Status sinkronisasi tampil di footer dan di halaman debug (`/debug`).

## Menjalankan lokal

```bash
npm install
npm run dev        # http://localhost:4200
npm run build      # output ke dist/server-tuning-wiki/ (base /server-tuning-wiki/)
```

Untuk mengetes mode API secara lokal, isi `apiBaseUrl` di `public/config.json`
dengan URL Worker, lalu `npm run build` dan sajikan folder `dist/`.

## Menambah / mengubah artikel

1. Tambah atau ubah file JSON di `public/content/` (lihat
   `docs/CONTENT_GUIDE.md` untuk skema lengkap).
2. **Wajib:** daftarkan artikel di `public/content/index.json` (tambah entri
   `{ slug, title, category }`; hapus entrinya kalau artikel dihapus). Tanpa
   entri ini artikel tidak dimuat oleh aplikasi.
3. Seed database: `node worker/seed.mjs`, lalu execute `worker/seed.sql` ke D1 —
   website & APK yang online akan mengambil konten baru otomatis.
4. Build & deploy ulang website/APK supaya bundle fallback-nya ikut baru.

## Mengubah tema

- Warna & identitas situs: edit `public/config.json` (`colors` untuk mode
  terang, `colorsDark` untuk mode gelap, plus `siteTitle`, `siteSubtitle`,
  `siteDescription`, `apiBaseUrl`).
- `ThemeService` menerapkan palet dari config sebagai CSS custom properties
  (`--color-primary`, dst.); gaya global dan override komponen ada di
  `src/styles.scss`. Mode gelap/terang tersimpan di `localStorage`.

## Halaman debug / HTTP Inspector (`/debug`)

Halaman khusus untuk memeriksa request HTTP aplikasi — pengganti Chucker,
karena Chucker hanya melihat traffic OkHttp native dan tidak bisa melihat
request `fetch` dari JavaScript di dalam WebView.

- Kartu status: status sinkronisasi, `apiBaseUrl`, jumlah artikel, versi cache,
  tombol **Refresh dari API** dan **Hapus cache**.
- Filter URL + filter jenis (`meta` / `articles` / `bundle` / `config`) dan
  tombol **Bersihkan log**.
- Tabel `MatTable` (terbaru dulu): waktu, method, URL, jenis, status
  (hijau 2xx, kuning lain, merah error), durasi ms. Empty state menampilkan
  maskot Scout bila belum ada request tercatat.
- Semua request dicatat `HttpLogService` (maks. 100 entri terakhir).

## Membangun APK (Capacitor)

```bash
npm run build:apk   # ng build --base-href ./ && npx cap sync android
```

APK debug dibangun otomatis oleh GitHub Actions setiap push ke `main`
(workflow `.github/workflows/build-apk.yml`, memakai JDK 21). Artefaknya
bernama `ServerTuningWiki-debug-apk`, bisa diunduh dari halaman Actions run
dan diinstal langsung di HP Android.

## Deploy

Repo: **denitriyono03/server-tuning-wiki** (public, branch `main`).

1. **Push kode** (file non-workflow) ke branch `main`.
2. **Workflow deploy:** file `.github/workflows/deploy.yml` dan
   `.github/workflows/build-apk.yml` tidak bisa di-push oleh integrasi GitHub
   App — keduanya di-upload lewat web UI GitHub (Add file → Upload files).
3. **Aktifkan Pages:** repo → **Settings → Pages → Build and deployment →
   Source: GitHub Actions**. (Kalau deploy pertama gagal di langkah
   `deploy-pages`, biasanya Pages belum diaktifkan — aktifkan lalu re-run.)
4. Tunggu workflow selesai — website live di
   **https://denitriyono03.github.io/server-tuning-wiki/** dan APK muncul
   sebagai artefak di Actions run.

Catatan: `angular.json` mengatur `baseHref: '/server-tuning-wiki/'` untuk
website. Build APK memakai `--base-href ./` supaya aset dimuat relatif dari
dalam aplikasi. Folder `android/` **tidak di-commit** — di-generate di CI
dengan `npx cap add android` (lihat `build-apk.yml`).

## Fitur

- **Beranda:** hero dengan maskot Scout, pencarian langsung (judul, tag,
  kategori, isi artikel), filter kategori & tag, sort (terbaru/terlama/A–Z),
  artikel pilihan, kartu artikel dengan estimasi waktu baca.
- **Artikel:** cover, meta (penulis, tanggal, difficulty), daftar isi otomatis
  dengan scroll-spy, reading progress bar, blok kode dengan syntax highlighting
  + tombol salin, navigasi prev/next, dan seksi **Konten Terkait**.
- **Sidebar tree:** kategori → artikel → artikel turunan (maks. 3 level),
  breadcrumb, dan di layar kecil menu dibuka sebagai popup dialog di tengah.
- **Sinkronisasi data:** cek API di latar belakang, cache di `localStorage`,
  tetap bisa dibaca offline (website & APK).
- **Halaman debug (`/debug`):** HTTP Inspector — log semua request aplikasi.
- **Dark/light mode:** toggle di header, tersimpan di `localStorage`, mengikuti
  `prefers-color-scheme` saat pertama kali dibuka.
- **Lainnya:** tombol back-to-top, tampilan ramah print, fallback gambar
  otomatis kalau URL gambar mati.

## Struktur folder

```
server-tuning-wiki/
├── angular.json
├── capacitor.config.ts      # config APK (appId, webDir)
├── package.json
├── public/
│   ├── config.json          # tema, identitas situs, apiBaseUrl (SATU file)
│   ├── content/             # satu file JSON per artikel + index.json (manifest)
│   │   ├── index.json
│   │   └── nginx-cache.json
│   ├── scout-logo.webp      # logo raven Scout
│   └── scout-mascot.webp    # maskot raven Scout
├── src/
│   ├── main.ts
│   ├── styles.scss          # gaya global + override tema
│   └── app/
│       ├── app.config.ts
│       ├── app.routes.ts    # lazy routes (beranda, artikel, debug, ...)
│       ├── app.ts / app.html / app.scss
│       ├── models/          # Article, WikiConfig, ...
│       ├── services/        # ContentService, HttpLogService, ThemeService
│       ├── home/            # komponen beranda
│       ├── article/         # komponen halaman artikel
│       ├── block-renderer/  # renderer blok konten + highlight.js
│       └── debug/           # halaman HTTP Inspector (/debug)
├── worker/                  # API Cloudflare Worker + D1
│   ├── src/index.js         # GET /api/meta, /api/articles, /api/articles/:slug
│   ├── wrangler.toml
│   ├── schema.sql           # skema tabel articles
│   ├── seed.mjs             # generate seed.sql dari public/content/*.json
│   └── README.md
├── android/                 # proyek native Capacitor (di-generate, jangan edit manual)
├── docs/
│   └── CONTENT_GUIDE.md     # panduan & template artikel
└── .github/workflows/
    ├── deploy.yml           # deploy website ke GitHub Pages (upload via web UI)
    └── build-apk.yml        # build APK debug, JDK 21 (upload via web UI)
```

## Teknologi

- [Angular 22](https://angular.dev/) — framework & router
- [Angular Material 22](https://material.angular.io/) — komponen UI + Material Symbols
- [highlight.js](https://highlightjs.org/) — syntax highlighting (di-bundle, tanpa CDN)
- [Cloudflare Workers + D1](https://developers.cloudflare.com/workers/) — API & database (gratis)
- [Capacitor](https://capacitorjs.com/) — bungkus web jadi APK Android
