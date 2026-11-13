import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavTreeComponent } from '../nav-tree/nav-tree';
import { ThemeService } from '../services/theme.service';
import { ContentService } from '../services/content.service';

/**
 * Menu popup TENGAH layar untuk HP: berisi tree navigasi, link HTTP Inspector,
 * dan toggle tema. Menutup sendiri saat navigasi terjadi.
 */
@Component({
  selector: 'app-menu-dialog',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    NavTreeComponent,
  ],
  templateUrl: './menu-dialog.html',
  styleUrl: './menu-dialog.scss',
})
export class MenuDialogComponent {
  private dialogRef = inject(MatDialogRef<MenuDialogComponent>);
  private router = inject(Router);
  protected theme = inject(ThemeService);
  protected content = inject(ContentService);

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.dialogRef.close());
  }

  close(): void {
    this.dialogRef.close();
  }
}
