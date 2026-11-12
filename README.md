# Server Tuning Wiki

Wiki performa server: panduan tuning NGINX, download file, database, caching,
dan Linux — supaya aplikasi cepat, tahan banyak concurrent, dan hemat resource.
Dibangun dengan **vanilla JavaScript + Vite + TailwindCSS v4**, tanpa framework.

🌐 **Live (rencana):** https://denitriyono03.github.io/server-tuning-wiki/

## Satu kode, dua bentuk: website + APK

Kode yang sama dipakai untuk website dan aplikasi Android (APK):

| Bentuk | Cara jalan | Data |
| --- | --- | --- |
| Website | GitHub Pages | Ambil dari API Cloudflare, simpan cache di browser |
| APK Android | Capacitor (WebView) | Sama — ambil dari API saat online, baca cache saat offline |

**Tidak ada kode ganda.** Tambahan khusus APK hanya: `capacitor.config.ts`,
folder `android/`, dan workflow `build-apk.yml` — logika aplikasi, artikel,
dan sinkronisasi datanya 100% sama dengan website.

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
   (`src/content/*.json`) — jadi tetap jalan walau offline total.
2. Di latar belakang, aplikasi cek `/api/meta`. Kalau versinya berubah,
   aplikasi unduh `/api/articles` dan simpan ke `localStorage`.
3. Buka berikutnya (online maupun offline) memakai cache terbaru.
4. Status sinkronisasi tampil di footer: `● Online — data terbaru` /
   `○ Offline — menampilkan data tersimpan`.

API tinggal di Cloudflare (gratis): Worker `server-tuning-api` + database D1
`server-tuning-db`. Lihat `worker/README.md` untuk setup & cara seed data.

## Menjalankan lokal

```bash
npm install
npm run dev        # http://localhost:5173 (mode bundle, tanpa API)
npm run build      # output ke dist/ (base /server-tuning-wiki/)
npm run preview    # cek hasil build lokal
```

Untuk mengetes mode API secara lokal, isi `apiBaseUrl` di `public/config.json`
dengan URL Worker, lalu `npm run build && npm run preview`.

## Menambah / mengubah artikel

1. Tambah atau ubah file JSON di `src/content/` (lihat `docs/CONTENT_GUIDE.md`).
2. Jalankan `node worker/seed.mjs`, lalu execute `worker/seed.sql` ke D1 —
   website & APK yang online akan mengambil konten baru otomatis.
3. Build & deploy ulang website/APK supaya bundle fallback-nya ikut baru.

> Artikel diurutkan berdasarkan `dateCreated` (terbaru dulu). `related[]` berisi
> slug artikel lain; kalau kosong atau kurang dari 3, aplikasi otomatis mengisi
> dari kategori/tag yang sama.

## Mengubah tema & API

Edit `public/config.json` — satu file untuk tema, identitas, dan alamat API:

```json
{
  "siteTitle": "Server Tuning Wiki",
  "apiBaseUrl": "https://server-tuning-api.<subdomain>.workers.dev",
  "colors": { "primary": "#4f46e5", "secondary": "#059669", "...": "..." },
  "colorsDark": { "...": "palet untuk dark mode" }
}
```

Kosongkan `apiBaseUrl` (`""`) untuk mode bundle saja — aplikasi tetap jalan
penuh, hanya tidak bisa update dari server.

## Membangun APK (Capacitor)

```bash
npm run build:apk   # vite build --base ./ && npx cap sync android
```

APK debug dibangun otomatis oleh GitHub Actions setiap push ke `main`
(workflow `.github/workflows/build-apk.yml`, file workflow harus dipaste
manual ke repo — lihat bagian Deploy). Artefaknya bernama
`ServerTuningWiki-debug-apk`, bisa diunduh dari halaman Actions run dan
diinstal langsung di HP Android.

## Deploy

Repo: **denitriyono03/server-tuning-wiki** (public, branch `main`) — dibuat
manual oleh pemilik repo (integrasi GitHub App tidak bisa membuat repo).

