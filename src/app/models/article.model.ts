export interface ArticleBlock {
  type:
    | 'heading'
    | 'paragraph'
    | 'callout'
    | 'code'
    | 'list'
    | 'table'
    | 'quote'
    | 'image'
    | 'divider';
  level?: number;
  text?: string;
  kind?: 'info' | 'tip' | 'warning' | 'danger';
  title?: string;
  language?: string;
  filename?: string;
  code?: string;
  items?: string[];
  ordered?: boolean;
  headers?: string[];
  rows?: string[][];
  cite?: string;
  url?: string;
  caption?: string;
}

export interface Article {
  slug: string;
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  category: string;
  difficulty: 'Pemula' | 'Menengah' | 'Mahir';
  tags: string[];
  author: string;
  dateCreated: string;
  dateUpdated: string;
  parent: string | null;
  order: number;
  related: string[];
  source: { label: string; url: string };
  blocks: ArticleBlock[];
}

export interface WikiConfig {
  siteTitle: string;
  siteSubtitle: string;
  siteDescription: string;
  defaultAuthor: string;
  apiBaseUrl: string;
}
