import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface HttpLogEntry {
  id: number;
  time: string;
  method: string;
  url: string;
  status: number | string;
  ms: number;
  kind: 'meta' | 'articles' | 'bundle' | 'config';
}

const MAX_ENTRIES = 100;

@Injectable({ providedIn: 'root' })
export class HttpLogService {
  private nextId = 1;
  private entriesSubject = new BehaviorSubject<HttpLogEntry[]>([]);
  readonly entries$ = this.entriesSubject.asObservable();

  log(entry: Omit<HttpLogEntry, 'id' | 'time'>): void {
    const full: HttpLogEntry = {
      ...entry,
      id: this.nextId++,
      time: new Date().toISOString(),
    };
    this.entriesSubject.next([full, ...this.entriesSubject.value].slice(0, MAX_ENTRIES));
  }

  clear(): void {
    this.entriesSubject.next([]);
  }
}
