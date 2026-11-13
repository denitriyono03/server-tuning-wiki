import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ContentService, SyncStatus } from '../services/content.service';
import { HttpLogEntry, HttpLogService } from '../services/http-log.service';

export type KindFilter = 'all' | HttpLogEntry['kind'];

const META_KEY = 'stw-articles-meta-v1';

function toTime(value: number | string | Date): number {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

@Component({
  selector: 'app-debug',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
  ],
  templateUrl: './debug.html',
  styleUrl: './debug.scss',
})
export class DebugComponent implements OnInit {
  content = inject(ContentService);
  httpLog = inject(HttpLogService);

  displayedColumns = ['time', 'method', 'url', 'kind', 'status', 'ms'];

  filterText = '';
  filterKind: KindFilter = 'all';
  private readonly filterText$ = new BehaviorSubject('');
  private readonly filterKind$ = new BehaviorSubject<KindFilter>('all');

  filteredEntries$ = combineLatest([
    this.httpLog.entries$,
    this.filterText$,
    this.filterKind$,
  ]).pipe(
    map(([entries, query, kind]) => {
      const q = query.trim().toLowerCase();
      return entries
        .filter(
          (e) =>
            (kind === 'all' || e.kind === kind) &&
            (!q || e.url.toLowerCase().includes(q)),
        )
        .slice()
        .sort((a, b) => toTime(b.time) - toTime(a.time));
    }),
  );

  cacheVersion = signal<string | null>(null);
  cacheUpdatedAt = signal<string | null>(null);

  ngOnInit(): void {
    this.readCacheMeta();
  }

  onFilterTextChange(value: string): void {
    this.filterText$.next(value);
  }

  onFilterKindChange(value: KindFilter): void {
    this.filterKind$.next(value);
  }

  onRefresh(): void {
    void Promise.resolve(this.content.refreshFromApi()).then(() => this.readCacheMeta());
  }

  onClearCache(): void {
    this.content.clearCache();
    this.readCacheMeta();
  }

  onClearLog(): void {
    this.httpLog.clear();
  }

  formatTime(value: number | string | Date): string {
    const ms = toTime(value);
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  statusClass(status: number | string): string {
    if (status === 'error' || status === 0) return 'status-err';
    if (typeof status === 'number' && status >= 200 && status < 300) return 'status-ok';
    return 'status-warn';
  }

  syncLabel(status: SyncStatus | null): string {
    switch (status) {
      case 'synced':
        return 'Online — data terbaru';
      case 'cached':
        return 'Cache — data tersimpan di perangkat';
      case 'offline':
        return 'Offline — menampilkan data tersimpan';
      case 'bundled':
      default:
        return 'Bundle — data bawaan aplikasi';
    }
  }

  syncIcon(status: SyncStatus | null): string {
    if (status === 'synced') return 'cloud_done';
    if (status === 'offline') return 'cloud_off';
    return 'storage';
  }

  private readCacheMeta(): void {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) {
        this.cacheVersion.set(null);
        this.cacheUpdatedAt.set(null);
        return;
      }
      const meta = JSON.parse(raw) as { version?: string; updatedAt?: string };
      this.cacheVersion.set(meta.version ?? null);
      this.cacheUpdatedAt.set(meta.updatedAt ?? null);
    } catch {
      this.cacheVersion.set(null);
      this.cacheUpdatedAt.set(null);
    }
  }
}
