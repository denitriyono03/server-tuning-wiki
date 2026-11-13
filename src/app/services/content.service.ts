import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, lastValueFrom, timeout } from 'rxjs';
import { Article, WikiConfig } from '../models/article.model';
import { HttpLogService } from './http-log.service';

export type SyncStatus = 'bundled' | 'cached' | 'synced' | 'offline';

export interface TreeData {
  categories: string[];
  roots: Article[];
  childrenOf: Map<string, Article[]>;
}

const CACHE_KEY = 'stw-articles-v1';
const META_KEY = 'stw-articles-meta-v1';

const FALLBACK_CONFIG: WikiConfig = {
  siteTitle: 'Server Tuning Wiki',
  siteSubtitle: 'Bikin server ngebut',
  siteDescription: 'Panduan tuning server untuk performa.',
  defaultAuthor: 'Deni',
  apiBaseUrl: '',
};

@Injectable({ providedIn: 'root' })
export class ContentService {
  private http = inject(HttpClient);
  private httpLog = inject(HttpLogService);

  readonly config$ = new BehaviorSubject<WikiConfig | null>(null);
  readonly articles$ = new BehaviorSubject<Article[]>([]);
  readonly syncStatus$ = new BehaviorSubject<SyncStatus>('bundled');

  private loadPromise: Promise<void> | null = null;

