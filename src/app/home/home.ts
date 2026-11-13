import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Article } from '../models/article.model';
import { ContentService } from '../services/content.service';
import { BlockRendererComponent, FALLBACK_IMG } from '../block-renderer/block-renderer';

export type SortMode = 'newest' | 'oldest' | 'title';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent implements OnInit {
  private content = inject(ContentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly articles = toSignal(this.content.articles$, { initialValue: [] as Article[] });
  readonly config = toSignal(this.content.config$, { initialValue: null });

  readonly q = signal('');
  readonly category = signal('');
  readonly tag = signal('');
  readonly sort = signal<SortMode>('newest');

  // treeData() membaca BehaviorSubject (bukan signal), jadi computed di atasnya
  // tidak reaktif — turunkan kategori langsung dari signal articles().
  readonly categories = computed(() =>
    [...new Set(this.articles().map((a) => a.category).filter(Boolean))].sort(),
  );
  readonly allTags = computed(() =>
    [...new Set(this.articles().flatMap((a) => a.tags ?? []))].sort(),
  );

  readonly filtered = computed(() => {
    const query = this.q().trim().toLowerCase();
    const cat = this.category();
    const tag = this.tag();
    let list = this.articles().filter((a) => {
      if (cat && a.category !== cat) return false;
      if (tag && !(a.tags ?? []).includes(tag)) return false;
      if (!query) return true;
      const hay = [
        a.title,
        a.subtitle,
        a.category,
        (a.tags ?? []).join(' '),
        BlockRendererComponent.blocksText(a.blocks),
      ]
        .join(' ')
        .toLowerCase();
      return query.split(/\s+/).every((word) => hay.includes(word));
    });
    const mode = this.sort();
    if (mode === 'oldest') {
      list = [...list].sort((a, b) => String(a.dateCreated).localeCompare(String(b.dateCreated)));
    } else if (mode === 'title') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'id'));
    } else {
      list = [...list].sort((a, b) => String(b.dateCreated).localeCompare(String(a.dateCreated)));
    }
    return list;
  });

  readonly hasFilter = computed(() => !!this.q().trim() || !!this.category() || !!this.tag());

  readonly featured = computed(() =>
    this.hasFilter() ? null : (this.filtered()[0] ?? null),
  );

  readonly rest = computed(() => {
    const list = this.filtered();
    const feat = this.featured();
    return feat ? list.filter((a) => a.slug !== feat.slug) : list;
  });

  ngOnInit(): void {
    void this.content.load();
    this.route.paramMap.subscribe((params) => {
      const url = this.router.url;
      if (url.startsWith('/category/')) {
        this.category.set(decodeURIComponent(params.get('name') ?? ''));
        this.tag.set('');
      } else if (url.startsWith('/tag/')) {
        this.tag.set(decodeURIComponent(params.get('tag') ?? ''));
        this.category.set('');
      } else {
        this.category.set('');
        this.tag.set('');
      }
    });
  }

  resetFilters(): void {
    this.q.set('');
    this.category.set('');
    this.tag.set('');
    void this.router.navigate(['/']);
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
