import { Routes } from '@angular/router';
import { HomeComponent } from './home/home';
import { ArticleComponent } from './article/article';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'article/:slug', component: ArticleComponent },
  { path: 'category/:name', component: HomeComponent },
  { path: 'tag/:tag', component: HomeComponent },
  {
    path: 'debug',
    loadComponent: () => import('./debug/debug').then((m) => m.DebugComponent),
  },
  { path: '**', redirectTo: '' },
];
