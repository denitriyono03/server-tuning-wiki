import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { combineLatest } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { Article } from '../models/article.model';
import { ContentService } from '../services/content.service';
import { BlockRendererComponent, FALLBACK_IMG } from '../block-renderer/block-renderer';

@Component({
  selector: 'app-article',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    BlockRendererComponent,
  ],
  templateUrl: './article.html',
  styleUrl: './article.scss',
})
export class ArticleComponent implements OnInit {
  private content = inject(ContentService);
  private route = inject(ActivatedRoute);

  readonly config = this.content.config$;
  readonly article = signal<Article | null>(null);
  readonly progress = signal(0);
  readonly showTop = signal(false);
  readonly activeHeading = signal('');

  readonly headings = computed(() =>
    BlockRendererComponent.collectHeadings(this.article()?.blocks ?? []),
  );

  readonly ancestors = computed(() => {
    const a = this.article();
    if (!a) return [] as Article[];
    const chain: Article[] = [];
    const seen = new Set<string>();
    let cur = a;
    while (cur.parent && !seen.has(cur.slug)) {
      seen.add(cur.slug);
      const parent = this.content.getArticle(cur.parent);
      if (!parent) break;
      chain.unshift(parent);
      cur = parent;
    }
    return chain;
  });

  readonly related = computed(() => {
    const a = this.article();
    return a ? this.content.relatedArticles(a) : [];
  });

  readonly prevNext = computed(() => {
    const a = this.article();
    if (!a) return { prev: null as Article | null, next: null as Article | null };
    const list = this.content.articles$.value;
    const idx = list.findIndex((x) => x.slug === a.slug);
    return {
      prev: idx >= 0 ? (list[idx + 1] ?? null) : null,
      next: idx >= 0 ? (list[idx - 1] ?? null) : null,
    };
  });

  ngOnInit(): void {
    void this.content.load();
    combineLatest([this.route.paramMap, this.content.articles$]).subscribe(([params]) => {
      const slug = params.get('slug') ?? '';
      const found = this.content.getArticle(slug) ?? null;
      if (found?.slug !== this.article()?.slug) {
        this.article.set(found);
        this.activeHeading.set('');
        this.progress.set(0);
        window.scrollTo({ top: 0 });
      }
    });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    this.progress.set(max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0);
    this.showTop.set(doc.scrollTop > 400);
    let current = '';
    for (const h of this.headings()) {
      const el = document.getElementById(h.id);
      if (el && el.getBoundingClientRect().top <= 120) {
        current = h.id;
      }
    }
    if (current !== this.activeHeading()) {
      this.activeHeading.set(current);
    }
  }

  scrollToHeading(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  readingTime(article: Article): string {
    const words = [
      article.title,
      article.subtitle,
      BlockRendererComponent.blocksText(article.blocks),
    ]
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;
    return `${Math.max(1, Math.ceil(words / 200))} mnt baca`;
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) {
      img.onerror = null;
      img.src = FALLBACK_IMG;
    }
  }
}
