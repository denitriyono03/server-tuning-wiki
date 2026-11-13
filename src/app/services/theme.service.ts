import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'stw-theme';

/**
 * Tema terang/gelap. Mode disimpan di localStorage ('stw-theme'); bila belum
 * ada, mengikuti prefers-color-scheme. Mode diterapkan sebagai class `dark`
 * di document.documentElement (lihat styles.scss: html.dark).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme$ = new BehaviorSubject<ThemeMode>(this.readInitialTheme());

  get theme(): ThemeMode {
    return this.theme$.value;
  }

  get isDark(): boolean {
    return this.theme === 'dark';
  }

  constructor() {
    this.applyTheme();
  }

  toggle(): void {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  setTheme(mode: ThemeMode): void {
    this.theme$.next(mode);
    this.applyTheme();
  }

  applyTheme(): void {
    const mode = this.theme$.value;
    document.documentElement.classList.toggle('dark', mode === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage tidak tersedia (mis. mode privat) — tema tetap diterapkan.
    }
  }

  private readInitialTheme(): ThemeMode {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Abaikan — pakai prefers-color-scheme di bawah.
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