1. **Push kode** (file non-workflow) ke branch `main`.
2. **Buat workflow deploy:** di GitHub, buat file `.github/workflows/deploy.yml`
   dan `.github/workflows/build-apk.yml`, lalu paste isi file yang sama dari
   repo ini (file workflow tidak bisa di-push oleh integrasi GitHub App, jadi
   harus dipaste manual lewat web UI).
3. **Aktifkan Pages:** repo → **Settings → Pages → Build and deployment →
   Source: GitHub Actions**. (Kalau deploy pertama gagal di langkah
   `deploy-pages`, biasanya Pages belum diaktifkan — aktifkan lalu re-run.)
4. Tunggu workflow selesai — website live di
   **https://denitriyono03.github.io/server-tuning-wiki/** dan APK muncul
   sebagai artefak di Actions run.

Catatan: `vite.config.js` mengatur `base: '/server-tuning-wiki/'` untuk website.
Build APK memakai `--base ./` supaya aset dimuat relatif dari dalam aplikasi.

## Fitur

- **Home (`#/`):** hero, live search (judul, tag, kategori, isi artikel), filter kategori & tag, sort (terbaru/terlama/A–Z), artikel pilihan, kartu artikel dengan estimasi waktu baca.
- **Artikel (`#/article/:slug`):** cover, meta (penulis, tanggal, difficulty), daftar isi otomatis dengan scroll-spy, reading progress bar, blok kode dengan tombol salin + toast, navigasi prev/next, dan seksi **Konten Terkait**.
- **Sidebar tree:** kategori → artikel → artikel turunan (maks. 3 level), breadcrumb, drawer di mobile.
- **Sinkronisasi data:** cek API di latar belakang, cache di `localStorage`, tetap bisa dibaca offline (website & APK).
- **Dark/light mode:** toggle di header, tersimpan di `localStorage`, mengikuti `prefers-color-scheme` saat pertama kali dibuka.
- **Shortcut keyboard:** tekan `/` untuk fokus ke kotak pencarian.
- **Lainnya:** tombol back-to-top, tampilan ramah print, fallback gambar otomatis kalau URL gambar mati.

## Blok konten yang didukung

`heading` (h2/h3) · `paragraph` (dengan `**bold**`, `` `kode` ``, `[link](url)`, `==highlight==`) · `callout` (info/tip/warning/danger) · `code` (syntax highlighting + tombol salin) · `list` (bernomor/tidak) · `table` · `quote` · `image` · `divider`. Lihat `docs/CONTENT_GUIDE.md` untuk contoh lengkap.

## Struktur folder

```
server-tuning-wiki/
├── index.html
├── vite.config.js
├── capacitor.config.ts      # config APK (appId, webDir)
├── package.json
├── public/
│   └── config.json          # tema, identitas situs, apiBaseUrl (SATU file)
├── src/
│   ├── main.js              # router hash + logika aplikasi + sinkronisasi API
│   ├── renderer.js          # renderer blok + parser inline formatting
│   ├── styles.css           # Tailwind + gaya kustom (callout, TOC, code)
│   └── content/             # satu file JSON per artikel (bundle fallback + sumber seed D1)
├── worker/                  # API Cloudflare Worker + D1
│   ├── src/index.js         # GET /api/meta, /api/articles, /api/articles/:slug
│   ├── wrangler.toml
│   ├── schema.sql           # skema tabel articles
│   ├── seed.mjs             # generate seed.sql dari src/content/*.json
│   └── README.md
├── android/                 # proyek native Capacitor (di-generate, jangan edit manual)
├── docs/
│   └── CONTENT_GUIDE.md     # panduan & template artikel
└── .github/workflows/
    ├── deploy.yml           # deploy website ke GitHub Pages (paste manual)
    └── build-apk.yml        # build APK debug (paste manual)
```

## Teknologi

- [Vite](https://vite.dev/) — build tool & dev server
- [TailwindCSS v4](https://tailwindcss.com/) — utility-first CSS
- [highlight.js](https://highlightjs.org/) — syntax highlighting (di-bundle, tanpa CDN)
- [Cloudflare Workers + D1](https://developers.cloudflare.com/workers/) — API & database (gratis)
- [Capacitor](https://capacitorjs.com/) — bungkus web jadi APK Android
