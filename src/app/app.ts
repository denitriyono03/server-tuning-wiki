import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeService } from './services/theme.service';
import { ContentService, SyncStatus } from './services/content.service';
import { NavTreeComponent } from './nav-tree/nav-tree';
import { MenuDialogComponent } from './menu-dialog/menu-dialog';
import { Article, WikiConfig } from './models/article.model';

interface SyncMeta {
  icon: string;
  label: string;
}

/**
 * Shell aplikasi: toolbar atas, sidebar tree (desktop), dialog menu (HP),
 * konten + footer. Tema diterapkan saat boot lewat ThemeService.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatDialogModule,
    NavTreeComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected theme = inject(ThemeService);
  protected content = inject(ContentService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private bp = inject(BreakpointObserver);

  /** Layar lebar (>=1024px): sidebar tetap tampil. Di bawah itu, menu lewat dialog popup. */
  readonly isDesktop = signal(true);

  readonly articles = toSignal(this.content.articles$, { initialValue: [] as Article[] });
  readonly siteConfig = toSignal(this.content.config$, { initialValue: null as WikiConfig | null });
  readonly syncStatus = toSignal(this.content.syncStatus$, { initialValue: 'bundled' as SyncStatus });
  readonly categories = computed(() =>
    [...new Set(this.articles().map((a) => a.category).filter(Boolean))].sort(),
  );
  readonly articleCount = computed(() => this.articles().length);

  constructor() {
    this.theme.applyTheme();
    void this.content.load();
    this.bp.observe('(min-width: 1024px)').subscribe((r) => this.isDesktop.set(r.matches));
  }

  openMenu(): void {
    this.dialog.open(MenuDialogComponent, {
      width: 'min(92vw, 420px)',
      maxHeight: '86vh',
      panelClass: 'stw-menu-dialog',
    });
  }

  openSearch(): void {
    void this.router.navigate(['/']).then(() => {
      setTimeout(() => document.getElementById('search-input')?.focus(), 150);
    });
  }

  syncMeta(status: SyncStatus): SyncMeta {
    switch (status) {
      case 'synced':
        return { icon: 'cloud_done', label: 'Data terbaru' };
      case 'cached':
        return { icon: 'cloud_done', label: 'Data tersimpan' };
      case 'offline':
        return { icon: 'cloud_off', label: 'Offline — data tersimpan' };
      default:
        return { icon: 'cloud_off', label: 'Data bawaan' };
    }
  }
}