  /** Idempotent: aman dipanggil dari beberapa komponen sekaligus. */
  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.doLoad();
    }
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    // 1. Config (tema, identitas, apiBaseUrl).
    try {
      const cfg = await this.timedGet<WikiConfig>('config.json', 'config');
      if (cfg && typeof cfg.siteTitle === 'string') {
        this.config$.next({ ...FALLBACK_CONFIG, ...cfg });
      } else {
        this.config$.next(FALLBACK_CONFIG);
      }
    } catch {
      this.config$.next(FALLBACK_CONFIG);
    }

    // 2. Bundle: index + tiap artikel (paralel, abaikan yang gagal).
    try {
      const index = await this.timedGet<{ articles: { slug: string }[] }>(
        'content/index.json',
        'bundle',
      );
      const slugs = (index?.articles ?? []).map((a) => a.slug).filter(Boolean);
      const settled = await Promise.allSettled(
        slugs.map((slug) => this.timedGet<Article>(`content/${slug}.json`, 'bundle')),
      );
      const bundled = settled
        .filter(
          (r): r is PromiseFulfilledResult<Article> =>
            r.status === 'fulfilled' && !!r.value && typeof r.value.slug === 'string',
        )
        .map((r) => r.value);
      if (bundled.length > 0) {
        this.articles$.next(this.sortArticles(bundled));
      }
    } catch {
      // Tetap lanjut: cache / API mungkin masih bisa mengisi artikel.
    }

    // 3. Cache localStorage (lebih baru dari bundle) menimpa tampilan.
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: unknown = JSON.parse(raw);
        if (
          Array.isArray(cached) &&
          cached.length > 0 &&
          cached.every((a) => a && typeof a.slug === 'string' && Array.isArray(a.blocks))
        ) {
          this.articles$.next(this.sortArticles(cached as Article[]));
          this.syncStatus$.next('cached');
        }
      }
    } catch {
      // Cache rusak — tetap pakai bundle.
    }

    // 4. Sinkronisasi API di latar belakang (jangan await).
    void this.refreshFromApi();
  }

  /**
   * Cek /api/meta; bila versi berubah, unduh /api/articles dan simpan ke cache.
   * Dipanggil otomatis setelah load() dan saat aplikasi kembali online.
   */
  async refreshFromApi(): Promise<void> {
    const base = (this.config$.value?.apiBaseUrl ?? '').replace(/\/$/, '');
    if (!base) {
      return;
    }
    try {
      const meta = await this.timedGet<{ version: string; updatedAt?: string; count?: number }>(
        `${base}/api/meta`,
        'meta',
        5000,
      );
      let cachedMeta: { version?: string } | null = null;
      try {
        cachedMeta = JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
      } catch {
        cachedMeta = null;
      }
      if (cachedMeta && cachedMeta.version === meta.version) {
        this.syncStatus$.next('synced');
        return;
      }
      const list = await this.timedGet<unknown>(`${base}/api/articles`, 'articles', 5000);
      if (
        !Array.isArray(list) ||
        list.length === 0 ||
        !list.every((a) => a && typeof (a as Article).slug === 'string' && Array.isArray((a as Article).blocks))
      ) {
        throw new Error('payload artikel tidak valid');
      }
      const articles = list as Article[];
      localStorage.setItem(CACHE_KEY, JSON.stringify(articles));
      localStorage.setItem(
        META_KEY,
        JSON.stringify({ version: meta.version, updatedAt: meta.updatedAt ?? new Date().toISOString() }),
      );
      this.articles$.next(this.sortArticles(articles));
      this.syncStatus$.next('synced');
    } catch {
      this.syncStatus$.next(
        typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'cached',
      );
    }
  }

  getArticle(slug: string): Article | undefined {
    return this.articles$.value.find((a) => a.slug === slug);
  }

  treeData(): TreeData {
    const articles = this.articles$.value;
    const bySlug = new Map(articles.map((a) => [a.slug, a]));
    const childrenOf = new Map<string, Article[]>();
    for (const a of articles) {
      if (a.parent && bySlug.has(a.parent)) {
        const list = childrenOf.get(a.parent) ?? [];
        list.push(a);
        childrenOf.set(a.parent, list);
      }
    }
    for (const list of childrenOf.values()) {
      list.sort((x, y) => (x.order ?? 9999) - (y.order ?? 9999) || x.title.localeCompare(y.title, 'id'));
    }
    const roots = articles
      .filter((a) => !a.parent || !bySlug.has(a.parent))
      .sort((x, y) => (x.order ?? 9999) - (y.order ?? 9999) || x.title.localeCompare(y.title, 'id'));
    const categories = [...new Set(roots.map((a) => a.category).filter(Boolean))].sort();
    return { categories, roots, childrenOf };
  }

  relatedArticles(article: Article): Article[] {
    const bySlug = new Map(this.articles$.value.map((a) => [a.slug, a]));
    const picked: Article[] = [];
    for (const slug of article.related ?? []) {
      const a = bySlug.get(slug);
      if (a && a.slug !== article.slug && !picked.includes(a)) {
        picked.push(a);
      }
    }
    if (picked.length < 3) {
      const same = this.articles$.value.filter(
        (a) =>
          a.slug !== article.slug &&
          !picked.includes(a) &&
          (a.category === article.category ||
            (a.tags ?? []).some((t) => (article.tags ?? []).includes(t))),
      );
      for (const a of same) {
        if (picked.length >= 3) break;
        picked.push(a);
      }
    }
    return picked.slice(0, 3);
  }

  /** Hapus cache API lalu muat ulang dari bundle. */
  clearCache(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(META_KEY);
    } catch {
      // Abaikan bila storage tidak tersedia.
    }
    this.syncStatus$.next('bundled');
    this.loadPromise = null;
    void this.load();
  }

  private sortArticles(list: Article[]): Article[] {
    return [...list].sort((a, b) =>
      String(b.dateCreated).localeCompare(String(a.dateCreated)),
    );
  }

  private async timedGet<T>(
    url: string,
    kind: 'meta' | 'articles' | 'bundle' | 'config',
    timeoutMs?: number,
  ): Promise<T> {
    const start = performance.now();
    try {
      const request$ = this.http.get<T>(url);
      const value = await lastValueFrom(
        timeoutMs ? request$.pipe(timeout(timeoutMs)) : request$,
      );
      this.httpLog.log({
        method: 'GET',
        url,
        status: 200,
        ms: Math.round(performance.now() - start),
        kind,
      });
      return value;
    } catch (err) {
      this.httpLog.log({
        method: 'GET',
        url,
        status: 'error',
        ms: Math.round(performance.now() - start),
        kind,
      });
      throw err;
    }
  }
}
