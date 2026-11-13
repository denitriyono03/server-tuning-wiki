import { Component, Input, OnChanges, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subscription, filter } from 'rxjs';
import { Article } from '../models/article.model';

interface TreeNode {
  article: Article;
  children: TreeNode[];
}

interface CategoryGroup {
  name: string;
  roots: TreeNode[];
  count: number;
}

/**
 * Daftar isi wiki sebagai tree 3 level: kategori (bisa dilipat, badge jumlah)
 * → artikel induk → anak → cucu. Artikel aktif di-highlight dan rantai
 * induknya otomatis dibuka saat navigasi.
 */
@Component({
  selector: 'app-nav-tree',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatListModule, MatIconModule, MatButtonModule],
  templateUrl: './nav-tree.html',
  styleUrl: './nav-tree.scss',
})
export class NavTreeComponent implements OnInit, OnChanges, OnDestroy {
  @Input() articles: Article[] = [];

  private router = inject(Router);
  private sub = new Subscription();

  groups: CategoryGroup[] = [];
  expandedCats = new Set<string>();
  expandedNodes = new Set<string>();
  private catsInitialized = false;

  ngOnInit(): void {
    this.buildTree();
    this.expandActiveAncestors();
    this.sub.add(
      this.router.events
        .pipe(filter((e) => e instanceof NavigationEnd))
        .subscribe(() => this.expandActiveAncestors()),
    );
  }

  ngOnChanges(): void {
    this.buildTree();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  toggleCategory(name: string): void {
    if (this.expandedCats.has(name)) {
      this.expandedCats.delete(name);
    } else {
      this.expandedCats.add(name);
    }
  }

  toggleNode(slug: string): void {
    if (this.expandedNodes.has(slug)) {
      this.expandedNodes.delete(slug);
    } else {
      this.expandedNodes.add(slug);
    }
  }

  isCatOpen(name: string): boolean {
    return this.expandedCats.has(name);
  }

  isNodeOpen(slug: string): boolean {
    return this.expandedNodes.has(slug);
  }

  private sortArticles(list: Article[]): Article[] {
    return [...list].sort(
      (a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.title.localeCompare(b.title, 'id'),
    );
  }

  private buildTree(): void {
    const bySlug = new Map(this.articles.map((a) => [a.slug, a]));
    const childrenOf = new Map<string, Article[]>();
    for (const a of this.articles) {
      if (a.parent && bySlug.has(a.parent)) {
        const list = childrenOf.get(a.parent) ?? [];
        list.push(a);
        childrenOf.set(a.parent, list);
      }
    }
    // Rekursi maksimal 3 tingkat artikel (induk → anak → cucu).
    const buildNode = (article: Article, depth: number): TreeNode => ({
      article,
      children:
        depth >= 3
          ? []
          : this.sortArticles(childrenOf.get(article.slug) ?? []).map((c) =>
              buildNode(c, depth + 1),
            ),
    });
    const roots = this.sortArticles(
      this.articles.filter((a) => !a.parent || !bySlug.has(a.parent)),
    );
    const byCategory = new Map<string, TreeNode[]>();
    for (const root of roots) {
      const list = byCategory.get(root.category) ?? [];
      list.push(buildNode(root, 1));
      byCategory.set(root.category, list);
    }
    const countIn = (nodes: TreeNode[]): number =>
      nodes.reduce((n, node) => n + 1 + countIn(node.children), 0);
    this.groups = [...byCategory.entries()]
      .map(([name, roots]) => ({ name, roots, count: countIn(roots) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    // Saat pertama kali, semua kategori terbuka. Muat ulang berikutnya
    // (mis. setelah sinkronisasi API) hanya membuka kategori yang baru muncul,
    // supaya pilihan lipat pengguna tidak hilang.
    if (!this.catsInitialized) {
      for (const g of this.groups) this.expandedCats.add(g.name);
      this.catsInitialized = true;
    } else {
      for (const g of this.groups) this.expandedCats.add(g.name);
    }
  }

  /** Buka kategori + rantai induk artikel yang sedang dibuka. */
  private expandActiveAncestors(): void {
    const match = this.router.url.match(/^\/article\/([^/?#]+)/);
    if (!match) return;
    const slug = decodeURIComponent(match[1]);
    const bySlug = new Map(this.articles.map((a) => [a.slug, a]));
    const article = bySlug.get(slug);
    if (!article) return;
    this.expandedCats.add(article.category);
    const seen = new Set<string>();
    let cur: Article | undefined = article;
    while (cur?.parent && bySlug.get(cur.parent) && !seen.has(cur.slug)) {
      seen.add(cur.slug);
      this.expandedNodes.add(cur.parent);
      cur = bySlug.get(cur.parent);
    }
  }
}
